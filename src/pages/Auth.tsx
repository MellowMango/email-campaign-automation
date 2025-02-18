import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/shadcn/Button';
import { Card } from '../components/shadcn/Card';
import { supabase } from '../lib/supabase/client';
import { useSubscription } from '../hooks/useSubscription';

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signUp } = useAuth();
  const { subscription } = useSubscription();

  // Handle email verification and signup flow
  useEffect(() => {
    const handleEmailVerification = async () => {
      const searchParams = new URLSearchParams(location.search);
      const accessToken = searchParams.get('access_token');
      const refreshToken = searchParams.get('refresh_token');
      const type = searchParams.get('type');

      // If this is an email verification callback
      if (type === 'signup' && accessToken && refreshToken) {
        setVerifying(true);
        try {
          // Set the session
          const { data: { session }, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          
          if (sessionError) throw sessionError;
          if (!session?.user) throw new Error('No user in session');

          // Get the stored redirect info from localStorage
          const signupInfo = localStorage.getItem('signupInfo');
          if (signupInfo) {
            const { planId, redirect } = JSON.parse(signupInfo);
            // Clear stored info
            localStorage.removeItem('signupInfo');
            
            if (planId && redirect === 'pricing') {
              // Redirect back to pricing with verified status
              navigate('/pricing?verified=true&plan=' + planId);
              return;
            }
          }
          
          // Default redirect to dashboard
          navigate('/dashboard');
        } catch (err) {
          console.error('Error during email verification:', err);
          setError('Failed to verify email. Please try again.');
        } finally {
          setVerifying(false);
        }
      }
    };

    handleEmailVerification();
  }, [location, navigate]);

  // Set isSignUp to true if coming from pricing page
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const redirect = searchParams.get('redirect');
    const planId = searchParams.get('plan');
    if (redirect === 'pricing') {
      setIsSignUp(true);
      // Store the plan ID if it exists
      if (planId) {
        localStorage.setItem('signupInfo', JSON.stringify({ planId, redirect }));
      }
    }
  }, [location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        // Get redirect info
        const searchParams = new URLSearchParams(location.search);
        const redirect = searchParams.get('redirect');
        const planId = searchParams.get('plan');

        // Store signup info for after verification
        if (redirect === 'pricing' && planId) {
          localStorage.setItem('signupInfo', JSON.stringify({ planId, redirect }));
        }

        // Sign up with custom redirect URL that includes the plan
        const redirectTo = window.location.origin + 
          '/auth/callback?redirect=' + encodeURIComponent(redirect || '') +
          (planId ? '&plan=' + encodeURIComponent(planId) : '');

        await signUp(email, password, {
          emailRedirectTo: redirectTo
        });

        // Set signup success instead of error
        setSignupSuccess(true);
      } else {
        console.log('Starting sign in process...');
        await signIn(email, password);
        
        console.log('Signed in, fetching subscription data...');
        
        // Explicitly fetch subscription data
        const { data: subscriptionData, error: subError } = await supabase
          .from('subscriptions')
          .select('*, plan:pricing_plans(*)')
          .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
          .eq('status', 'active')
          .single();

        if (subError && subError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
          throw subError;
        }

        console.log('Fetched subscription data:', subscriptionData);
        
        const searchParams = new URLSearchParams(location.search);
        const redirect = searchParams.get('redirect');
        
        // Check if user is admin or has active subscription
        if (subscriptionData?.is_admin || subscriptionData?.status === 'active') {
          console.log('User is admin or has active subscription, redirecting to:', redirect || '/dashboard');
          navigate(redirect || '/dashboard');
          return;
        }
        
        console.log('User has no active subscription, redirecting to pricing');
        navigate('/pricing');
      }
    } catch (err) {
      console.error('Error during sign in:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (signupSuccess) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-md">
        <Card className="w-full p-8">
          <div className="text-center">
            <svg
              className="mx-auto h-12 w-12 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 48 48"
            >
              <circle
                className="opacity-25"
                cx="24"
                cy="24"
                r="20"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M14 24l8 8 16-16"
              />
            </svg>
            <h2 className="mt-4 text-2xl font-bold">Account Created Successfully!</h2>
            <p className="mt-2 text-gray-400">
              We've sent a verification email to your inbox. You can verify your email later - 
              let's set up your subscription now.
            </p>
            <Button
              className="mt-6 w-full"
              onClick={() => {
                const searchParams = new URLSearchParams(location.search);
                const planId = searchParams.get('plan');
                // Add selectedPlan parameter to show the payment form
                navigate(`/pricing?plan=${planId}&showPayment=true`);
              }}
            >
              Continue to Setup Subscription
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (verifying) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-md">
        <Card className="w-full p-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Verifying your email...</h2>
            <p className="text-gray-400">Please wait while we verify your email address.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-md">
      <Card className="w-full p-8">
        <div>
          <h2 className="text-center text-3xl font-extrabold mb-8">
            {isSignUp ? 'Create your account' : 'Sign in to your account'}
          </h2>
          {isSignUp && (
            <p className="text-center text-gray-400 mb-8">
              Start your 14-day free trial. No credit card required.
            </p>
          )}
        </div>
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="input"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                required
                className="input"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center">{error}</div>
          )}

          <div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? 'Processing...' : isSignUp ? 'Start Free Trial' : 'Sign in'}
            </Button>
          </div>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-primary hover:text-primary-hover"
          >
            {isSignUp
              ? 'Already have an account? Sign in'
              : "Don't have an account? Start free trial"}
          </button>
        </div>
      </Card>
    </div>
  );
} 