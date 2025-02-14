import { supabase } from '../lib/supabase/client';
import type { Campaign } from '../types';
import type { EmailTopic, GenerationParams, OpenAIResponse, GeneratedTopic } from '../types/sequence';

class SequenceService {
  private static instance: SequenceService;
  private readonly OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
  private readonly OPENAI_MODEL = 'gpt-4-turbo-preview';
  private readonly TIMEOUT = 30000;

  private constructor() {}

  static getInstance(): SequenceService {
    if (!this.instance) {
      this.instance = new SequenceService();
    }
    return this.instance;
  }

  async generateTopics({ campaign, sequenceType }: GenerationParams): Promise<EmailTopic[]> {
    try {
      const response = await Promise.race([
        fetch(this.OPENAI_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: this.OPENAI_MODEL,
            messages: [
              {
                role: 'system',
                content: `You are an expert email marketing strategist. Generate a sequence of ${Math.floor(campaign.duration / 7 * campaign.emails_per_week)} emails.
Return a JSON array of objects, each with 'topic' and 'description' fields.
Example:
[
  {
    "topic": "Understanding Your Market Challenges",
    "description": "Explore common pain points in the industry and their impact on business growth"
  }
]`
              },
              {
                role: 'user',
                content: `Create a ${sequenceType} email sequence for:

Campaign Details:
Name: ${campaign.name}
Description: ${campaign.description || 'N/A'}
Target Audience: ${campaign.target_audience || 'N/A'}
Goals: ${campaign.goals || 'N/A'}
Value Proposition: ${campaign.value_proposition || 'N/A'}
Email Tone: ${campaign.email_tone || 'professional'}

Requirements:
- Each email should align with the sequence stages
- Maintain ${campaign.email_tone || 'professional'} tone throughout
- Focus on the target audience's needs
- Build progressively towards the campaign goals
- Keep content focused and actionable

Return the JSON array of email topics and descriptions.`
              }
            ],
            temperature: 0.7,
            max_tokens: 2000
          }),
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timed out')), this.TIMEOUT)
        )
      ]) as Response;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to generate topics');
      }

      const data = await response.json() as OpenAIResponse;
      const content = data.choices[0].message.content;
      
      // Parse and validate the response
      const generatedTopics = this.parseTopics(content);
      return this.scheduleTopics(generatedTopics, campaign);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async saveSequence(campaignId: string, topics: EmailTopic[]): Promise<void> {
    try {
      const { error } = await supabase
        .from('emails')
        .insert(
          topics.map(topic => ({
            campaign_id: campaignId,
            subject: topic.topic,
            content: topic.description,
            scheduled_at: new Date(topic.date).toISOString(),
            status: 'pending',
            metadata: {
              topic: {
                name: topic.topic,
                description: topic.description
              }
            }
          }))
        );

      if (error) throw error;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private parseTopics(content: string): GeneratedTopic[] {
    try {
      const jsonContent = content.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(jsonContent);
      
      const topics = Array.isArray(parsed) ? parsed : parsed.topics;
      
      if (!Array.isArray(topics) || !topics.length) {
        throw new Error('Invalid or empty topics array');
      }

      if (!topics.every(topic => 
        typeof topic === 'object' && 
        typeof topic.topic === 'string' && 
        typeof topic.description === 'string'
      )) {
        throw new Error('Invalid topic format');
      }

      return topics;
    } catch (error) {
      throw new Error('Failed to parse AI response');
    }
  }

  private scheduleTopics(topics: GeneratedTopic[], campaign: Campaign): EmailTopic[] {
    const startDate = new Date();
    const totalEmails = Math.floor(campaign.duration / 7 * campaign.emails_per_week);
    const daysInterval = Math.floor(campaign.duration / totalEmails);

    return topics.slice(0, totalEmails).map((topic, index) => ({
      date: new Date(startDate.getTime() + index * daysInterval * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0],
      topic: topic.topic,
      description: topic.description,
      status: 'draft'
    }));
  }

  private handleError(error: unknown): Error {
    console.error('Sequence service error:', error);
    return error instanceof Error ? error : new Error('An unexpected error occurred');
  }
}

export const sequenceService = SequenceService.getInstance(); 