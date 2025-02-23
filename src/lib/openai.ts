import { supabase } from './supabase/client';

interface GenerateContentResponse {
  subject: string;
  content: string;
}

export async function generateEmailContent(
  prompt: string,
  targetAudience: string,
  emailTone: string,
  companyName?: string
): Promise<GenerateContentResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-content`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          prompt,
          targetAudience,
          emailTone,
          companyName,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate content');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error generating content:', error);
    throw error;
  }
} 