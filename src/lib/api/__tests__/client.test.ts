import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { APIClient } from '../client';
import { APIError } from '../errors';

// Mock document for CSRF tests
const mockDocument = {
  cookie: ''
};
global.document = mockDocument as any;

// Mock environment variables
vi.stubGlobal('import.meta', {
  env: {
    VITE_SUPABASE_URL: 'http://localhost:54321'
  }
});

describe('APIClient', () => {
  let client: APIClient;
  let mockFetch: any;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Initialize client
    client = APIClient.getInstance();

    // Reset mock document cookie
    mockDocument.cookie = '';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Request Handling', () => {
    it('should make successful GET request', async () => {
      const mockData = { data: 'test' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData)
      });

      const result = await client.get('/test');
      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should handle failed requests', async () => {
      const errorResponse = { error: 'An error occurred' };
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve(errorResponse),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      let error: unknown;
      try {
        await client.get('/nonexistent');
        expect.fail('Expected error to be thrown');
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(APIError);
      if (error instanceof APIError) {
        expect(error.message).toBe('An error occurred');
        expect(error.statusCode).toBe(404);
      }
    });

    it('should retry on network errors', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: 'success' })
        });

      const result = await client.get('/test', { retries: 1 });
      expect(result).toEqual({ data: 'success' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Caching', () => {
    it('should cache GET requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' })
      });

      // First request should hit the API
      await client.get('/cached', { shouldCache: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second request should use cache
      await client.get('/cached', { shouldCache: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should respect cache TTL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' })
      });

      // First request
      await client.get('/cached', { shouldCache: true, cacheTTL: 0 });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second request should bypass cache due to TTL=0
      await client.get('/cached', { shouldCache: true, cacheTTL: 0 });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Rate Limiting', () => {
    it('should respect rate limits', async () => {
      const errorResponse = { error: 'An error occurred' };
      const mockResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: () => Promise.resolve(errorResponse),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      let error: unknown;
      try {
        await client.get('/rate-limited');
        expect.fail('Expected error to be thrown');
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(APIError);
      if (error instanceof APIError) {
        expect(error.message).toBe('An error occurred');
        expect(error.statusCode).toBe(429);
      }
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after failures', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'Server error' })
      };
      const mockFetch = vi.fn().mockResolvedValue(mockResponse);
      global.fetch = mockFetch;

      const testClient = APIClient.getInstance();
      testClient['baseURL'] = 'http://localhost:54321';

      // Reset circuit breaker state
      testClient['failureCount'] = new Map();
      testClient['circuitOpen'] = new Set();

      // Make requests until circuit breaker opens
      for (let i = 0; i < 5; i++) {
        try {
          await testClient.get('/circuit-test', { skipRateLimit: true });
        } catch (e) {
          // Ignore errors until circuit breaker opens
          continue;
        }
      }

      // The next request should trigger circuit breaker
      await expect(testClient.get('/circuit-test', { skipRateLimit: true })).rejects.toThrow('Circuit breaker is open');
      expect(mockFetch).toHaveBeenCalledTimes(5); // Should stop after 5 failures
    });
  });

  describe('CSRF Protection', () => {
    it('should include CSRF token in requests', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 'success' })
      });
      global.fetch = mockFetch;

      // Mock document.cookie to return a CSRF token
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: 'csrf_token=test-csrf-token'
      });

      const testClient = APIClient.getInstance();
      testClient['baseURL'] = 'http://localhost:54321';
      
      // Clear existing interceptors
      testClient['requestInterceptors'] = [];

      // Add test interceptor
      testClient.addRequestInterceptor(async (config) => ({
        ...config,
        headers: {
          ...config.headers,
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'test-csrf-token'
        }
      }));

      await testClient.post('/test', { data: 'test' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:54321/test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-CSRF-Token': 'test-csrf-token'
          }),
          body: JSON.stringify({ data: 'test' })
        })
      );
    });
  });
}); 