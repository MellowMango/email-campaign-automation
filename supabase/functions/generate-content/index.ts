// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

console.log("Hello from Functions!")

interface GenerateContentRequest {
  prompt: string;
  targetAudience: string;
  emailTone: string;
  companyName?: string;
}

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    // Get request body
    const { prompt, targetAudience, emailTone, companyName }: GenerateContentRequest = await req.json();

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Not authenticated');
    }

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `You are an expert email marketing copywriter who creates engaging and persuasive content. 
            Format your response exactly as follows:

            Subject: [The subject line]
            Content: 
            Dear {{recipient_name}},

            [The main email body]

            [A professional call to action]

            Best regards,
            {{sender_name}}
            ${companyName || '{{company_name}}'}

            Important:
            - Use {{recipient_name}} as a placeholder for the recipient's name
            - Use {{sender_name}} as a placeholder for the sender's name
            - Keep the content professional and aligned with the specified tone: ${emailTone}
            - Consider the target audience: ${targetAudience}
            - Ensure the content is engaging and persuasive
            - Include a clear call to action`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to generate content');
    }

    const data = await response.json();
    const generatedText = data.choices[0].message.content.trim();

    // Parse the response
    let subject = '';
    let content = '';

    // Try to parse using the standard format first
    const subjectMatch = generatedText.match(/Subject:\s*([^\n]+)/i);
    const contentMatch = generatedText.match(/Content:\s*([\s\S]+)$/i);

    if (subjectMatch && contentMatch) {
      subject = subjectMatch[1].trim();
      content = contentMatch[1].trim();
    } else {
      // Fallback: Split by newlines and try to identify subject and content
      const lines = generatedText.split('\n').filter(line => line.trim());
      if (lines.length >= 2) {
        subject = lines[0].replace(/^Subject:\s*/i, '').trim();
        content = lines.slice(1).join('\n').replace(/^Content:\s*/i, '').trim();
      } else {
        throw new Error('Invalid response format');
      }
    }

    if (!subject || !content) {
      throw new Error('Failed to parse subject or content from response');
    }

    return new Response(
      JSON.stringify({ subject, content }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );

  } catch (error) {
    console.error('Error generating content:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/generate-content' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
