export interface Profile {
  id: string;
  username: string;
  is_approved: boolean;
  is_admin: boolean;
  approved_by: string | null;
  approved_at: string | null;
  emails_created: number;
  last_login: string | null;
  created_at: string;
  email?: string;
}

export interface TempEmail {
  id: string;
  email: string;
  owner_user_id: string;
  created_at: string;
  expires_at: string;
  message_count: number;
}

export interface Message {
  id: string;
  temp_email_id: string;
  from: string;
  to: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  otp: string | null;
  received_at: string;
  size_bytes: number;
}

export interface AppConfig {
  id: number;
  email_ttl_seconds: number;
  max_emails_per_user: number;
  service_name: string;
  email_domain: string;
  updated_at: string;
  updated_by: string | null;
}

export interface InboxEmail {
  id: string;
  email: string;
  messageCount: number;
  createdAt: string;
  expiresAt: string;
  latestMessage: {
    subject: string;
    from: string;
    receivedAt: string;
  } | null;
}

export interface AdminStats {
  pendingUsers: number;
  approvedUsers: number;
  totalEmails: number;
  totalMessages: number;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile>;
        Update: Partial<Profile>;
      };
      temp_emails: {
        Row: TempEmail;
        Insert: Partial<TempEmail>;
        Update: Partial<TempEmail>;
      };
      messages: {
        Row: Message;
        Insert: Partial<Message>;
        Update: Partial<Message>;
      };
      app_config: {
        Row: AppConfig;
        Insert: Partial<AppConfig>;
        Update: Partial<AppConfig>;
      };
    };
  };
}
