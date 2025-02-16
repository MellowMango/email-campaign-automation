export interface EmailProvider {
  sendEmail(options: SendEmailOptions): Promise<SendEmailResult>;
  verifyDomain(domain: string, userId: string): Promise<DomainVerificationResult>;
  verifySender(email: string, userId: string): Promise<SenderVerificationResult>;
  checkSendingLimits(userId: string): Promise<SendingLimits>;
}

export interface SendEmailOptions {
  to: string | string[];
  from: {
    email: string;
    name?: string;
  };
  subject: string;
  content: string;
  metadata: {
    emailId: string;
    campaignId?: string;
    userId: string;
  };
  trackingSettings?: {
    clickTracking?: boolean;
    openTracking?: boolean;
  };
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface DomainVerificationResult {
  success: boolean;
  domain: string;
  dnsRecords?: DnsRecord[];
  error?: string;
}

export interface DnsRecord {
  type: string;
  host: string;
  data: string;
}

export interface SenderVerificationResult {
  success: boolean;
  email: string;
  verified: boolean;
  error?: string;
}

export interface SendingLimits {
  dailyLimit: number;
  remainingToday: number;
  rateLimitDelay: number;
}

// Future Pro plan interfaces
export interface SubuserManagement {
  createSubuser(options: CreateSubuserOptions): Promise<SubuserResult>;
  updateSubuser(id: string, options: UpdateSubuserOptions): Promise<SubuserResult>;
  deleteSubuser(id: string): Promise<void>;
}

export interface CreateSubuserOptions {
  username: string;
  email: string;
  password: string;
  ips?: string[];
}

export interface UpdateSubuserOptions {
  password?: string;
  ips?: string[];
}

export interface SubuserResult {
  id: string;
  username: string;
  email: string;
  status: 'active' | 'disabled';
  ips: string[];
  created_at: string;
  updated_at: string;
} 