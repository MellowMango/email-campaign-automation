import Stripe from 'stripe';
import { supabase } from '../supabase/client';

export class StripeService {
  private stripe: Stripe;
  private readonly STRIPE_PUBLIC_KEY = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
  private readonly STRIPE_SECRET_KEY = import.meta.env.VITE_STRIPE_SECRET_KEY;

  constructor() {
    if (!this.STRIPE_SECRET_KEY) {
      throw new Error('Stripe secret key is required');
    }
    this.stripe = new Stripe(this.STRIPE_SECRET_KEY, {
      apiVersion: '2025-01-27.acacia'
    });
  }

  /**
   * Create or update a Stripe customer
   */
  async getOrCreateCustomer(userId: string, email: string): Promise<string> {
    try {
      // Check if customer already exists
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', userId)
        .single();

      if (subscription?.stripe_customer_id) {
        return subscription.stripe_customer_id;
      }

      // Create new customer
      const customer = await this.stripe.customers.create({
        email,
        metadata: {
          userId
        }
      });

      return customer.id;
    } catch (error) {
      console.error('Error in getOrCreateCustomer:', error);
      throw error;
    }
  }

  /**
   * Create a subscription for a customer
   */
  async createSubscription(
    userId: string,
    planId: string,
    paymentMethodId: string
  ): Promise<Stripe.Subscription> {
    try {
      // Get the plan details
      const { data: plan } = await supabase
        .from('pricing_plans')
        .select('*')
        .eq('id', planId)
        .single();

      if (!plan) {
        throw new Error('Plan not found');
      }

      // Get or create customer
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .single();

      if (!profile?.email) {
        throw new Error('User email not found');
      }

      const customerId = await this.getOrCreateCustomer(userId, profile.email);

      // Attach payment method to customer
      await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId
      });

      // Set as default payment method
      await this.stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });

      // Create the subscription
      const subscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: plan.stripe_price_id }],
        payment_settings: {
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription'
        },
        expand: ['latest_invoice.payment_intent']
      });

      // Store subscription in database
      const { error: subscriptionError } = await supabase
        .from('subscriptions')
        .upsert({
          user_id: userId,
          plan_id: planId,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: customerId,
          status: subscription.status,
          current_period_start: new Date(subscription.current_period_start * 1000),
          current_period_end: new Date(subscription.current_period_end * 1000),
          trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
          trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
        });

      if (subscriptionError) {
        throw subscriptionError;
      }

      // Store payment method
      const paymentMethod = await this.stripe.paymentMethods.retrieve(paymentMethodId);
      if (paymentMethod.card) {
        const { error: paymentMethodError } = await supabase
          .from('payment_methods')
          .upsert({
            user_id: userId,
            stripe_payment_method_id: paymentMethodId,
            type: paymentMethod.type,
            last_four: paymentMethod.card.last4,
            expiry_month: paymentMethod.card.exp_month,
            expiry_year: paymentMethod.card.exp_year,
            is_default: true
          });

        if (paymentMethodError) {
          throw paymentMethodError;
        }
      }

      return subscription;
    } catch (error) {
      console.error('Error in createSubscription:', error);
      throw error;
    }
  }

  /**
   * Cancel a subscription at period end
   */
  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true
      });

      // Update subscription in database
      const { error } = await supabase
        .from('subscriptions')
        .update({
          cancel_at_period_end: true,
          canceled_at: new Date()
        })
        .eq('stripe_subscription_id', subscriptionId);

      if (error) {
        throw error;
      }

      return subscription;
    } catch (error) {
      console.error('Error in cancelSubscription:', error);
      throw error;
    }
  }

  /**
   * Update subscription to a new plan
   */
  async updateSubscription(
    subscriptionId: string,
    newPlanId: string
  ): Promise<Stripe.Subscription> {
    try {
      // Get the new plan details
      const { data: plan } = await supabase
        .from('pricing_plans')
        .select('*')
        .eq('id', newPlanId)
        .single();

      if (!plan) {
        throw new Error('Plan not found');
      }

      // Get current subscription
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);

      // Update the subscription
      const updatedSubscription = await this.stripe.subscriptions.update(
        subscriptionId,
        {
          items: [{
            id: subscription.items.data[0].id,
            price: plan.stripe_price_id
          }],
          proration_behavior: 'always_invoice'
        }
      );

      // Update subscription in database
      const { error } = await supabase
        .from('subscriptions')
        .update({
          plan_id: newPlanId,
          current_period_start: new Date(updatedSubscription.current_period_start * 1000),
          current_period_end: new Date(updatedSubscription.current_period_end * 1000)
        })
        .eq('stripe_subscription_id', subscriptionId);

      if (error) {
        throw error;
      }

      return updatedSubscription;
    } catch (error) {
      console.error('Error in updateSubscription:', error);
      throw error;
    }
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      console.error('Error in getSubscription:', error);
      throw error;
    }
  }

  /**
   * Get customer's payment methods
   */
  async getPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card'
      });
      return paymentMethods.data;
    } catch (error) {
      console.error('Error in getPaymentMethods:', error);
      throw error;
    }
  }

  /**
   * Create a setup intent for adding a new payment method
   */
  async createSetupIntent(customerId: string): Promise<Stripe.SetupIntent> {
    try {
      return await this.stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card']
      });
    } catch (error) {
      console.error('Error in createSetupIntent:', error);
      throw error;
    }
  }

  /**
   * Delete a payment method
   */
  async deletePaymentMethod(paymentMethodId: string): Promise<void> {
    try {
      await this.stripe.paymentMethods.detach(paymentMethodId);
      
      // Remove from database
      const { error } = await supabase
        .from('payment_methods')
        .delete()
        .eq('stripe_payment_method_id', paymentMethodId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error in deletePaymentMethod:', error);
      throw error;
    }
  }

  /**
   * Set default payment method
   */
  async setDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string
  ): Promise<void> {
    try {
      await this.stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });

      // Update in database
      const { error: updateError } = await supabase
        .from('payment_methods')
        .update({ is_default: false })
        .eq('stripe_customer_id', customerId);

      if (updateError) {
        throw updateError;
      }

      const { error: setDefaultError } = await supabase
        .from('payment_methods')
        .update({ is_default: true })
        .eq('stripe_payment_method_id', paymentMethodId);

      if (setDefaultError) {
        throw setDefaultError;
      }
    } catch (error) {
      console.error('Error in setDefaultPaymentMethod:', error);
      throw error;
    }
  }
} 