import { APIRequestConfig, APIResponse } from '../types/api';

interface RequestMetrics {
  endpoint: string;
  method: string;
  duration: number;
  status: number;
  timestamp: number;
  error?: unknown;
}

class APIMonitoring {
  private static instance: APIMonitoring;
  private metrics: RequestMetrics[] = [];
  private readonly maxMetricsLength = 1000;

  private constructor() {}

  static getInstance(): APIMonitoring {
    if (!this.instance) {
      this.instance = new APIMonitoring();
    }
    return this.instance;
  }

  trackRequest(metrics: RequestMetrics): void {
    this.metrics.push(metrics);
    if (this.metrics.length > this.maxMetricsLength) {
      this.metrics.shift();
    }

    // Log metrics in development
    if (import.meta.env.DEV) {
      console.log('API Request:', {
        endpoint: metrics.endpoint,
        method: metrics.method,
        duration: `${metrics.duration}ms`,
        status: metrics.status,
        error: metrics.error,
      });
    }
  }

  getRequestMetrics(): RequestMetrics[] {
    return [...this.metrics];
  }

  clearMetrics(): void {
    this.metrics = [];
  }
}

export const apiMonitoring = APIMonitoring.getInstance();

// Request timing interceptor
export const timingInterceptor = async (config: APIRequestConfig): Promise<APIRequestConfig> => {
  return {
    ...config,
    metadata: {
      ...config.metadata,
      startTime: Date.now(),
    },
  };
};

// Response monitoring interceptor
export const monitoringInterceptor = async (response: APIResponse): Promise<APIResponse> => {
  const startTime = response.metadata?.startTime as number;
  if (startTime) {
    const duration = Date.now() - startTime;
    apiMonitoring.trackRequest({
      endpoint: response.metadata?.endpoint as string,
      method: response.metadata?.method as string,
      duration,
      status: response.status,
      timestamp: Date.now(),
      error: !response.ok ? response.data : undefined,
    });
  }
  return response;
}; 