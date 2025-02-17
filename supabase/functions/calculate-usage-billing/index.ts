import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.12.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2025-01-27.acacia',
  httpClient: Stripe.createFetchHttpClient()
});

serve(async (req) => {
  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    // Get all active subscriptions that need billing calculation
    const { data: subscriptions, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('*, user:user_id(*)')
      .eq('status', 'active')
      .filter('current_period_end', 'lte', new Date().toISOString());

    if (subscriptionError) {
      throw subscriptionError;
    }

    for (const subscription of subscriptions) {
      try {
        // Calculate usage billing
        await supabase.rpc('calculate_usage_billing', {
          p_user_id: subscription.user_id,
          p_subscription_id: subscription.id,
          p_period_start: subscription.current_period_start,
          p_period_end: subscription.current_period_end
        });

        // Get calculated usage billing items
        const { data: billingItems, error: billingError } = await supabase
          .from('usage_billing')
          .select('*')
          .eq('subscription_id', subscription.id)
          .eq('status', 'pending');

        if (billingError) {
          throw billingError;
        }

        // Create Stripe invoice items for each billing item
        for (const item of billingItems) {
          const invoiceItem = await stripe.invoiceItems.create({
            customer: subscription.stripe_customer_id,
            amount: Math.round(item.amount * 100), // Convert to cents
            currency: 'usd',
            description: `${item.type} usage overage (${item.overage} units)`,
            period: {
              start: new Date(item.billing_period_start).getTime() / 1000,
              end: new Date(item.billing_period_end).getTime() / 1000
            },
            metadata: {
              type: item.type,
              quantity: item.quantity,
              base_included: item.base_included,
              overage: item.overage
            }
          });

          // Update billing item with invoice item ID
          await supabase
            .from('usage_billing')
            .update({
              stripe_invoice_item_id: invoiceItem.id,
              status: 'billed'
            })
            .eq('id', item.id);
        }

        // Create and finalize invoice
        const invoice = await stripe.invoices.create({
          customer: subscription.stripe_customer_id,
          auto_advance: true, // Auto-finalize and pay the invoice
          description: `Usage charges for period ${new Date(subscription.current_period_start).toLocaleDateString()} to ${new Date(subscription.current_period_end).toLocaleDateString()}`
        });

        // Add notification for the user
        await supabase.from('notifications').insert({
          user_id: subscription.user_id,
          title: 'Usage Billing',
          message: `Your usage charges for the period have been calculated and will be charged to your card.`,
          type: 'info',
          status: 'unread',
          metadata: {
            action: {
              label: 'View Invoice',
              url: `/settings/billing`
            }
          }
        });

      } catch (err) {
        console.error(`Error processing subscription ${subscription.id}:`, err);
        
        // Add error notification for the user
        await supabase.from('notifications').insert({
          user_id: subscription.user_id,
          title: 'Billing Error',
          message: 'There was an error processing your usage charges. Our team has been notified.',
          type: 'error',
          status: 'unread'
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error in calculate-usage-billing:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}); 