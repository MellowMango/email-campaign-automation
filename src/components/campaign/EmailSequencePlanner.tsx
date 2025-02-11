import { useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Button } from '../shadcn/Button';
import { Card } from '../shadcn/Card';
import type { Campaign } from '../../lib/supabase/client';
import { supabase } from '../../lib/supabase/client';

interface EmailSequencePlannerProps {
  campaign: Campaign;
  onClose: () => void;
}

interface EmailTopic {
  date: string;
  topic: string;
  description: string;
}

interface GeneratedTopic {
  topic: string;
  description: string;
}

// Add type for fetch response
interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

const SEQUENCE_TYPES = {
  awareness: {
    name: 'Awareness & Education',
    description: 'Focus on educating prospects about their problems and your solutions',
    stages: ['Problem Awareness', 'Solution Education', 'Brand Introduction', 'Value Proposition', 'Social Proof']
  },
  conversion: {
    name: 'Direct Conversion',
    description: 'Focus on converting prospects who are ready to make a decision',
    stages: ['Value Proposition', 'Feature Showcase', 'Case Studies', 'Offer Introduction', 'Call to Action']
  },
  nurture: {
    name: 'Relationship Nurturing',
    description: 'Focus on building long-term relationships through valuable content',
    stages: ['Industry Insights', 'Best Practices', 'Tips & Tricks', 'Success Stories', 'Thought Leadership']
  }
};

