import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSubscription } from '../hooks/useSubscription';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/shadcn/Button';
import { Card } from '../components/shadcn/Card';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

function CheckoutForm({ planId, onSuccess }: { planId: string; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const { createSubscription } = useSubscription();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      const { paymentMethod, error: stripeError } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement
      });

      if (stripeError) {
        throw stripeError;
      }

      if (!paymentMethod) {
        throw new Error('Failed to create payment method');
      }

      await createSubscription(planId, paymentMethod.id);
      onSuccess();
    } catch (err) {
      console.error('Payment error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#ffffff',
                '::placeholder': {
                  color: '#aab7c4'
                }
              },
              invalid: {
                color: '#fa755a',
                iconColor: '#fa755a'
              }
            }
          }}
        />
      </div>
      {error && (
        <div className="text-red-500 text-sm mb-4">
          {error}
        </div>
      )}
      <Button
        type="submit"
        disabled={!stripe || processing}
        className="w-full"
      >
        {processing ? 'Processing...' : 'Subscribe'}
      </Button>
    </form>
  );
}

export default function Pricing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { plans, subscription, loading, error } = useSubscription();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const handleSuccess = () => {
    navigate('/dashboard');
  };

  const handleGetStarted = () => {
    if (!user) {
      navigate('/auth');
      return;
    }
    setSelectedPlan(plans[0]?.id);
  };

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-white">Loading pricing plans...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Simple, Usage-Based Pricing
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto">
          Start with our affordable base plan and only pay for what you use beyond the included limits.
          No complicated tiers, just straightforward pricing.
        </p>
      </div>

      {error && (
        <div className="max-w-md mx-auto mb-8 p-4 bg-red-900/50 text-red-200 rounded-lg">
          {error}
        </div>
      )}

      <div className="max-w-2xl mx-auto">
        <Card className="p-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2">Base Plan</h2>
            <p className="text-gray-400 mb-4">Perfect for growing businesses</p>
            <div className="text-4xl font-bold mb-2">
              $35
              <span className="text-lg text-gray-400">/mo</span>
            </div>
          </div>

          <div className="space-y-6 mb-8">
            <div>
              <h3 className="font-medium mb-3">Included Every Month</h3>
              <ul className="space-y-3">
                <li className="flex items-center text-sm">
                  <svg className="w-5 h-5 mr-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  5,000 emails
                </li>
                <li className="flex items-center text-sm">
                  <svg className="w-5 h-5 mr-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  2,500 contacts
                </li>
                <li className="flex items-center text-sm">
                  <svg className="w-5 h-5 mr-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  5 active campaigns
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-medium mb-3">Usage-Based Pricing</h3>
              <ul className="space-y-3">
                <li className="flex items-center text-sm">
                  <svg className="w-5 h-5 mr-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  $0.002 per additional email
                </li>
                <li className="flex items-center text-sm">
                  <svg className="w-5 h-5 mr-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  $0.01 per additional contact
                </li>
                <li className="flex items-center text-sm">
                  <svg className="w-5 h-5 mr-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  $10 per additional campaign
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-medium mb-3">All Features Included</h3>
              <ul className="space-y-3">
                <li className="flex items-center text-sm">
                  <svg className="w-5 h-5 mr-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  Email campaign management
                </li>
                <li className="flex items-center text-sm">
                  <svg className="w-5 h-5 mr-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  Contact management
                </li>
                <li className="flex items-center text-sm">
                  <svg className="w-5 h-5 mr-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  Real-time analytics
                </li>
                <li className="flex items-center text-sm">
                  <svg className="w-5 h-5 mr-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  Email templates
                </li>
              </ul>
            </div>
          </div>

          {selectedPlan ? (
            <Elements stripe={stripePromise}>
              <CheckoutForm planId={selectedPlan} onSuccess={handleSuccess} />
            </Elements>
          ) : (
            <>
              <Button
                className="w-full"
                size="lg"
                variant="primary"
                disabled={subscription?.plan_id === plans[0]?.id}
                onClick={handleGetStarted}
              >
                {subscription?.plan_id === plans[0]?.id ? 'Current Plan' : 'Get Started'}
              </Button>
              {!user && (
                <p className="text-sm text-gray-400 text-center mt-4">
                  You'll need to <Link to="/auth" className="text-primary hover:text-primary-hover">sign in</Link> to subscribe
                </p>
              )}
            </>
          )}
        </Card>

        <div className="mt-8 text-center">
          <div className="flex justify-center gap-8 text-sm text-gray-400 mb-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              14-Day Free Trial
            </div>
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              No Credit Card Required
            </div>
          </div>
          <p className="text-gray-400">
            Need help calculating costs? <button className="text-primary hover:text-primary-hover">Contact our team</button>
          </p>
        </div>
      </div>
    </div>
  );
} 