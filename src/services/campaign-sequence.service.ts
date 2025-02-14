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

        // Insert batch of emails
        const { error: insertError } = await supabase
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
  ): Promise<Partial<Email>[]> {
    const emailsToCreate: Partial<Email>[] = [];

    for (let i = batchStart; i < batchEnd; i++) {
      const emailDate = new Date(startDate);
      emailDate.setDate(emailDate.getDate() + i * daysInterval);
      const stageIndex = Math.floor((i / totalEmails) * stages.length);
      const stage = stages[stageIndex];

      const prompt = this.generatePrompt(campaign, i + 1, totalEmails, stage);

      try {
        const { subject, content } = await generateEmailContent(
          prompt,
          campaign.target_audience || 'N/A',
          campaign.email_tone || 'professional',
          campaign.company_name
        );

        emailsToCreate.push({
          campaign_id: campaign.id,
          subject,
          content,
          scheduled_at: emailDate.toISOString(),
          status: 'draft',
          metadata: {
            sequence_type: campaign.sequence_type,
            topic: {
              name: subject,
              description: content.substring(0, 100) + '...',
              stage
            }
          }
        });
      } catch (error) {
        console.error(`Failed to generate email ${i + 1}:`, error);
        throw error;
      }
    }

    return emailsToCreate;
  }

  private generatePrompt(
    campaign: Campaign,
    emailNumber: number,
    totalEmails: number,
    stage: string
  ): string {
    return `Generate content for email ${emailNumber} of ${totalEmails} in the ${campaign.sequence_type} sequence:
Campaign Name: ${campaign.name}
Description: ${campaign.description || 'N/A'}
Target Audience: ${campaign.target_audience || 'N/A'}
Goals: ${campaign.goals || 'N/A'}
Value Proposition: ${campaign.value_proposition || 'N/A'}
Current Stage: ${stage}
CTA Link: ${campaign.cta_links[campaign.sequence_type]}

Requirements:
1. Create a subject line and content that aligns with the current stage (${stage})
2. Focus on the target audience's needs
3. Build progressively towards the campaign goals
4. Maintain a ${campaign.email_tone || 'professional'} tone
5. Include the CTA naturally`;
  }

  private getSequenceStages(sequenceType: Campaign['sequence_type']): string[] {
    const stages = {
      awareness: ['Problem Awareness', 'Solution Education', 'Brand Introduction', 'Value Proposition', 'Social Proof'],
      conversion: ['Value Proposition', 'Feature Showcase', 'Case Studies', 'Offer Introduction', 'Call to Action'],
      nurture: ['Industry Insights', 'Best Practices', 'Tips & Tricks', 'Success Stories', 'Thought Leadership']
    };

    return stages[sequenceType] || stages.awareness;
  }

  private async logAIGeneration(campaignId: string, emails: Partial<Email>[]): Promise<void> {
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