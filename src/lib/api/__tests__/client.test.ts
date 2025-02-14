import { APIClient } from '../client';
import { APIError } from '../errors';
import { apiCache } from '../cache';
import { rateLimiter } from '../rateLimit';
import { circuitBreaker } from '../circuitBreaker';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('APIClient', () => {
  let client: APIClient;
  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    client = APIClient.getInstance();
    mockFetch.mockClear();
    apiCache.clear();
  });

  describe('Basic Request Handling', () => {
    it('should make successful GET request', async () => {
      const mockData = { data: 'test' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
        status: 200,
      });

      const result = await client.get('/test');
      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should handle failed requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Not found', code: 'NOT_FOUND' }),
      });

      await expect(client.get('/nonexistent')).rejects.toThrow(APIError);
    });

    it('should retry on network errors', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: 'success' }),
          status: 200,
        });

      const result = await client.get('/test', { retries: 1 });
      expect(result).toEqual({ data: 'success' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Caching', () => {
    it('should cache GET requests', async () => {
      const mockData = { data: 'cached' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
        status: 200,
      });

      await client.get('/cached', { cache: true });
      await client.get('/cached', { cache: true });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should respect cache TTL', async () => {
      const mockData = { data: 'ttl-test' };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
        status: 200,
      });

      await client.get('/ttl-test', { cache: { ttl: 0 } });
      await client.get('/ttl-test', { cache: true });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Rate Limiting', () => {
    it('should respect rate limits', async () => {
      const mockData = { data: 'rate-limited' };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
        status: 200,
      });

      const requests = Array(6).fill(null).map(() =>
        client.get('/rate-test', {
          rateLimit: { maxRequests: 5, windowMs: 1000 }
        })
      );

      await expect(Promise.all(requests)).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after failures', async () => {
      mockFetch.mockRejectedValue(new Error('Server error'));

      const requests = Array(6).fill(null).map(() =>
        client.get('/circuit-test').catch(() => {})
      );

      await Promise.all(requests);

      await expect(client.get('/circuit-test')).rejects.toThrow('Circuit breaker is open');
    });
  });

  describe('CSRF Protection', () => {
    it('should include CSRF token in requests', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: 'test-csrf-token' }),
          status: 200,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: 'success' }),
          status: 200,
        });

      await client.post('/test', { data: 'test' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-CSRF-Token': 'test-csrf-token',
          }),
        })
      );
    });
  });
}); 