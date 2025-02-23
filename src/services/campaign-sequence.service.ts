import { supabase, supabaseAdmin } from '../lib/supabase/client';
import { generateEmailContent } from '../lib/openai';
import type { Campaign, Email } from '../types';

interface SequenceProgress {
  total: number;
  completed: number;
  status: 'pending' | 'generating' | 'completed' | 'error';
  error?: string;
}

interface NotificationOptions {
  action?: {
    label: string;
    url: string;
  };
}

interface EmailMetadata {
  sequence_type: Campaign['sequence_type'];
  topic: {
    name: string;
    description: string;
    stage: string;
    previous_context?: Array<{
      subject: string;
      summary: string;
      stage: string;
    }>;
    stage_metrics?: {
      position: number;
      successful_patterns: Array<{
        subject_pattern: string;
        content_summary: string;
        engagement_metrics: Record<string, number>;
      }>;
    };
  };
}

interface EmailContext {
  subject: string;
  summary: string;
  stage: string;
  engagement: Record<string, number>;
  scheduled_at: string;
  status: CampaignEmail['status'];
}

interface GenerationContextData {
  recentEmails: EmailContext[];
  stageEmails: EmailContext[];
  successfulPatterns: Record<string, Array<{
    subject_pattern: string;
    content_summary: string;
    engagement_metrics: Record<string, number>;
  }>>;
  campaignMetrics: Record<string, any>;
  currentStageProgress: {
    current: number;
    total: number;
    percentage: number;
  };
}

interface CampaignEmail {
  id: string;
  campaign_id: string;
  subject: string;
  content: string;
  scheduled_at: string;
  status: 'draft' | 'pending' | 'ready' | 'sent' | 'failed';
  metadata: EmailMetadata;
}

class CampaignSequenceService {
  private static instance: CampaignSequenceService;
  private readonly BATCH_SIZE = 5;
  private readonly STORAGE_KEY_PREFIX = 'sequence_generation_';

  private constructor() {}

  static getInstance(): CampaignSequenceService {
    if (!this.instance) {
      this.instance = new CampaignSequenceService();
    }
    return this.instance;
  }

