import { beforeAll, vi } from 'vitest';

// Create a Map to store environment variables
const envVars = new Map<string, string>();

// Load test environment variables
beforeAll(() => {
  // Initialize environment variables
  envVars.set('SUPABASE_URL', 'http://localhost:54321');
  envVars.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  envVars.set('SENDGRID_API_KEY', 'test-sendgrid-key');
  envVars.set('NODE_ENV', 'test');
  envVars.set('VITEST', 'true');

  // Mock process
  vi.stubGlobal('process', {
    env: Object.fromEntries(envVars.entries()),
    cwd: () => '/Users/guyma/code/mailvanta'
  });

  // Mock fetch for API client tests
  const originalFetch = global.fetch;
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();

    // For test endpoints, return mocked responses
    if (url.includes('/test')) {
      return Promise.resolve(new Response(JSON.stringify({ data: 'test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // For rate limit test endpoints
    if (url.includes('/rate-limited')) {
      return Promise.resolve(new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // For circuit breaker test endpoints
    if (url.includes('/circuit-test')) {
      return Promise.resolve(new Response(JSON.stringify({ error: 'Circuit breaker is open' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // For all other requests, use the real fetch
    return originalFetch(input, init);
  });
});

// Define global types for test environment
declare global {
  var Deno: {
    env: {
      get: (key: string) => string | undefined;
      set: (key: string, value: string) => void;
      delete: (key: string) => void;
    };
    serve: (handler: (request: Request) => Promise<Response>) => void;
  };
}

// Mock Deno.env and serve for edge functions
global.Deno = {
  env: {
    get: (key: string) => envVars.get(key),
    set: (key: string, value: string) => envVars.set(key, value),
    delete: (key: string) => envVars.delete(key)
  },
  serve: vi.fn((handler) => {
    // Store the handler for testing
    (global as any).testHandler = handler;
  })
}; 