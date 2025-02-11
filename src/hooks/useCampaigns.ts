import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import type { Campaign } from '../lib/supabase/client';
import { useAuth } from '../contexts/AuthContext';

interface CampaignOptions {
  target_audience?: string;
  goals?: string;
  value_proposition?: string;
  email_tone?: string;
  campaign_type?: string;
  duration?: number;
  emails_per_week?: number;
  features?: {
    adaptive_sequences?: boolean;
    auto_responder?: boolean;
    lead_scoring?: boolean;
  };
}

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    
    const fetchCampaigns = async () => {
      try {
        const { data, error } = await supabase
          .from('campaigns')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setCampaigns(data as Campaign[]);
      } catch (e) {
        setError(e as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchCampaigns();

    // Subscribe to changes
    const subscription = supabase
      .channel('campaigns')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'campaigns',
          filter: `user_id=eq.${user.id}`
        }, 
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setCampaigns(prev => [payload.new as Campaign, ...prev]);
          } else if (payload.eventType === 'DELETE') {
            setCampaigns(prev => prev.filter(campaign => campaign.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            setCampaigns(prev => prev.map(campaign => 
              campaign.id === payload.new.id ? payload.new as Campaign : campaign
            ));
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  const createCampaign = async (name: string, description?: string, options?: CampaignOptions) => {
    if (!user) throw new Error('User must be authenticated');
    
    const { data, error } = await supabase
      .from('campaigns')
      .insert([
        { 
          user_id: user.id,
          name,
          description,
          status: 'draft',
          target_audience: options?.target_audience,
          goals: options?.goals,
          value_proposition: options?.value_proposition,
          email_tone: options?.email_tone,
          campaign_type: options?.campaign_type || 'manual',
          duration: options?.duration || 30,
          emails_per_week: options?.emails_per_week || 2,
          features: options?.features || {},
          analytics: {
            sent: 0,
            opened: 0,
            clicked: 0,
            replied: 0
          }
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return data as Campaign;
  };

  const updateCampaign = async (id: string, updates: Partial<Campaign>) => {
    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Campaign;
  };

  const deleteCampaign = async (id: string) => {
    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', id);

    if (error) throw error;
  };

  return {
    campaigns,
    loading,
    error,
    createCampaign,
    updateCampaign,
    deleteCampaign
  };
} 