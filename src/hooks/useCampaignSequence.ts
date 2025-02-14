import { useState, useEffect, useCallback } from 'react';
import type { Campaign } from '../types';
import { campaignSequenceService } from '../services/campaign-sequence.service';

interface SequenceState {
  isGenerating: boolean;
  progress: {
    total: number;
    completed: number;
    percentage: number;
  } | null;
  error: Error | null;
}

export function useCampaignSequence(campaign: Campaign) {
  const [state, setState] = useState<SequenceState>({
    isGenerating: false,
    progress: null,
    error: null
  });

  // Check for ongoing generation on mount
  useEffect(() => {
    const status = campaignSequenceService.getGenerationStatus(campaign.id);
    if (status?.status === 'generating') {
      setState(prev => ({
        ...prev,
        isGenerating: true,
        progress: status.total ? {
          total: status.total,
          completed: status.completed,
          percentage: Math.round((status.completed / status.total) * 100)
        } : null
      }));
    }
  }, [campaign.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (state.isGenerating) {
        // Don't clear storage as generation might still be ongoing
        setState(prev => ({ ...prev, isGenerating: false, progress: null }));
      }
    };
  }, [state.isGenerating]);

  const generateSequence = useCallback(async (startDate: Date) => {
    setState(prev => ({ ...prev, isGenerating: true, error: null }));

    try {
      await campaignSequenceService.generateSequence(
        campaign,
        startDate,
        (progress) => {
          setState(prev => ({
            ...prev,
            progress: progress.total ? {
              total: progress.total,
              completed: progress.completed,
              percentage: Math.round((progress.completed / progress.total) * 100)
            } : null,
            error: progress.error ? new Error(progress.error) : null
          }));
        }
      );
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error('Failed to generate sequence')
      }));
      throw error;
    } finally {
      setState(prev => ({ ...prev, isGenerating: false }));
    }
  }, [campaign]);

  const cancelGeneration = useCallback(() => {
    campaignSequenceService.clearGenerationStatus(campaign.id);
    setState({
      isGenerating: false,
      progress: null,
      error: null
    });
  }, [campaign.id]);

  return {
    isGenerating: state.isGenerating,
    progress: state.progress,
    error: state.error,
    generateSequence,
    cancelGeneration
  };
} 