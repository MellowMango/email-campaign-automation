import { supabase } from '../lib/supabase/client';

// Wrap Supabase calls with artificial delay
export const withTestDelay = async <T>(promise: Promise<T>, delay = 2000): Promise<T> => {
  await new Promise(resolve => setTimeout(resolve, delay));
  return promise;
};

// Enable/disable test delays globally
let testDelaysEnabled = false;

export const enableTestDelays = () => {
  testDelaysEnabled = true;
  console.log('🕒 Test delays enabled - API calls will be delayed by 2 seconds');
};

export const disableTestDelays = () => {
  testDelaysEnabled = false;
  console.log('✓ Test delays disabled - API calls will run at normal speed');
};

// Utility to check if we're in development mode
export const isDevelopment = () => {
  return import.meta.env.MODE === 'development';
};

// Helper to log loading state changes
export const logLoadingState = (component: string, isLoading: boolean) => {
  if (isDevelopment()) {
    console.log(
      `${component} loading state: ${isLoading ? '🔄 Loading...' : '✅ Loaded'}`
    );
  }
}; 