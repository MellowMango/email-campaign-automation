import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase/client';
import { useSubscription } from './useSubscription';

interface UsageMetrics {
  emails: {
    used: number;
    included: number;
    projected: number;
    additionalCost: number;
  };
  contacts: {
    used: number;
    included: number;
    projected: number;
    additionalCost: number;
  };
  campaigns: {
    used: number;
    included: number;
    projected: number;
    additionalCost: number;
  };
}

export function useUsage() {
  const { user } = useAuth();
  const { subscription } = useSubscription();
  const [usage, setUsage] = useState<UsageMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && subscription) {
      fetchUsageData();
    }
  }, [user, subscription]);

  const fetchUsageData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get current billing period
      const periodStart = new Date(subscription!.current_period_start);
      const periodEnd = new Date(subscription!.current_period_end);

      // Get usage records for current period
      const { data: records, error: recordsError } = await supabase
        .from('usage_records')
        .select('type, quantity')
        .eq('user_id', user!.id)
        .gte('billing_period_start', periodStart.toISOString())
        .lte('billing_period_end', periodEnd.toISOString());

      if (recordsError) throw recordsError;

      // Calculate usage by type
      const usage = {
        emails: { used: 0, included: 0, projected: 0, additionalCost: 0 },
        contacts: { used: 0, included: 0, projected: 0, additionalCost: 0 },
        campaigns: { used: 0, included: 0, projected: 0, additionalCost: 0 }
      };

      // Get plan limits
      const limits = subscription!.plan?.limits || {};
      usage.emails.included = limits.included_emails || 0;
      usage.contacts.included = limits.included_contacts || 0;
      usage.campaigns.included = limits.included_campaigns || 0;

      // Calculate current usage
      records?.forEach(record => {
        switch (record.type) {
          case 'email':
            usage.emails.used += record.quantity;
            break;
          case 'contact':
            usage.contacts.used += record.quantity;
            break;
          case 'campaign':
            usage.campaigns.used += record.quantity;
            break;
        }
      });

      // Calculate projected usage and costs
      const daysInPeriod = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24);
      const daysElapsed = (new Date().getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24);
      const projectionFactor = daysInPeriod / Math.max(daysElapsed, 1);

      usage.emails.projected = Math.round(usage.emails.used * projectionFactor);
      usage.contacts.projected = Math.round(usage.contacts.used * projectionFactor);
      usage.campaigns.projected = Math.round(usage.campaigns.used * projectionFactor);

      // Calculate additional costs
      if (usage.emails.projected > usage.emails.included) {
        usage.emails.additionalCost = 
          (usage.emails.projected - usage.emails.included) * 
          (limits.additional_email_cost || 0);
      }

      if (usage.contacts.projected > usage.contacts.included) {
        usage.contacts.additionalCost = 
          (usage.contacts.projected - usage.contacts.included) * 
          (limits.additional_contact_cost || 0);
      }

      if (usage.campaigns.projected > usage.campaigns.included) {
        usage.campaigns.additionalCost = 
          (usage.campaigns.projected - usage.campaigns.included) * 
          (limits.additional_campaign_cost || 0);
      }

      setUsage(usage);
    } catch (err) {
      console.error('Error fetching usage data:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const checkUsageLimit = async (type: 'email' | 'contact' | 'campaign', quantity = 1) => {
    if (!usage || !subscription?.plan?.limits) return false;

    const currentUsage = usage[`${type}s`].used;
    const limit = subscription.plan.limits[`included_${type}s`];

    // If we're already over limit, require confirmation
    if (currentUsage >= limit) {
      const additionalCost = 
        quantity * subscription.plan.limits[`additional_${type}_cost`];
      
      // Add warning notification
      await supabase.from('notifications').insert({
        user_id: user!.id,
        title: 'Usage Warning',
        message: `You've exceeded your included ${type} limit. Additional charges of $${additionalCost.toFixed(2)} will apply.`,
        type: 'warning',
        status: 'unread'
      });

      return {
        allowed: true,
        warning: true,
        additionalCost
      };
    }

    // If this action would put us over limit, warn but allow
    if (currentUsage + quantity > limit) {
      const overage = (currentUsage + quantity) - limit;
      const additionalCost = 
        overage * subscription.plan.limits[`additional_${type}_cost`];

      // Add warning notification
      await supabase.from('notifications').insert({
        user_id: user!.id,
        title: 'Usage Warning',
        message: `This action will exceed your included ${type} limit. Additional charges of $${additionalCost.toFixed(2)} will apply.`,
        type: 'warning',
        status: 'unread'
      });

      return {
        allowed: true,
        warning: true,
        additionalCost
      };
    }

    return {
      allowed: true,
      warning: false,
      additionalCost: 0
    };
  };

  return {
    usage,
    loading,
    error,
    checkUsageLimit,
    refresh: fetchUsageData
  };
} 