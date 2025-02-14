import type { Campaign } from './index';

export type SequenceType = 'awareness' | 'conversion' | 'nurture';

export interface EmailTopic {
  id?: string;
  date: string;
  topic: string;
  description: string;
  status?: 'draft' | 'scheduled' | 'sent';
}

export interface GeneratedTopic {
  topic: string;
  description: string;
}

export interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export interface GenerationParams {
  campaign: Campaign;
  sequenceType: SequenceType;
}

export interface SequenceStage {
  name: string;
  description: string;
  stages: string[];
}

export const SEQUENCE_TYPES: Record<SequenceType, SequenceStage> = {
  awareness: {
    name: 'Awareness & Education',
    description: 'Focus on educating prospects about their problems and your solutions',
    stages: ['Problem Awareness', 'Solution Education', 'Brand Introduction', 'Value Proposition', 'Social Proof']
  },
  conversion: {
    name: 'Direct Conversion',
    description: 'Focus on converting prospects who are ready to make a decision',
    stages: ['Value Proposition', 'Feature Showcase', 'Case Studies', 'Offer Introduction', 'Call to Action']
  },
  nurture: {
    name: 'Relationship Nurturing',
    description: 'Focus on building long-term relationships through valuable content',
    stages: ['Industry Insights', 'Best Practices', 'Tips & Tricks', 'Success Stories', 'Thought Leadership']
  }
}; 