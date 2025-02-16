import { APIError } from '../api/errors';
import { APIRequestConfig, APIResponse, RequestInterceptor, ResponseInterceptor, SuccessResponse } from '../types/api';
import { apiCache } from './cache';
import { rateLimiter } from './rateLimit';
import { circuitBreaker } from './circuitBreaker';
import { supabase } from '@/lib/supabase';

const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5MB

export interface RequestOptions extends RequestInit {
  shouldCache?: boolean;
  cacheTTL?: number;
  retries?: number;
}

export interface APIResponse<T = unknown> {
  data?: T;
  error?: string;
}

type RequestInterceptor = (config: RequestOptions) => Promise<RequestOptions>;
type ResponseInterceptor = (response: APIResponse<unknown>) => Promise<APIResponse<unknown>>;

/**
 * Singleton class for handling API requests with built-in caching, rate limiting, and circuit breaking.
 * @class APIClient
 */
export class APIClient {
  private static instance: APIClient;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private baseURL: string;
  private cache: Map<string, { data: APIResponse<unknown>; timestamp: number }>;
  private failureCount: Map<string, number>;
  private circuitOpen: Set<string>;
  private readonly MAX_REQUESTS_PER_MINUTE = 10;
  private requestTimes: number[] = [];

  private constructor() {
    this.baseURL = import.meta.env.VITE_SUPABASE_URL || '';
    this.cache = new Map();
    this.failureCount = new Map();
    this.circuitOpen = new Set();
    this.setupAuthInterceptor();
  }

  /**
   * Sets up the authentication interceptor to include the Supabase JWT token
   */
  private setupAuthInterceptor(): void {
    this.addRequestInterceptor(async (config) => ({
      ...config,
      headers: {
        ...config.headers,
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
      },
    }));
  }

  /**
   * Gets the singleton instance of the APIClient.
   * @returns {APIClient} The APIClient instance
   */
  static getInstance(): APIClient {
    if (!this.instance) {
      this.instance = new APIClient();
    }
    return this.instance;
  }

  /**
   * Adds a request interceptor to modify requests before they are sent.
   * @param {RequestInterceptor} interceptor - The interceptor function
   */
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Adds a response interceptor to process responses before they are returned.
   * @param {ResponseInterceptor} interceptor - The interceptor function
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  private async applyRequestInterceptors(config: RequestOptions): Promise<RequestOptions> {
    let modifiedConfig = { ...config };
    for (const interceptor of this.requestInterceptors) {
      modifiedConfig = await interceptor(modifiedConfig);
    }
    return modifiedConfig;
  }

