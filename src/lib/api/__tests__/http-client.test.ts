import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HttpClient } from '../http-client';

type FetchMock = ReturnType<typeof vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>>;

describe('HttpClient', () => {
  let client: HttpClient;
  let mockFetch: FetchMock;

  const createMockResponse = (options: {
    ok: boolean;
    status?: number;
    statusText?: string;
    json: () => Promise<any>;
  }): Response => {
    return {
      ok: options.ok,
      status: options.status || (options.ok ? 200 : 400),
      statusText: options.statusText || '',
      headers: new Headers(),
      redirected: false,
      type: 'basic',
      url: '',
      json: options.json,
      text: () => Promise.resolve(''),
      blob: () => Promise.resolve(new Blob()),
      formData: () => Promise.resolve(new FormData()),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      bodyUsed: false,
      body: null,
      clone: function() { return this; }
    } as Response;
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    (global as any).fetch = mockFetch;
    client = new HttpClient('https://api.example.com');
  });

  afterEach(() => {
    vi.clearAllMocks();
    if ((global as any).document) {
      delete (global as any).document;
    }
  });

  describe('Basic Request Handling', () => {
    it('should make successful GET request', async () => {
      const mockData = { data: 'test' };
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        json: () => Promise.resolve(mockData)
      }));

      const result = await client.get('/test');
      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.any(Object)
        })
      );
    });

    it('should handle failed requests', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: false,
        status: 404,
        statusText: 'Not found',
        json: () => Promise.resolve({})
      }));

      const result = await client.get('/test');
      expect(result.error).toBe('Not found');
    });

    it('should retry on network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        json: () => Promise.resolve({ data: 'test' })
      }));

      const result = await client.get('/test', { retries: 1 });
      expect(result).toEqual({ data: 'test' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Caching', () => {
    it('should cache GET requests', async () => {
      const mockData = { data: 'cached' };
      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        json: () => Promise.resolve(mockData)
      }));

      const result = await client.get('/cache-test', { shouldCache: true });
      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second request should use cache
      const cachedResult = await client.get('/cache-test', { shouldCache: true });
      expect(cachedResult).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should respect cache TTL', async () => {
      const mockData = { data: 'test' };
      mockFetch.mockResolvedValue(createMockResponse({
        ok: true,
        json: () => Promise.resolve(mockData)
      }));

      await client.get('/ttl-test', { shouldCache: true, cacheTTL: 0 });
      await client.get('/ttl-test', { shouldCache: true });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Rate Limiting', () => {
    it('should respect rate limits', async () => {
      mockFetch.mockResolvedValue(createMockResponse({
        ok: true,
        json: () => Promise.resolve({ data: 'rate-limited' })
      }));

      const requests = Array(11).fill(null).map(() =>
        client.get('/rate-test')
      );

      await expect(Promise.all(requests)).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after failures', async () => {
      mockFetch.mockResolvedValue(createMockResponse({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        json: () => Promise.resolve({})
      }));

      const requests = Array(5).fill(null).map(() =>
        client.get('/circuit-test').catch(() => {})
      );

      await Promise.all(requests);
      await expect(client.get('/circuit-test')).rejects.toThrow('Circuit breaker is open');
    });
  });

  describe('CSRF Protection', () => {
    it('should include CSRF token in requests', async () => {
      (global as any).document = {
        cookie: 'csrf-token=test-csrf-token'
      };

      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: true,
        json: () => Promise.resolve({ data: 'test' })
      }));

      await client.post('/test', { data: 'test' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-CSRF-Token': 'test-csrf-token'
          })
        })
      );
    });
  });
}); 