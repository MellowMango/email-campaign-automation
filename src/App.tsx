import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/AuthContext';
import React, { useEffect, useState } from 'react';
import { Header } from './components/common/Header';
import { initializeAPI } from './lib/api/init';
import { useSubscription } from './hooks/useSubscription';
import { useNavigate } from 'react-router-dom';
import { LoadingState } from './components/common/LoadingState';

// Lazy load pages for better performance
const Landing = React.lazy(() => import('./pages/Landing'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Auth = React.lazy(() => import('./pages/Auth'));
const Campaign = React.lazy(() => import('./pages/Campaign'));
const Campaigns = React.lazy(() => import('./pages/Campaigns'));
const Contacts = React.lazy(() => import('./pages/Contacts'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Pricing = React.lazy(() => import('./pages/Pricing'));

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { subscription, loading: subLoading, refresh: refreshSubscription } = useSubscription();
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    if (user && isInitialLoad) {
      // Explicitly refresh subscription data on initial load
      refreshSubscription().then(() => {
        setIsInitialLoad(false);
      });
    }
  }, [user, isInitialLoad, refreshSubscription]);

  // Show loading state while checking auth and subscription
  if (authLoading || subLoading || (user && isInitialLoad)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingState variant="spinner" size="lg" text="Loading..." />
      </div>
    );
  }

  // If no user, redirect to auth
  if (!user) {
    return <Navigate to="/auth" />;
  }

  // If user is not admin and either has no subscription or it's not active, redirect to pricing
  if (!subscription?.is_admin && (!subscription || subscription.status !== 'active')) {
    return <Navigate to="/pricing" />;
  }

  return <>{children}</>;
}

export function App() {
  useEffect(() => {
    // Initialize API client
    initializeAPI();
  }, []);

  return (
    <Router>
      <AuthProvider>
        <div className="min-h-screen bg-background">
          <Header />
          <React.Suspense 
            fallback={
              <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
                <div className="text-white">Loading...</div>
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/campaigns"
                element={
                  <ProtectedRoute>
                    <Campaigns />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/campaign/:id"
                element={
                  <ProtectedRoute>
                    <Campaign />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/contacts"
                element={
                  <ProtectedRoute>
                    <Contacts />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </React.Suspense>
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;
