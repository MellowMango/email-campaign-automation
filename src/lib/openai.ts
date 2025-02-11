const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  throw new Error('Missing OpenAI API key');
}

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
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
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
            - Include a clear call to action
            - The email will be signed with the company name: ${companyName || '{{company_name}}'}`
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
      throw new Error('Failed to generate content');
    }

    const data = await response.json();
    const generatedText = data.choices[0].message.content.trim();

    // More robust parsing of the response
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
      const lines: string[] = generatedText.split('\n').filter((line: string) => line.trim());
      if (lines.length >= 2) {
        // If no explicit labels, assume first line is subject and rest is content
        subject = lines[0].replace(/^Subject:\s*/i, '').trim();
        content = lines.slice(1).join('\n').replace(/^Content:\s*/i, '').trim();
      } else {
        throw new Error('Invalid response format');
      }
    }

    if (!subject || !content) {
      throw new Error('Failed to parse subject or content from response');
    }

    return { subject, content };
  } catch (error) {
    console.error('Error generating content:', error);
    throw error;
  }
} 