  private async applyResponseInterceptors<T>(response: APIResponse<T>): Promise<APIResponse<T>> {
    let modifiedResponse = { ...response };
    for (const interceptor of this.responseInterceptors) {
      modifiedResponse = await interceptor(modifiedResponse) as APIResponse<T>;
    }
    return modifiedResponse;
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    retries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retries > 0 && this.shouldRetry(error)) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.withRetry(operation, retries - 1, delay * 2);
      }
      throw error;
    }
  }

  private shouldRetry(error: unknown): boolean {
    if (this.isAPIError(error)) {
      // Retry on network errors or specific status codes
      return error.statusCode >= 500 || error.statusCode === 429;
    }
    return false;
  }

  private isAPIError(error: unknown): error is APIError {
    return error instanceof APIError;
  }

  private validateRequest(config: APIRequestConfig): void {
    if (!config.endpoint) {
      throw APIError.validationError('Endpoint is required');
    }

    if (config.method && !['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(config.method)) {
      throw APIError.validationError(`Invalid HTTP method: ${config.method}`);
    }

    if (config.timeout && (typeof config.timeout !== 'number' || config.timeout < 0)) {
      throw APIError.validationError('Invalid timeout value');
    }

    if (config.retries && (typeof config.retries !== 'number' || config.retries < 0)) {
      throw APIError.validationError('Invalid retries value');
    }

    // Validate payload size
    if (config.body) {
      const payloadSize = new Blob([JSON.stringify(config.body)]).size;
      if (payloadSize > MAX_PAYLOAD_SIZE) {
        throw APIError.validationError(`Payload size exceeds maximum allowed size of ${MAX_PAYLOAD_SIZE} bytes`);
      }
    }
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    const responseData = await response.json();

    if (!response.ok) {
      throw await APIError.fromResponse(response);
    }

    // Handle wrapped responses
    if (this.isSuccessResponse(responseData)) {
      return responseData.data as T;
    }

    return responseData as T;
  }

  private isSuccessResponse(data: unknown): data is SuccessResponse<unknown> {
    return (
      typeof data === 'object' &&
      data !== null &&
      'data' in data &&
      (typeof (data as { message?: string }).message === 'undefined' ||
        typeof (data as { message?: string }).message === 'string')
    );
  }

  private shouldCache(method: string): boolean {
    return method === 'GET';
  }

  private generateCacheKey(url: string, init: RequestOptions): string {
    return `${url}-${JSON.stringify(init.body || '')}-${JSON.stringify(init.headers || {})}`;
  }

  private getCsrfToken(): string | null {
    const match = document.cookie.match(/csrf_token=([^;]+)/);
    return match ? match[1] : null;
  }

  private async request<T>(path: string, init: RequestOptions = {}): Promise<APIResponse<T>> {
    const url = `${this.baseURL}${path}`;
    
    // Check circuit breaker
    if (this.circuitOpen.has(url)) {
      throw new Error('Circuit breaker is open');
    }

    // Check rate limits
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter(time => now - time < 60000);
    if (this.requestTimes.length >= this.MAX_REQUESTS_PER_MINUTE) {
      throw new Error('Rate limit exceeded');
    }
    this.requestTimes.push(now);

    // Check cache
    if (init.shouldCache && (!init.method || init.method === 'GET')) {
      const cacheKey = this.generateCacheKey(url, init);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        const ttl = init.cacheTTL ?? 300000; // Default 5 minutes
        if (now - cached.timestamp < ttl) {
          return cached.data as APIResponse<T>;
        }
        this.cache.delete(cacheKey);
      }
    }

    // Prepare headers
    const headers = new Headers({
      'Content-Type': 'application/json',
      ...(init.headers || {})
    });

    // Add CSRF token if available
    const csrfToken = this.getCsrfToken();
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken);
    }

    try {
      const config = await this.applyRequestInterceptors({
        ...init,
        headers
      });

      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        // Update failure count
        const failures = (this.failureCount.get(url) || 0) + 1;
        this.failureCount.set(url, failures);

        // Open circuit if too many failures
        if (failures >= 5) {
          this.circuitOpen.add(url);
          setTimeout(() => {
            this.circuitOpen.delete(url);
            this.failureCount.delete(url);
          }, 30000); // Reset after 30 seconds
          throw new Error('Circuit breaker is open');
        }

        const error = new Error(response.statusText || 'Request failed');
        (error as any).status = response.status;
        throw error;
      }

      // Reset failure count on success
      this.failureCount.delete(url);

      const result: APIResponse<T> = {
        data: data.data || data
      };

      // Update cache
      if (init.shouldCache && (!init.method || init.method === 'GET')) {
        const cacheKey = this.generateCacheKey(url, init);
        this.cache.set(cacheKey, {
          data: result,
          timestamp: now
        });
      }

      return await this.applyResponseInterceptors(result) as APIResponse<T>;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Circuit breaker is open' || error.message === 'Rate limit exceeded') {
          throw error;
        }
        if ((error as any).status === 429) {
          throw new Error('Rate limit exceeded');
        }
        return { error: error.message };
      }
      return { error: 'Network error occurred' };
    }
  }

  async get<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<APIResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  async post<T>(path: string, data: any, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<APIResponse<T>> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async put<T>(path: string, data: any, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<APIResponse<T>> {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async delete<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<APIResponse<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  /**
   * Makes an HTTP request with the specified configuration.
   * @template T - The expected response data type
   * @param {APIRequestConfig} config - The request configuration
   * @returns {Promise<T>} The response data
   * @throws {APIError} When the request fails
   */
  async request<T>({
    endpoint,
    method = 'GET',
    body,
    headers = {},
    retries = 3,
    timeout = 10000,
    metadata = {},
    cache = true,
    rateLimit,
  }: APIRequestConfig): Promise<T> {
    this.validateRequest({ endpoint, method, body, headers, retries, timeout, metadata });

    // Check cache for GET requests
    if (cache && this.shouldCache(method)) {
      const cacheKey = this.generateCacheKey(endpoint, { method, body });
      const cachedData = apiCache.get<T>(cacheKey);
      if (cachedData) {
        return cachedData;
      }
    }

    const config = await this.applyRequestInterceptors({
      endpoint,
      method,
      body,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      retries,
      timeout,
      metadata: {
        ...metadata,
        endpoint,
        method,
      },
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    try {
      // Use circuit breaker and rate limiter
      return await circuitBreaker.execute(
        endpoint,
        async () => {
          return rateLimiter.execute(
            endpoint,
            async () => {
              const response = await fetch(`${this.baseURL}${config.endpoint}`, {
                method: config.method,
                headers: config.headers,
                body: config.body ? JSON.stringify(config.body) : undefined,
                signal: controller.signal,
              });

              const responseData = await this.handleResponse<T>(response);
              
              await this.applyResponseInterceptors({
                ok: response.ok,
                status: response.status,
                headers: response.headers,
                data: responseData,
                metadata: config.metadata,
              });

              // Cache successful GET requests
              if (cache && this.shouldCache(method)) {
                const cacheKey = this.generateCacheKey(endpoint, config);
                apiCache.set(cacheKey, responseData);
              }

              return responseData;
            },
            rateLimit
          );
        }
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw APIError.timeoutError();
      }
      if (error instanceof APIError) {
        throw error;
      }
      throw APIError.networkError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Makes a GET request to the specified endpoint.
   * @template T - The expected response data type
   * @param {string} endpoint - The API endpoint
   * @param {Omit<APIRequestConfig, 'endpoint' | 'method'>} config - Additional configuration
   * @returns {Promise<T>} The response data
   */
  async get<T>(
    endpoint: string,
    config: Omit<APIRequestConfig, 'endpoint' | 'method'> = {}
  ): Promise<T> {
    return this.request<T>({ ...config, endpoint, method: 'GET' });
  }

  /**
   * Makes a POST request to the specified endpoint.
   * @template T - The expected response data type
   * @param {string} endpoint - The API endpoint
   * @param {unknown} data - The request body
   * @param {Omit<APIRequestConfig, 'endpoint' | 'method' | 'body'>} config - Additional configuration
   * @returns {Promise<T>} The response data
   */
  async post<T>(
    endpoint: string,
    data: unknown,
    config: Omit<APIRequestConfig, 'endpoint' | 'method' | 'body'> = {}
  ): Promise<T> {
    return this.request<T>({ ...config, endpoint, method: 'POST', body: data });
  }

  /**
   * Makes a PUT request to the specified endpoint.
   * @template T - The expected response data type
   * @param {string} endpoint - The API endpoint
   * @param {unknown} data - The request body
   * @param {Omit<APIRequestConfig, 'endpoint' | 'method' | 'body'>} config - Additional configuration
   * @returns {Promise<T>} The response data
   */
  async put<T>(
    endpoint: string,
    data: unknown,
    config: Omit<APIRequestConfig, 'endpoint' | 'method' | 'body'> = {}
  ): Promise<T> {
    return this.request<T>({ ...config, endpoint, method: 'PUT', body: data });
  }

  /**
   * Makes a DELETE request to the specified endpoint.
   * @template T - The expected response data type
   * @param {string} endpoint - The API endpoint
   * @param {Omit<APIRequestConfig, 'endpoint' | 'method'>} config - Additional configuration
   * @returns {Promise<T>} The response data
   */
  async delete<T>(
    endpoint: string,
    config: Omit<APIRequestConfig, 'endpoint' | 'method'> = {}
  ): Promise<T> {
    return this.request<T>({ ...config, endpoint, method: 'DELETE' });
  }
}

// Export a singleton instance
export const apiClient = APIClient.getInstance(); 