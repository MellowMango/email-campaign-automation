export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Profile>;
      };
      campaigns: {
        Row: Campaign;
        Insert: Omit<Campaign, 'created_at' | 'updated_at'>;
        Update: Partial<Campaign>;
      };
      contacts: {
        Row: Contact;
        Insert: Omit<Contact, 'created_at' | 'updated_at'>;
        Update: Partial<Contact>;
      };
      contact_lists: {
        Row: ContactList;
        Insert: Omit<ContactList, 'created_at' | 'updated_at'>;
        Update: Partial<ContactList>;
      };
      contact_list_members: {
        Row: ContactListMember;
        Insert: ContactListMember;
        Update: Partial<ContactListMember>;
      };
      emails: {
        Row: Email;
        Insert: Omit<Email, 'created_at'>;
        Update: Partial<Email>;
      };
      analytics: {
        Row: Analytics;
        Insert: Analytics;
        Update: Partial<Analytics>;
      };
      ai_logs: {
        Row: AILog;
        Insert: AILog;
        Update: Partial<AILog>;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

export interface Profile {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  full_name?: string;
  company_name?: string;
  role?: string;
  avatar_url?: string;
}

export interface Campaign {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  target_audience?: string;
  goals?: string;
  value_proposition?: string;
  email_tone?: 'formal' | 'casual' | 'professional' | 'friendly';
  campaign_type: 'manual' | 'ai-adaptive';
  duration: number;
  emails_per_week: number;
  company_name?: string;
  features: {
    adaptive_sequences: boolean;
    auto_responder: boolean;
    lead_scoring: boolean;
  };
  analytics?: {
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
  };
  cta_links: {
    awareness: string;
    conversion: string;
    nurture: string;
  };
  sequence_type: 'awareness' | 'conversion' | 'nurture';
}

export interface Contact {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  campaign_id?: string;
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  position?: string;
  linkedin_url?: string;
  status: 'new' | 'contacted' | 'responded' | 'converted' | 'unsubscribed';
  last_contacted?: string;
  notes?: string;
  custom_fields?: Record<string, string | number | boolean | null>;
  engagement_score: number;
  last_engagement?: string;
  metadata?: Record<string, any>;
}

export interface ContactList {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  name: string;
  description?: string;
  type: 'manual' | 'dynamic' | 'segment';
  rules?: {
    conditions?: Array<{
      field: string;
      operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'between';
      value: any;
    }>;
    combination: 'and' | 'or';
  };
  metadata?: Record<string, any>;
}

export interface ContactListMember {
  contact_id: string;
  list_id: string;
  added_at: string;
  score: number;
  engagement_metrics: {
    opens: number;
    clicks: number;
    replies: number;
  };
}

export interface Email {
  id: string;
  campaign_id: string;
  subject: string;
  content: string;
  template_content?: string;
  scheduled_at: string | null;
  sent_at: string | null;
  status: 'draft' | 'ready' | 'pending' | 'sent' | 'failed';
  created_at: string;
  metadata?: {
    signature_template?: string;
    recipient_placeholders?: string[];
    sequence_type?: 'awareness' | 'conversion' | 'nurture';
    topic?: {
      name: string;
      description: string;
      stage: string;
    };
  };
}

export interface Analytics {
  id: string;
  campaign_id: string;
  metric: string;
  value: number;
  recorded_at: string;
}

export interface AILog {
  id: string;
  campaign_id: string;
  prompt: string;
  response: string;
  generated_at: string;
} 