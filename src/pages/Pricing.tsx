import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  const { user } = useAuth();

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
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="p-5 bg-gray-800/70 backdrop-blur-lg rounded-lg border border-gray-700 shadow-lg">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#ffffff',
                fontFamily: 'Inter, system-ui, sans-serif',
                '::placeholder': {
                  color: '#9CA3AF'
                },
                iconColor: '#60A5FA'
              },
              invalid: {
                color: '#EF4444',
                iconColor: '#EF4444'
              }
            }
          }}
        />
      </div>
      {error && (
        <div className="text-red-500 text-sm bg-red-500/10 p-2 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}
      <Button
        type="submit"
        disabled={!stripe || processing}
        className="w-full py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
        variant="primary"
      >
        {processing ? 'Processing...' : 'Start Your Free Trial'}
      </Button>
      <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span>30-day money-back guarantee</span>
        <span>•</span>
        <span>Cancel anytime</span>
      </div>
    </form>
  );
}

export default function Pricing() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { plans, subscription, loading, error } = useSubscription();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const planId = searchParams.get('plan');
    const showPayment = searchParams.get('showPayment') === 'true';
    const verified = searchParams.get('verified') === 'true';
    
    if ((verified || showPayment) && planId && user) {
      setSelectedPlan(planId);
    } else if (planId) {
      setSelectedPlan(planId);
    }
  }, [location, user]);

  const handleSuccess = () => {
    navigate('/dashboard');
  };

  const handleGetStarted = () => {
    if (!user) {
      navigate(`/auth?redirect=pricing&plan=${plans[0]?.id}&showPayment=true`);
      return;
    }
    setSelectedPlan(plans[0]?.id);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-white text-xl">Loading pricing plans...</div>
      </div>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-red-500 text-lg">No pricing plans available. Please try again later.</div>
      </div>
    );
  }

  const isCurrentPlan = Boolean(user && subscription?.plan_id === plans[0]?.id);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 flex flex-col">
      <div className="container mx-auto px-4 py-8 flex-1 flex flex-col">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            Simple, Usage-Based Pricing
          </h1>
          <p className="mt-2 text-lg text-gray-400">
            Get started with a plan that grows with your needs.
          </p>
        </div>

        {error && (
          <div className="max-w-lg mx-auto mb-6 p-3 bg-red-500/10 border border-red-500/20 text-red-200 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="max-w-5xl mx-auto flex-1">
          <div className="relative flex flex-col items-center">
            {/* Glowing background effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 blur-3xl -z-10" />
            
            <Card className="relative w-full overflow-hidden backdrop-blur-xl bg-gray-900/60 border border-gray-700 shadow-2xl rounded-xl">
              <div className="p-8 flex flex-col h-full">
                {/* Header */}
                <div className="text-center mb-6">
                  <div className="flex items-baseline justify-center">
                    <span className="text-5xl font-bold">$35</span>
                    <span className="text-lg text-gray-400 ml-2">/month</span>
                  </div>
                </div>

                {/* Features Grid */}
                <div className="grid md:grid-cols-3 gap-6 mb-8">
                  {/* Included Resources */}
                  <div>
                    <div className="h-8 flex items-center justify-center bg-gradient-to-r from-blue-500 to-blue-600 rounded text-white text-sm font-medium mb-3">
                      Monthly Included
                    </div>
                    <ul className="space-y-2 text-sm text-gray-200">
                      <li className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-5 h-5 bg-blue-500/20 rounded-full flex items-center justify-center">
                          <span className="text-blue-500 text-xs">✓</span>
                        </span>
                        <span><strong>5,000</strong> emails</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-5 h-5 bg-blue-500/20 rounded-full flex items-center justify-center">
                          <span className="text-blue-500 text-xs">✓</span>
                        </span>
                        <span><strong>2,500</strong> contacts</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-5 h-5 bg-blue-500/20 rounded-full flex items-center justify-center">
                          <span className="text-blue-500 text-xs">✓</span>
                        </span>
                        <span><strong>5</strong> campaigns</span>
                      </li>
                    </ul>
                  </div>

                  {/* Usage Pricing */}
                  <div>
                    <div className="h-8 flex items-center justify-center bg-gradient-to-r from-purple-500 to-purple-600 rounded text-white text-sm font-medium mb-3">
                      Usage Pricing
                    </div>
                    <ul className="space-y-2 text-sm text-gray-200">
                      <li className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-5 h-5 bg-purple-500/20 rounded-full flex items-center justify-center">
                          <span className="text-purple-500 text-[10px]">+</span>
                        </span>
                        <span><strong>$0.002</strong> per extra email</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-5 h-5 bg-purple-500/20 rounded-full flex items-center justify-center">
                          <span className="text-purple-500 text-[10px]">+</span>
                        </span>
                        <span><strong>$0.01</strong> per extra contact</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-5 h-5 bg-purple-500/20 rounded-full flex items-center justify-center">
                          <span className="text-purple-500 text-[10px]">+</span>
                        </span>
                        <span><strong>$10</strong> per extra campaign</span>
                      </li>
                    </ul>
                  </div>

                  {/* Core Features */}
                  <div>
                    <div className="h-8 flex items-center justify-center bg-gradient-to-r from-green-500 to-green-600 rounded text-white text-sm font-medium mb-3">
                      Core Features
                    </div>
                    <ul className="space-y-2 text-sm text-gray-200">
                      <li className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-5 h-5 bg-green-500/20 rounded-full flex items-center justify-center">
                          <span className="text-green-500 text-xs">✓</span>
                        </span>
                        <span>Campaign Management</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-5 h-5 bg-green-500/20 rounded-full flex items-center justify-center">
                          <span className="text-green-500 text-xs">✓</span>
                        </span>
                        <span>Contact Management</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-5 h-5 bg-green-500/20 rounded-full flex items-center justify-center">
                          <span className="text-green-500 text-xs">✓</span>
                        </span>
                        <span>Real-time Analytics</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-5 h-5 bg-green-500/20 rounded-full flex items-center justify-center">
                          <span className="text-green-500 text-xs">✓</span>
                        </span>
                        <span>Email Templates</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Action Section */}
                <div className="mt-auto max-w-md mx-auto w-full">
                  {selectedPlan ? (
                    <Elements stripe={stripePromise}>
                      <CheckoutForm planId={selectedPlan} onSuccess={handleSuccess} />
                    </Elements>
                  ) : (
                    <>
                      <Button
                        className="w-full py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                        size="lg"
                        variant="primary"
                        disabled={isCurrentPlan}
                        onClick={handleGetStarted}
                      >
                        {isCurrentPlan ? 'Current Plan' : user ? 'Subscribe Now' : 'Start Free Trial'}
                      </Button>
                      {!user && (
                        <p className="text-xs text-gray-400 text-center mt-3">
                          No credit card required to start
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </Card>
          </div>

          <div className="mt-4 text-center">
            <button className="text-xs text-gray-400 hover:text-gray-300 transition-colors duration-200">
              Need help calculating costs? <span className="text-blue-400 hover:text-blue-300 font-medium">Contact our team</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}