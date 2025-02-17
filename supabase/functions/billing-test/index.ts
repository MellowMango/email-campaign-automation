import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    // Basic health check
    if (path === 'health') {
      return new Response(
        JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Auth check
    if (path === 'auth-test') {
      const authHeader = req.headers.get('Authorization');
      return new Response(
        JSON.stringify({ 
          status: 'success',
          auth: {
            present: !!authHeader,
            value: authHeader
          }
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Echo test
    if (path === 'echo') {
      const body = await req.json().catch(() => ({}));
      return new Response(
        JSON.stringify({
          status: 'success',
          method: req.method,
          headers: Object.fromEntries(req.headers.entries()),
          body
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        status: 'error',
        message: 'Unknown test endpoint',
        availableEndpoints: ['/health', '/auth-test', '/echo']
      }),
      { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}); 