export function EmailSequencePlanner({ campaign, onClose }: EmailSequencePlannerProps) {
  const [topics, setTopics] = useState<EmailTopic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<keyof typeof SEQUENCE_TYPES>('awareness');

  // Calculate campaign start and end dates
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + campaign.duration);

  // Generate email topics based on campaign details
  const generateTopics = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('Generating topics for campaign:', {
        type: selectedType,
        duration: campaign.duration,
        emailsPerWeek: campaign.emails_per_week
      });

      const response = await Promise.race([
        fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4-turbo-preview',
            messages: [
              {
                role: 'system',
                content: `You are an expert email marketing strategist. Generate a sequence of ${Math.floor(campaign.duration / 7 * campaign.emails_per_week)} emails.
Return a JSON array of objects, each with 'topic' and 'description' fields.
Example:
[
  {
    "topic": "Understanding Your Market Challenges",
    "description": "Explore common pain points in the industry and their impact on business growth"
  }
]`
              },
              {
                role: 'user',
                content: `Create a ${selectedType} email sequence following these stages: ${SEQUENCE_TYPES[selectedType].stages.join(' → ')}

Campaign Details:
Name: ${campaign.name}
Description: ${campaign.description || 'N/A'}
Target Audience: ${campaign.target_audience || 'N/A'}
Goals: ${campaign.goals || 'N/A'}
Value Proposition: ${campaign.value_proposition || 'N/A'}
Email Tone: ${campaign.email_tone || 'professional'}

Requirements:
- Each email should align with one of the sequence stages
- Maintain ${campaign.email_tone || 'professional'} tone throughout
- Focus on the target audience's needs
- Build progressively towards the campaign goals
- Keep content focused and actionable

Return the JSON array of email topics and descriptions.`
              }
            ],
            temperature: 0.7,
            max_tokens: 2000
          }),
        }) as Promise<Response>,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timed out')), 30000)
        ) as Promise<Response>
      ]);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('API Error:', errorData);
        throw new Error(errorData.error?.message || 'Failed to generate topics');
      }

      const data = await response.json() as OpenAIResponse;
      console.log('API Response:', data);

      const content = data.choices[0].message.content;
      console.log('Generated content:', content);
      
      // Parse the JSON response
      let generatedTopics: GeneratedTopic[];
      try {
        // Remove markdown code block syntax if present
        const jsonContent = content.replace(/```json\n?|\n?```/g, '').trim();
        console.log('Cleaned JSON content:', jsonContent);
        
        // Parse the cleaned JSON
        const parsed = JSON.parse(jsonContent);
        if (Array.isArray(parsed)) {
          generatedTopics = parsed;
        } else if (parsed.topics && Array.isArray(parsed.topics)) {
          generatedTopics = parsed.topics;
        } else {
          throw new Error('Invalid response structure');
        }

        // Validate the topics
        if (!generatedTopics.every(topic => 
          typeof topic === 'object' && 
          typeof topic.topic === 'string' && 
          typeof topic.description === 'string'
        )) {
          throw new Error('Invalid topic format');
        }
      } catch (parseError) {
        console.error('Parse error:', parseError, 'Content:', content);
        throw new Error('Failed to parse AI response');
      }

      if (generatedTopics.length === 0) {
        throw new Error('No topics were generated');
      }

      // Distribute topics across campaign duration
      const totalEmails = Math.floor(campaign.duration / 7 * campaign.emails_per_week);
      const daysInterval = Math.floor(campaign.duration / totalEmails);

      const scheduledTopics = generatedTopics.slice(0, totalEmails).map((topic: GeneratedTopic, index: number) => {
        const date = new Date(startDate);
        date.setDate(date.getDate() + index * daysInterval);
        return {
          date: date.toISOString().split('T')[0],
          topic: topic.topic,
          description: topic.description,
        };
      });

      console.log('Final scheduled topics:', scheduledTopics);
      setTopics(scheduledTopics);
    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate topics');
    } finally {
      setLoading(false);
    }
  };

  // Save email sequence to database
  const saveSequence = async () => {
    try {
      const { error } = await supabase
        .from('emails')
        .insert(
          topics.map(topic => ({
            campaign_id: campaign.id,
            subject: topic.topic,
            content: topic.description,
            scheduled_at: new Date(topic.date).toISOString(),
            status: 'pending',
            metadata: {
              sequence_type: selectedType,
              topic: {
                name: topic.topic,
                description: topic.description,
                stage: SEQUENCE_TYPES[selectedType].stages[
                  Math.floor(
                    (topics.indexOf(topic) / topics.length) * 
                    SEQUENCE_TYPES[selectedType].stages.length
                  )
                ]
              }
            }
          }))
        );

      if (error) throw error;
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save sequence');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Email Sequence Planner</h2>
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
          <p className="text-gray-400">
            Plan your email sequence for {campaign.duration} days with {campaign.emails_per_week} emails per week
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">
                Sequence Type
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as keyof typeof SEQUENCE_TYPES)}
                className="w-full p-2 bg-background-secondary rounded-lg border border-gray-700 focus:outline-none focus:border-primary"
              >
                {Object.entries(SEQUENCE_TYPES).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-sm text-gray-400">
                {SEQUENCE_TYPES[selectedType].description}
              </p>
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Sequence Stages:</h4>
                <div className="flex flex-wrap gap-2">
                  {SEQUENCE_TYPES[selectedType].stages.map((stage, index) => (
                    <span
                      key={stage}
                      className="px-2 py-1 bg-background-secondary rounded text-sm text-gray-300"
                    >
                      {index + 1}. {stage}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mb-4 flex justify-between items-center">
              <h3 className="text-xl font-semibold">Email Topics</h3>
              <Button
                onClick={generateTopics}
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generating...
                  </span>
                ) : 'Generate Topics'}
              </Button>
            </div>

            {error && (
              <div className="text-red-500 mb-4">{error}</div>
            )}

            <div className="space-y-4 mb-6">
              {topics.map((topic, index) => (
                <Card key={index} variant="hover">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-semibold">{topic.topic}</h4>
                      <p className="text-sm text-gray-400">{topic.description}</p>
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(topic.date).toLocaleDateString()}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {topics.length > 0 && (
              <Button onClick={saveSequence}>
                Save Sequence
              </Button>
            )}
          </div>

          <div>
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              validRange={{
                start: startDate,
                end: endDate
              }}
              events={topics.map(topic => ({
                title: topic.topic,
                date: topic.date,
                backgroundColor: '#3b82f6',
                borderColor: '#2563eb'
              }))}
              height="auto"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: ''
              }}
            />
          </div>
        </div>
      </Card>
    </div>
  );
} 