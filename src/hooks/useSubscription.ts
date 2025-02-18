import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase/client';
import { StripeService } from '../lib/stripe/client';

interface PricingPlan {
  id: string;
  name: string;
  description: string;
  stripe_price_id: string;
  features: {
    adaptive_sequences: boolean;
    auto_responder: boolean;
    lead_scoring: boolean;
  };
  limits: {
    daily_email_limit: number;
    contacts_limit: number;
    campaigns_limit: number | null;
  };
  is_active: boolean;
  sort_order: number;
  is_admin?: boolean;
}

interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  ended_at: string | null;
  trial_start: string | null;
  trial_end: string | null;
  is_admin?: boolean;
  plan?: PricingPlan;
}

interface PaymentMethod {
  id: string;
  user_id: string;
  stripe_payment_method_id: string;
  type: string;
  last_four: string;
  expiry_month: number;
  expiry_year: number;
  is_default: boolean;
}

interface Invoice {
  id: string;
  user_id: string;
  subscription_id: string;
  stripe_invoice_id: string;
  amount_due: number;
  amount_paid: number;
  status: string;
  billing_reason: string;
  invoice_pdf: string | null;
}

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const stripeService = new StripeService();

  useEffect(() => {
    fetchSubscriptionData();
  }, [user]);

  const fetchSubscriptionData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Always fetch active plans, even for unauthenticated users
      const { data: activePlans, error: plansError } = await supabase
        .from('pricing_plans')
        .select('*')
        .eq('is_active', true)
        .eq('is_admin', false) // Don't show admin plans in the list
        .order('sort_order');

      if (plansError) {
        throw plansError;
      }

      setPlans(activePlans);

      // Only fetch user-specific data if authenticated
      if (user) {
        // Fetch subscription with plan details
        const { data: sub, error: subError } = await supabase
          .from('subscriptions')
          .select('*, plan:pricing_plans(*)')
          .eq('user_id', user.id)
          .single();

        if (subError && subError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
          throw subError;
        }

        if (sub) {
          setSubscription(sub);
        }

        // Only fetch payment methods and invoices for non-admin subscriptions
        if (sub && !sub.is_admin) {
          // Fetch payment methods
          const { data: methods, error: methodsError } = await supabase
            .from('payment_methods')
            .select('*')
            .eq('user_id', user.id)
            .order('is_default', { ascending: false });

          if (methodsError) {
            throw methodsError;
          }

          setPaymentMethods(methods);

          // Fetch recent invoices
          const { data: recentInvoices, error: invoicesError } = await supabase
            .from('invoices')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(12);

          if (invoicesError) {
            throw invoicesError;
          }

          setInvoices(recentInvoices);
        } else {
          // Clear payment methods and invoices for admin subscriptions
          setPaymentMethods([]);
          setInvoices([]);
        }
      }
    } catch (err) {
      console.error('Error fetching subscription data:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const createSubscription = async (planId: string, paymentMethodId: string) => {
    try {
      setLoading(true);
      setError(null);

      await stripeService.createSubscription(user!.id, planId, paymentMethodId);
      await fetchSubscriptionData();
    } catch (err) {
      console.error('Error creating subscription:', err);
      setError(err instanceof Error ? err.message : 'Failed to create subscription');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateSubscription = async (newPlanId: string) => {
    try {
      setLoading(true);
      setError(null);

      if (!subscription) {
        throw new Error('No active subscription');
      }

      await stripeService.updateSubscription(
        subscription.stripe_subscription_id,
        newPlanId
      );
      await fetchSubscriptionData();
    } catch (err) {
      console.error('Error updating subscription:', err);
      setError(err instanceof Error ? err.message : 'Failed to update subscription');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const cancelSubscription = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!subscription) {
        throw new Error('No active subscription');
      }

      await stripeService.cancelSubscription(subscription.stripe_subscription_id);
      await fetchSubscriptionData();
    } catch (err) {
      console.error('Error canceling subscription:', err);
      setError(err instanceof Error ? err.message : 'Failed to cancel subscription');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const addPaymentMethod = async (paymentMethodId: string) => {
    try {
      setLoading(true);
      setError(null);

      if (!subscription) {
        throw new Error('No active subscription');
      }

      await stripeService.setDefaultPaymentMethod(
        subscription.stripe_customer_id,
        paymentMethodId
      );
      await fetchSubscriptionData();
    } catch (err) {
      console.error('Error adding payment method:', err);
      setError(err instanceof Error ? err.message : 'Failed to add payment method');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const removePaymentMethod = async (paymentMethodId: string) => {
    try {
      setLoading(true);
      setError(null);

      await stripeService.deletePaymentMethod(paymentMethodId);
      await fetchSubscriptionData();
    } catch (err) {
      console.error('Error removing payment method:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove payment method');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const createSetupIntent = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!subscription) {
        throw new Error('No active subscription');
      }

      return await stripeService.createSetupIntent(subscription.stripe_customer_id);
    } catch (err) {
      console.error('Error creating setup intent:', err);
      setError(err instanceof Error ? err.message : 'Failed to create setup intent');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    subscription,
    plans,
    paymentMethods,
    invoices,
    loading,
    error,
    createSubscription,
    updateSubscription,
    cancelSubscription,
    addPaymentMethod,
    removePaymentMethod,
    createSetupIntent,
    refresh: fetchSubscriptionData
  };
} 