export interface Email {
  id: string;
  campaign_id: string;
  subject: string;
  content: string;
  scheduled_at: string | null;
  sent_at: string | null;
  status: 'pending' | 'sent' | 'failed';
  created_at: string;
  updated_at: string;
  metadata?: {
    sequence_type?: 'awareness' | 'conversion' | 'nurture';
    topic?: {
      name: string;
      description: string;
      stage: string;
    };
  };
  campaigns?: {
    company_name: string;
    user_id: string;
  };
}

export interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  company: string | null;
  status: string;
  last_contacted: string | null;
  campaign_id: string | null;
} 