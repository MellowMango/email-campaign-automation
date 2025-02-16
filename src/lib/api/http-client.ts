export interface RequestOptions {
  shouldCache?: boolean;
  cacheTTL?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export interface APIResponse<T = any> {
  data?: T;
  error?: string;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly cache: Map<string, { data: any; timestamp: number }>;
  private readonly CIRCUIT_THRESHOLD = 5;
  private readonly CIRCUIT_RESET_TIMEOUT = 60000; // 1 minute
  private readonly MAX_REQUESTS_PER_MINUTE = 10;
  private isCircuitOpen = false;
  private failureCount = 0;
  private requestTimes: number[] = [];

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.cache = new Map();
  }

  private getCsrfToken(): string | null {
    if (typeof document === 'undefined') return null;
    const cookies = document.cookie.split(';');
    const csrfCookie = cookies.find(cookie => cookie.trim().startsWith('csrf-token='));
    return csrfCookie ? csrfCookie.split('=')[1].trim() : null;
  }

  private async makeRequest<T>(url: string, init: RequestInit & RequestOptions, attempt: number = 1): Promise<APIResponse<T>> {
    try {
      // Check circuit breaker
      if (this.isCircuitOpen) {
        throw new Error('Circuit breaker is open');
      }

      // Check rate limits
      const now = Date.now();
      this.requestTimes = this.requestTimes.filter(time => now - time < 60000);
      if (this.requestTimes.length >= this.MAX_REQUESTS_PER_MINUTE) {
        throw new Error('Rate limit exceeded');
      }
      this.requestTimes.push(now);

      const response = await fetch(url, init);
      const data = await response.json();

      if (!response.ok) {
        this.failureCount++;
        if (this.failureCount >= this.CIRCUIT_THRESHOLD) {
          this.isCircuitOpen = true;
          setTimeout(() => {
            this.isCircuitOpen = false;
            this.failureCount = 0;
          }, this.CIRCUIT_RESET_TIMEOUT);
          throw new Error('Circuit breaker is open');
        }
        throw new Error(response.statusText || 'Request failed');
      }

      this.failureCount = 0;
      return { data: data.data || data };

    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Circuit breaker is open' || error.message === 'Rate limit exceeded') {
          throw error;
        }
        
        if (init.retries && attempt < init.retries + 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.makeRequest(url, init, attempt + 1);
        }
        
        return { error: error.message };
      }
      return { error: 'Network error occurred' };
    }
  }

  private async request<T>(path: string, init: RequestInit & RequestOptions = {}): Promise<APIResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const cacheKey = `${init.method || 'GET'}-${url}`;

    // Check cache for GET requests
    if (init.shouldCache && (!init.method || init.method === 'GET')) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        const ttl = init.cacheTTL ?? 300000; // Default 5 minutes
        if (Date.now() - cached.timestamp < ttl) {
          return { data: cached.data };
        }
        this.cache.delete(cacheKey);
      }
    }

    // Add CSRF token and headers
    const csrfToken = this.getCsrfToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k, String(v)])),
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
    };

    const result = await this.makeRequest<T>(url, {
      ...init,
      headers
    });

    // Cache successful GET requests
    if (init.shouldCache && (!init.method || init.method === 'GET') && !result.error) {
      this.cache.set(cacheKey, {
        data: result.data,
        timestamp: Date.now()
      });
    }

    return result;
  }

  async get<T>(path: string, options: RequestOptions = {}): Promise<APIResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  async post<T>(path: string, data: any, options: RequestOptions = {}): Promise<APIResponse<T>> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async put<T>(path: string, data: any, options: RequestOptions = {}): Promise<APIResponse<T>> {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async delete<T>(path: string, options: RequestOptions = {}): Promise<APIResponse<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
} 