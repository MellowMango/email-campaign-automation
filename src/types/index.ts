export type {
  Profile,
  Campaign,
  Contact,
  ContactList,
  ContactListMember,
  Email,
  Analytics,
  AILog
} from './supabase';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  status: 'read' | 'unread';
  created_at: string;
  updated_at: string;
  metadata?: {
    action?: {
      label: string;
      url: string;
    };
  };
} 