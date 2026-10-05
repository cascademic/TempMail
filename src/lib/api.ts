import { EDGE_FUNCTIONS_BASE, supabase } from './supabase';
import type { AppConfig, AdminStats, Profile, InboxEmail, Message, TempEmail } from './types';

async function callEdgeFunction(name: string, path: string, options: RequestInit = {}) {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;

  const response = await fetch(`${EDGE_FUNCTIONS_BASE}/${name}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

// ============================================================
// AUTH API
// ============================================================

export const authApi = {
  async register(username: string, email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
      },
    });

    if (error) throw error;
    return data;
  },

  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  },

  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getProfile(): Promise<Profile> {
    const data = await callEdgeFunction('admin-ops', '/profile');
    return data.profile;
  },

  async updateLastLogin() {
    await callEdgeFunction('admin-ops', '/update-last-login', { method: 'POST' });
  },

  async changePassword(newPassword: string) {
    await callEdgeFunction('admin-ops', '/change-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    });
  },
};

// ============================================================
// EMAIL API
// ============================================================

export const emailApi = {
  async create(emailLocal: string): Promise<{ email: TempEmail; expiresIn: string }> {
    const data = await callEdgeFunction('email-ops', '/create', {
      method: 'POST',
      body: JSON.stringify({ emailLocal }),
    });
    return { email: data.email, expiresIn: data.expiresIn };
  },

  async getInbox(): Promise<InboxEmail[]> {
    const data = await callEdgeFunction('email-ops', '/inbox');
    return data.emails;
  },

  async getMessages(tempEmailId: string): Promise<Message[]> {
    const data = await callEdgeFunction('email-ops', `/messages/${tempEmailId}`);
    return data.messages;
  },

  async getMessage(tempEmailId: string, messageId: string): Promise<Message> {
    const data = await callEdgeFunction('email-ops', `/message/${tempEmailId}/${messageId}`);
    return data.message;
  },

  async testSend(to: string, subject: string, body: string): Promise<{ otp: string | null }> {
    const data = await callEdgeFunction('email-ops', '/test-send', {
      method: 'POST',
      body: JSON.stringify({ to, subject, body }),
    });
    return { otp: data.otp };
  },
};

// ============================================================
// ADMIN API
// ============================================================

export const adminApi = {
  async getPendingUsers(): Promise<Profile[]> {
    const data = await callEdgeFunction('admin-ops', '/pending-users');
    return data.pendingUsers;
  },

  async getApprovedUsers(): Promise<Profile[]> {
    const data = await callEdgeFunction('admin-ops', '/approved-users');
    return data.approvedUsers;
  },

  async getAllUsers(): Promise<Profile[]> {
    const data = await callEdgeFunction('admin-ops', '/all-users');
    return data.users;
  },

  async approveUser(userId: string, approve: boolean): Promise<Profile> {
    const data = await callEdgeFunction('admin-ops', '/approve-user', {
      method: 'POST',
      body: JSON.stringify({ userId, approve }),
    });
    return data.user;
  },

  async resetPassword(userId: string): Promise<{ tempPassword: string; user: { username: string; email: string } }> {
    const data = await callEdgeFunction('admin-ops', '/reset-password', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    return { tempPassword: data.tempPassword, user: data.user };
  },

  async deactivateUser(userId: string): Promise<void> {
    await callEdgeFunction('admin-ops', '/deactivate-user', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },

  async getStats(): Promise<AdminStats> {
    const data = await callEdgeFunction('admin-ops', '/stats');
    return data.stats;
  },

  async updateConfig(updates: Partial<AppConfig>): Promise<AppConfig> {
    const data = await callEdgeFunction('admin-ops', '/config', {
      method: 'POST',
      body: JSON.stringify(updates),
    });
    return data.config;
  },

  async getConfig(): Promise<AppConfig> {
    const { data, error } = await supabase
      .from('app_config')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Configuration not found');
    return data as AppConfig;
  },
};
