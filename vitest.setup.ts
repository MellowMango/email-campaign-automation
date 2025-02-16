import { beforeAll, vi, MockInstance } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load test environment variables
beforeAll(() => {
  config({ path: resolve(__dirname, '.env.test') });
});

// Define global types for test environment
declare global {
  var Deno: {
    env: {
      get: (key: string) => string | undefined;
      set: (key: string, value: string) => void;
      delete: (key: string) => void;
    };
  };
}

// Mock Deno.env for edge functions
global.Deno = {
  env: {
    get: (key: string) => process.env[key],
    set: (key: string, value: string) => { process.env[key] = value; },
    delete: (key: string) => { delete process.env[key]; }
  }
};

// Mock fetch for edge functions with scenario-based responses
global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = input.toString();
  const method = init?.method || 'GET';

  // Handle email webhook endpoints
  if (url.includes('/email-webhooks')) {
    if (!init?.headers?.['X-Twilio-Email-Event-Webhook-Signature']) {
      return Promise.resolve(new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    return Promise.resolve(new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
  }

  // Handle scheduled emails endpoints
  if (url.includes('/send-scheduled-emails')) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return Promise.resolve(new Response(JSON.stringify({ error: 'Missing required environment variables' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    return Promise.resolve(new Response(JSON.stringify({ 
      results: [{ status: 'sent', id: 'test-1' }]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
  }

  // Handle rate limiting
  if (url.includes('/rate-limited')) {
    return Promise.resolve(new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    }));
  }

  // Handle circuit breaker
  if (url.includes('/circuit-test')) {
    return Promise.resolve(new Response(JSON.stringify({ error: 'Circuit breaker is open' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    }));
  }

  // Default success response
  return Promise.resolve(new Response(JSON.stringify({ data: 'test' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  }));
}); 