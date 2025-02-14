import { apiClient } from './client';
import { timingInterceptor, monitoringInterceptor } from './monitoring';
import { APIRequestConfig } from '../types/api';

// Authentication interceptor
const authInterceptor = async (config: APIRequestConfig): Promise<APIRequestConfig> => {
  const session = localStorage.getItem('session');
  if (session) {
    const { access_token } = JSON.parse(session);
    return {
      ...config,
      headers: {
        ...config.headers,
        Authorization: `Bearer ${access_token}`,
      },
    };
  }
  return config;
};

// Error logging interceptor
const errorLoggingInterceptor = async (config: APIRequestConfig): Promise<APIRequestConfig> => {
  try {
    return config;
  } catch (error) {
    // Log error to monitoring service in production
    if (import.meta.env.PROD) {
      console.error('API Error:', error);
      // TODO: Send to error tracking service
    }
    throw error;
  }
};

export function initializeAPI(): void {
  // Add request interceptors
  apiClient.addRequestInterceptor(authInterceptor);
  apiClient.addRequestInterceptor(timingInterceptor);
  apiClient.addRequestInterceptor(errorLoggingInterceptor);

  // Add response interceptors
  apiClient.addResponseInterceptor(monitoringInterceptor);

  // Log initialization in development
  if (import.meta.env.DEV) {
    console.log('API Client initialized with interceptors');
  }
} 