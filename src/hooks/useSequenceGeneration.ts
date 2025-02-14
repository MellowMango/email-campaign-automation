import { useState, useCallback } from 'react';
import type { Campaign } from '../types';
import type { EmailTopic, SequenceType } from '../types/sequence';
import { sequenceService } from '../services/sequence.service';

export function useSequenceGeneration(campaign: Campaign) {
  const [topics, setTopics] = useState<EmailTopic[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const generateTopics = useCallback(async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const generatedTopics = await sequenceService.generateTopics({
        campaign,
        sequenceType: campaign.sequence_type as SequenceType
      });
      setTopics(generatedTopics);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to generate topics');
      setError(error);
      throw error;
    } finally {
      setIsGenerating(false);
    }
  }, [campaign]);

  const saveSequence = useCallback(async () => {
    try {
      await sequenceService.saveSequence(campaign.id, topics);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to save sequence');
      setError(error);
      throw error;
    }
  }, [campaign.id, topics]);

  return {
    topics,
    isGenerating,
    error,
    generateTopics,
    saveSequence
  };
} 