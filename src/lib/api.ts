const API_BASE = '/api';

export function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setToken(token: string) {
  localStorage.setItem('token', token);
}

export function clearToken() {
  localStorage.removeItem('token');
}

async function apiCall<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_BASE}${path}`, {
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

function mapMessage(raw: any): import('./types').Message {
  return {
    id: raw.id,
    temp_email_id: raw.temp_email_id,
    from: raw.sender,
    to: raw.recipient,
    subject: raw.subject || '',
    body_text: raw.body_text || '',
    body_html: raw.body_html,
    otp: raw.otp,
    received_at: raw.received_at,
    size_bytes: raw.size_bytes || 0,
  };
}

// ============================================================
// AUTH API
// ============================================================

export const authApi = {
  async register(username: string, email: string, password: string) {
    return apiCall('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
  },

  async login(username: string, password: string): Promise<{ token: string }> {
    const data = await apiCall<{ token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    return { token: data.token };
  },

  async getProfile(): Promise<import('./types').Profile> {
    const data = await apiCall<{ profile: import('./types').Profile }>('/auth/me');
    return data.profile;
  },

  async changePassword(currentPassword: string, newPassword: string) {
    return apiCall('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },
};

// ============================================================
// EMAIL API
// ============================================================

export const emailApi = {
  async create(emailLocal: string): Promise<{ email: any; expiresIn?: string; existing: boolean }> {
    const data = await apiCall<{ email: any; expiresIn?: string; existing?: boolean }>('/email/create', {
      method: 'POST',
      body: JSON.stringify({ emailLocal }),
    });
    return { email: data.email, expiresIn: data.expiresIn, existing: !!data.existing };
  },

  async getInbox(): Promise<import('./types').InboxEmail[]> {
    const data = await apiCall<{ emails: import('./types').InboxEmail[] }>('/email/inbox');
    return data.emails;
  },

  async remove(tempEmailId: string): Promise<void> {
    await apiCall(`/email/${tempEmailId}`, { method: 'DELETE' });
  },

  async getMessages(tempEmailId: string): Promise<import('./types').Message[]> {
    const data = await apiCall<{ messages: any[] }>(`/email/${tempEmailId}/messages`);
    return data.messages.map(mapMessage);
  },

  async getMessage(tempEmailId: string, messageId: string): Promise<import('./types').Message> {
    const data = await apiCall<{ message: any }>(`/email/${tempEmailId}/message/${messageId}`);
    return mapMessage(data.message);
  },

  async testSend(to: string, subject: string, body: string): Promise<{ otp: string | null }> {
    const data = await apiCall<{ otp: string | null }>('/email/test-send', {
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
  async getPendingUsers(): Promise<import('./types').Profile[]> {
    const data = await apiCall<{ pendingUsers: import('./types').Profile[] }>('/admin/users/pending');
    return data.pendingUsers;
  },

  async getApprovedUsers(): Promise<import('./types').Profile[]> {
    const data = await apiCall<{ approvedUsers: import('./types').Profile[] }>('/admin/users/approved');
    return data.approvedUsers;
  },

  async approveUser(userId: string, approve: boolean) {
    return apiCall('/admin/approve-user', {
      method: 'POST',
      body: JSON.stringify({ userId, approve }),
    });
  },

  async resetPassword(userId: string): Promise<{ tempPassword: string; user: { username: string; email: string } }> {
    const data = await apiCall<{ tempPassword: string; user: { username: string; email: string } }>('/admin/reset-password', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    return { tempPassword: data.tempPassword, user: data.user };
  },

  async deactivateUser(userId: string) {
    return apiCall('/admin/deactivate-user', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },

  async getStats(): Promise<import('./types').AdminStats> {
    const data = await apiCall<{ stats: import('./types').AdminStats }>('/admin/stats');
    return data.stats;
  },

  async updateConfig(updates: Partial<import('./types').AppConfig>): Promise<import('./types').AppConfig> {
    const data = await apiCall<{ config: import('./types').AppConfig }>('/admin/config/update', {
      method: 'POST',
      body: JSON.stringify(updates),
    });
    return data.config;
  },

  async getConfig(): Promise<import('./types').AppConfig> {
    const data = await apiCall<{ config: import('./types').AppConfig }>('/config');
    return data.config;
  },
};
