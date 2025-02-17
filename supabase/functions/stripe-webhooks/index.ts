import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.12.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2025-01-27.acacia',
  httpClient: Stripe.createFetchHttpClient()
});

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');

serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Get the signature from headers
    const signature = req.headers.get('stripe-signature');
    if (!signature || !WEBHOOK_SECRET) {
      return new Response('Webhook secret or signature missing', { status: 401 });
    }

    // Get the raw body
    const body = await req.text();

    // Verify webhook signature
    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return new Response('Invalid signature', { status: 401 });
    }

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

    // Handle different event types
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Get user ID from customer metadata
        const customer = await stripe.customers.retrieve(customerId);
        const userId = customer.metadata.userId;

        if (!userId) {
          throw new Error('User ID not found in customer metadata');
        }

        // Get plan ID from price ID
        const { data: plan } = await supabase
          .from('pricing_plans')
          .select('id')
          .eq('stripe_price_id', subscription.items.data[0].price.id)
          .single();

        if (!plan) {
          throw new Error('Plan not found');
        }

        // Update subscription in database
        const { error: subscriptionError } = await supabase
          .from('subscriptions')
          .upsert({
            user_id: userId,
            plan_id: plan.id,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: customerId,
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000),
            current_period_end: new Date(subscription.current_period_end * 1000),
            cancel_at_period_end: subscription.cancel_at_period_end,
            canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
            trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
            trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
          });

        if (subscriptionError) {
          throw subscriptionError;
        }

        // Add notification
        await supabase.from('notifications').insert({
          user_id: userId,
          title: 'Subscription Updated',
          message: `Your subscription has been ${event.type === 'customer.subscription.created' ? 'created' : 'updated'}.`,
          type: 'success',
          status: 'unread'
        });

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;

        // Update subscription in database
        const { error: subscriptionError } = await supabase
          .from('subscriptions')
          .update({
            status: subscription.status,
            ended_at: new Date(subscription.ended_at! * 1000)
          })
          .eq('stripe_subscription_id', subscription.id);

        if (subscriptionError) {
          throw subscriptionError;
        }

        // Get user ID from subscription
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', subscription.id)
          .single();

        if (sub) {
          // Add notification
          await supabase.from('notifications').insert({
            user_id: sub.user_id,
            title: 'Subscription Ended',
            message: 'Your subscription has been cancelled.',
            type: 'info',
            status: 'unread'
          });
        }

        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Get user ID from customer metadata
        const customer = await stripe.customers.retrieve(customerId);
        const userId = customer.metadata.userId;

        if (!userId) {
          throw new Error('User ID not found in customer metadata');
        }

        // Get subscription ID
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (!subscription) {
          throw new Error('Subscription not found');
        }

        // Store invoice in database
        const { error: invoiceError } = await supabase
          .from('invoices')
          .insert({
            user_id: userId,
            subscription_id: subscription.id,
            stripe_invoice_id: invoice.id,
            amount_due: invoice.amount_due,
            amount_paid: invoice.amount_paid,
            status: invoice.status,
            billing_reason: invoice.billing_reason,
            invoice_pdf: invoice.invoice_pdf
          });

        if (invoiceError) {
          throw invoiceError;
        }

        // Add notification
        await supabase.from('notifications').insert({
          user_id: userId,
          title: 'Payment Successful',
          message: `Payment of $${(invoice.amount_paid / 100).toFixed(2)} has been processed successfully.`,
          type: 'success',
          status: 'unread'
        });

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Get user ID from customer metadata
        const customer = await stripe.customers.retrieve(customerId);
        const userId = customer.metadata.userId;

        if (!userId) {
          throw new Error('User ID not found in customer metadata');
        }

        // Add notification
        await supabase.from('notifications').insert({
          user_id: userId,
          title: 'Payment Failed',
          message: 'Your latest payment has failed. Please update your payment method.',
          type: 'error',
          status: 'unread',
          metadata: {
            action: {
              label: 'Update Payment Method',
              url: '/settings/billing'
            }
          }
        });

        break;
      }

      case 'customer.source.expiring': {
        const card = event.data.object as Stripe.Card;
        const customerId = card.customer as string;

        // Get user ID from customer metadata
        const customer = await stripe.customers.retrieve(customerId);
        const userId = customer.metadata.userId;

        if (!userId) {
          throw new Error('User ID not found in customer metadata');
        }

        // Add notification
        await supabase.from('notifications').insert({
          user_id: userId,
          title: 'Card Expiring Soon',
          message: `Your card ending in ${card.last4} is expiring soon. Please update your payment method.`,
          type: 'warning',
          status: 'unread',
          metadata: {
            action: {
              label: 'Update Payment Method',
              url: '/settings/billing'
            }
          }
        });

        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}); 