  async generateSequence(
    campaign: Campaign,
    startDate: Date,
    onProgress?: (progress: SequenceProgress) => void
  ): Promise<void> {
    const storageKey = this.STORAGE_KEY_PREFIX + campaign.id;
    
    try {
      // Verify campaign ownership using service role client
      if (!supabaseAdmin) {
        throw new Error('Service role client not available');
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: campaignData, error: campaignError } = await supabaseAdmin
        .from('campaigns')
        .select('id, user_id')
        .eq('id', campaign.id)
        .single();

      if (campaignError || !campaignData) {
        throw new Error('Campaign not found');
      }

      if (campaignData.user_id !== user.id) {
        throw new Error('Access denied');
      }

      // Store generation status
      localStorage.setItem(storageKey, JSON.stringify({ status: 'generating' }));
      
      // Initial notification
      await this.notifyUser(
        `Generating Sequence for "${campaign.name}"`,
        'Your email sequence is being generated in the background. You can leave this page and check back later.',
        'info',
        campaign.user_id
      );

      const totalEmails = Math.floor((campaign.duration / 7) * campaign.emails_per_week);
      const daysInterval = Math.floor(campaign.duration / totalEmails);
      const stages = this.getSequenceStages(campaign.sequence_type);
      const totalBatches = Math.ceil(totalEmails / this.BATCH_SIZE);

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const batchStart = batchIndex * this.BATCH_SIZE;
        const batchEnd = Math.min(batchStart + this.BATCH_SIZE, totalEmails);
        const emailsToCreate = await this.generateBatch(
          campaign,
          startDate,
          batchStart,
          batchEnd,
          daysInterval,
          stages,
          totalEmails
        );

        // Insert batch of emails using service role client
        const { error: insertError } = await supabaseAdmin
          .from('emails')
          .insert(emailsToCreate);

        if (insertError) throw insertError;

        // Log AI generation
        await this.logAIGeneration(campaign.id, emailsToCreate);

        // Update progress
        const progress = Math.round(((batchIndex + 1) / totalBatches) * 100);
        onProgress?.({
          total: totalEmails,
          completed: batchEnd,
          status: 'generating'
        });

        // Notify progress
        await this.notifyUser(
          'Sequence Generation Progress',
          `Generated ${batchEnd} of ${totalEmails} emails (${progress}% complete)`,
          'info',
          campaign.user_id
        );
      }

      // Final success notification
      await this.notifyUser(
        `Sequence Generation Complete for "${campaign.name}"`,
        `Successfully generated ${totalEmails} emails for your campaign.`,
        'success',
        campaign.user_id,
        {
          action: {
            label: 'View Generated Sequence',
            url: `/campaign/${campaign.id}?tab=emails`
          }
        }
      );

      // Clear generation status
      localStorage.removeItem(storageKey);
      
      onProgress?.({
        total: totalEmails,
        completed: totalEmails,
        status: 'completed'
      });

    } catch (error) {
      console.error('Sequence generation error:', error);
      
      // Error notification
      await this.notifyUser(
        'Sequence Generation Error',
        'There was an error generating your email sequence. Please try again.',
        'error',
        campaign.user_id
      );

      // Clear generation status
      localStorage.removeItem(storageKey);
      
      onProgress?.({
        total: 0,
        completed: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'An unexpected error occurred'
      });

      throw error;
    }
  }

  private async generateBatch(
    campaign: Campaign,
    startDate: Date,
    batchStart: number,
    batchEnd: number,
    daysInterval: number,
    stages: string[],
    totalEmails: number
  ): Promise<Partial<CampaignEmail>[]> {
    const emailsToCreate: Partial<CampaignEmail>[] = [];
    
    if (!supabaseAdmin) {
      throw new Error('Service role client not available');
    }

    try {
      console.log('Fetching campaign context for ID:', campaign.id);
      
      // Fetch comprehensive campaign context
      const { data: campaignData, error: contextError } = await supabaseAdmin
        .from('campaigns')
        .select(`
          id,
          name,
          description,
          target_audience,
          goals,
          value_proposition,
          sequence_type,
          cta_links,
          analytics,
          created_at,
          updated_at,
          user_id,
          status,
          duration,
          emails_per_week,
          email_tone,
          campaign_type,
          features
        `)
        .eq('id', campaign.id)
        .single();

      if (contextError) {
        console.error('Campaign context fetch error:', contextError);
        throw new Error(`Failed to fetch campaign context: ${contextError.message}`);
      }

      if (!campaignData) {
        console.error('No campaign data found for ID:', campaign.id);
        throw new Error('Campaign data not found');
      }

      console.log('Successfully fetched campaign data:', {
        id: campaignData.id,
        name: campaignData.name,
        sequence_type: campaignData.sequence_type
      });

      // Cast to Campaign type with default values for potentially missing fields
      const campaignContext: Campaign = {
        ...campaignData,
        campaign_type: campaignData.campaign_type || 'standard',
        features: campaignData.features || []
      };

      // Verify essential fields are present and have values
      if (!campaignContext.name) {
        throw new Error('Campaign name is required');
      }
      if (!campaignContext.sequence_type) {
        throw new Error('Sequence type is required');
      }
      if (!campaignContext.target_audience) {
        throw new Error('Target audience is required');
      }
      if (!campaignContext.goals) {
        throw new Error('Campaign goals are required');
      }
      if (!campaignContext.value_proposition) {
        throw new Error('Value proposition is required');
      }
      if (!campaignContext.cta_links || Object.keys(campaignContext.cta_links).length === 0) {
        throw new Error('CTA links are required');
      }

      // Fetch all previous emails for better context
      const { data: previousEmails, error: emailsError } = await supabaseAdmin
        .from('emails')
        .select(`
          id,
          subject,
          content,
          metadata,
          scheduled_at,
          status,
          analytics:email_events(
            event_type,
            created_at
          )
        `)
        .eq('campaign_id', campaign.id)
        .order('scheduled_at', { ascending: true });

      if (emailsError) {
        console.error('Failed to fetch previous emails:', emailsError);
        throw new Error('Failed to fetch previous emails');
      }

      // Process email context with engagement metrics
      const emailContext = (previousEmails || []).map(email => {
        const engagement = email.analytics?.reduce((acc, event) => {
          acc[event.event_type] = (acc[event.event_type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>) || {};

        return {
          subject: email.subject,
          summary: email.content.substring(0, 200) + '...',
          stage: email.metadata?.topic?.stage,
          engagement,
          scheduled_at: email.scheduled_at,
          status: email.status
        };
      });

      // Get successful content patterns
      const successfulPatterns = this.analyzeSuccessfulPatterns(emailContext);

      for (let i = batchStart; i < batchEnd; i++) {
        const emailDate = new Date(startDate);
        emailDate.setDate(emailDate.getDate() + i * daysInterval);
        const stageIndex = Math.floor((i / totalEmails) * stages.length);
        const stage = stages[stageIndex];

        // Get enhanced context for generation
        const contextData: GenerationContextData = {
          recentEmails: emailContext.slice(-2),
          stageEmails: emailContext.filter(e => e.stage === stage),
          successfulPatterns,
          campaignMetrics: campaignContext.analytics || {},
          currentStageProgress: this.calculateStageProgress(i, totalEmails, stage, stages)
        };

        const prompt = this.generatePrompt(
          campaignContext,
          i + 1,
          totalEmails,
          stage,
          contextData
        );

        try {
          const { subject, content } = await generateEmailContent(
            prompt,
            campaignContext.target_audience || 'N/A',
            campaignContext.email_tone || 'professional',
            campaign.company_name
          );

          const newEmail: Partial<CampaignEmail> = {
            campaign_id: campaign.id,
            subject,
            content,
            scheduled_at: emailDate.toISOString(),
            status: 'draft' as const,
            metadata: {
              sequence_type: campaign.sequence_type,
              topic: {
                name: subject,
                description: content.substring(0, 100) + '...',
                stage,
                previous_context: contextData.recentEmails,
                stage_metrics: {
                  position: contextData.currentStageProgress.percentage,
                  successful_patterns: successfulPatterns[stage] || []
                }
              }
            }
          };

          emailsToCreate.push(newEmail);
          
          // Update context for next generation
          if (newEmail.content && newEmail.metadata?.topic) {
            emailContext.push({
              subject: newEmail.subject || '',
              summary: newEmail.content.substring(0, 200) + '...',
              stage: newEmail.metadata.topic.stage,
              engagement: {},
              scheduled_at: newEmail.scheduled_at || '',
              status: newEmail.status || 'draft'
            });
          }
        } catch (error) {
          console.error(`Failed to generate email ${i + 1}:`, error);
          throw error;
        }
      }

      return emailsToCreate;
    } catch (error) {
      console.error('Error in generateBatch:', error);
      throw error;
    }
  }

  private analyzeSuccessfulPatterns(emailContext: Array<any>): Record<string, any[]> {
    const patterns: Record<string, any[]> = {};
    
    emailContext.forEach(email => {
      const { stage, engagement, subject, summary } = email;
      if (!stage) return;

      // Consider an email successful if it has above-average engagement
      const isSuccessful = engagement.opened > 0.2 || engagement.clicked > 0.1;
      
      if (isSuccessful) {
        if (!patterns[stage]) patterns[stage] = [];
        patterns[stage].push({
          subject_pattern: this.extractPattern(subject),
          content_summary: summary,
          engagement_metrics: engagement
        });
      }
    });

    return patterns;
  }

  private extractPattern(subject: string): string {
    // Extract key patterns from successful subject lines
    return subject
      .replace(/[0-9]+/g, '#')
      .replace(/[A-Za-z]+/g, (word) => 
        word.length > 3 ? '[word]' : word
      );
  }

  private calculateStageProgress(
    emailNumber: number,
    totalEmails: number,
    currentStage: string,
    stages: string[]
  ): { current: number; total: number; percentage: number } {
    const emailsPerStage = Math.ceil(totalEmails / stages.length);
    const stageIndex = stages.indexOf(currentStage);
    const stageStart = stageIndex * emailsPerStage;
    const stagePosition = emailNumber - stageStart;

    return {
      current: stagePosition + 1,
      total: emailsPerStage,
      percentage: Math.round((stagePosition / emailsPerStage) * 100)
    };
  }

  private generatePrompt(
    campaign: Campaign,
    emailNumber: number,
    totalEmails: number,
    stage: string,
    contextData: GenerationContextData
  ): string {
    const progress = (emailNumber / totalEmails) * 100;
    const isFirstEmail = emailNumber === 1;
    const isLastEmail = emailNumber === totalEmails;
    const stageTransition = this.isStageTransition(emailNumber, totalEmails, stage);

    const previousEmailsContext = contextData.recentEmails.map((email: EmailContext, index: number) => 
      `Previous Email ${index + 1}:
       Subject: ${email.subject}
       Stage: ${email.stage}
       Summary: ${email.summary}
       Engagement: ${Object.entries(email.engagement)
         .map(([type, count]) => `${type}: ${count}`)
         .join(', ')}`
    ).join('\n\n');

    const successfulPatternsContext = contextData.successfulPatterns[stage]?.map((pattern, index) => 
      `Pattern ${index + 1}:
       Subject Pattern: ${pattern.subject_pattern}
       Content Theme: ${pattern.content_summary}
       Engagement: ${Object.entries(pattern.engagement_metrics)
         .map(([type, count]) => `${type}: ${count}`)
         .join(', ')}`
    ).join('\n\n') || 'No successful patterns yet for this stage';

    const stageProgress = contextData.currentStageProgress;

    return `Generate content for email ${emailNumber} of ${totalEmails} in the ${campaign.sequence_type} sequence:
Campaign Name: ${campaign.name}
Description: ${campaign.description || 'N/A'}
Target Audience: ${campaign.target_audience || 'N/A'}
Goals: ${campaign.goals || 'N/A'}
Value Proposition: ${campaign.value_proposition || 'N/A'}
Current Stage: ${stage}
Stage Progress: ${stageProgress.current} of ${stageProgress.total} (${stageProgress.percentage}%)
Overall Progress: ${Math.round(progress)}%
CTA Link: ${campaign.cta_links[campaign.sequence_type]}

Previous Context:
${previousEmailsContext || 'No previous emails in sequence'}

Successful Patterns:
${successfulPatternsContext}

Email Position Context:
${isFirstEmail ? '- This is the first email in the sequence. Introduce the core concept and set expectations.' : ''}
${isLastEmail ? '- This is the final email. Create a strong conclusion and clear call to action.' : ''}
${stageTransition ? '- This email transitions to a new stage. Bridge the previous content with the new focus.' : ''}
- Current stage (${stage}) focuses on: ${this.getStageDescription(campaign.sequence_type, stage)}

Narrative Requirements:
1. Create a subject line and content that:
   - Builds directly on the themes/topics from previous emails
   - Maintains consistent messaging while advancing the narrative
   - Uses natural transitions from previous content
   - Aligns with the current stage (${stage})
   - Incorporates successful patterns from similar emails
2. Ensure Content Flow:
   - Reference relevant points from previous emails
   - Develop ideas progressively
   - Maintain narrative continuity
   - Use proven engagement patterns
3. Audience Engagement:
   - Address target audience's specific needs and pain points
   - Progress naturally towards campaign goals
   - Maintain ${campaign.email_tone || 'professional'} tone
   - Focus on elements that drove previous engagement
4. Call to Action:
   - Build on previous value propositions
   - Include CTA contextually
   - Create natural progression to next stage
5. Keep the message focused and actionable while connecting to the broader sequence narrative

Format Requirements:
1. Subject Line: Clear, compelling, and aligned with successful patterns
2. Opening: Strong hook that builds on previous context
3. Body: Well-structured paragraphs with clear value propositions
4. CTA: Natural placement within the narrative
5. Closing: Professional signature with complete contact information`;
  }

  private isStageTransition(emailNumber: number, totalEmails: number, currentStage: string): boolean {
    const stages = this.getSequenceStages('awareness'); // Default to awareness stages if type not available
    const emailsPerStage = Math.ceil(totalEmails / stages.length);
    return emailNumber % emailsPerStage === 1 && emailNumber !== 1;
  }

  private getStageDescription(sequenceType: Campaign['sequence_type'], stage: string): string {
    const descriptions: Record<string, Record<string, string>> = {
      awareness: {
        'Problem Awareness': 'Identifying and empathizing with the audience\'s challenges',
        'Solution Education': 'Introducing potential solutions to their problems',
        'Brand Introduction': 'Presenting our unique approach and capabilities',
        'Value Proposition': 'Demonstrating the specific benefits we offer',
        'Social Proof': 'Sharing success stories and testimonials'
      },
      conversion: {
        'Value Proposition': 'Highlighting our unique value and benefits',
        'Feature Showcase': 'Detailing key features and their practical applications',
        'Case Studies': 'Presenting real-world success stories',
        'Offer Introduction': 'Presenting our specific offer and its value',
        'Call to Action': 'Creating urgency and encouraging decision-making'
      },
      nurture: {
        'Industry Insights': 'Sharing valuable industry knowledge and trends',
        'Best Practices': 'Providing actionable best practices and strategies',
        'Tips & Tricks': 'Offering practical advice and implementation tips',
        'Success Stories': 'Showcasing successful implementations and results',
        'Thought Leadership': 'Presenting innovative ideas and future perspectives'
      }
    };

    return descriptions[sequenceType]?.[stage] || 'Moving the audience through the sequence journey';
  }

  private getSequenceStages(sequenceType: Campaign['sequence_type']): string[] {
    const stages = {
      awareness: ['Problem Awareness', 'Solution Education', 'Brand Introduction', 'Value Proposition', 'Social Proof'],
      conversion: ['Value Proposition', 'Feature Showcase', 'Case Studies', 'Offer Introduction', 'Call to Action'],
      nurture: ['Industry Insights', 'Best Practices', 'Tips & Tricks', 'Success Stories', 'Thought Leadership']
    };

    return stages[sequenceType] || stages.awareness;
  }

  private async logAIGeneration(campaignId: string, emails: Partial<CampaignEmail>[]): Promise<void> {
    try {
      const { error: logError } = await supabase
        .from('ai_logs')
        .insert(
          emails.map(email => ({
            campaign_id: campaignId,
            prompt: email.metadata?.topic?.description || '',
            response: `Subject: ${email.subject}\nContent: ${email.content}`,
            model: 'gpt-4-turbo-preview'
          }))
        );

      if (logError) console.error('Failed to log AI generation:', logError);
    } catch (error) {
      console.error('Error logging AI generation:', error);
      // Don't throw - this is non-critical
    }
  }

  private async notifyUser(
    title: string,
    message: string,
    type: 'info' | 'success' | 'error' = 'info',
    user_id: string,
    options?: { action?: { label: string; url: string } }
  ): Promise<void> {
    if (!supabaseAdmin) {
      console.error('Service role client not available');
      return;
    }

    try {
      const { error: notificationError } = await supabaseAdmin
        .from('notifications')
        .insert({
          user_id,
          title,
          message,
          type,
          status: 'unread',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: options?.action ? { action: options.action } : undefined
        });

      if (notificationError) {
        console.error('Notification error:', notificationError);
      }
    } catch (err) {
      console.error('Notification insert error:', err);
    }
  }

  getGenerationStatus(campaignId: string): SequenceProgress | null {
    const stored = localStorage.getItem(this.STORAGE_KEY_PREFIX + campaignId);
    return stored ? JSON.parse(stored) : null;
  }

  clearGenerationStatus(campaignId: string): void {
    localStorage.removeItem(this.STORAGE_KEY_PREFIX + campaignId);
  }
}

export const campaignSequenceService = CampaignSequenceService.getInstance(); 