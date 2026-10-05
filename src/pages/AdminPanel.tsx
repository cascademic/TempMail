import { useState, useEffect, useCallback } from 'react';
import {
  Users, UserCheck, Mail, MessageSquare, Settings, Shield,
  Check, X, KeyRound, UserX, Copy, Clock, Save, AlertCircle,
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useAuth } from '@/lib/auth-context';
import type { Profile, AppConfig, AdminStats } from '@/lib/types';
import LoadingSpinner from '@/components/LoadingSpinner';
import Modal from '@/components/Modal';

type Tab = 'overview' | 'users' | 'config';

export default function AdminPanel() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pendingUsers, setPendingUsers] = useState<Profile[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<Profile[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Config form state
  const [configForm, setConfigForm] = useState<Partial<AppConfig>>({});
  const [savingConfig, setSavingConfig] = useState(false);

  // Modal state
  const [tempPasswordModal, setTempPasswordModal] = useState<{ password: string; username: string; email: string } | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Profile | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, pending, approved, cfg] = await Promise.all([
        adminApi.getStats(),
        adminApi.getPendingUsers(),
        adminApi.getApprovedUsers(),
        adminApi.getConfig(),
      ]);
      setStats(s);
      setPendingUsers(pending);
      setApprovedUsers(approved);
      setConfig(cfg);
      setConfigForm({
        email_ttl_seconds: cfg.email_ttl_seconds,
        max_emails_per_user: cfg.max_emails_per_user,
        service_name: cfg.service_name,
        email_domain: cfg.email_domain,
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load admin data', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApprove = async (userId: string, approve: boolean) => {
    try {
      await adminApi.approveUser(userId, approve);
      showToast(approve ? 'User approved' : 'User rejected', 'success');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update user', 'error');
    }
  };

  const handleResetPassword = async (userId: string) => {
    try {
      const { tempPassword, user } = await adminApi.resetPassword(userId);
      setTempPasswordModal({ password: tempPassword, username: user.username, email: user.email });
      showToast('Password reset successfully', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to reset password', 'error');
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      await adminApi.deactivateUser(deactivateTarget.id);
      showToast('User deactivated', 'success');
      setDeactivateTarget(null);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to deactivate user', 'error');
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const updated = await adminApi.updateConfig(configForm);
      setConfig(updated);
      showToast('Configuration saved', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save config', 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} copied`, 'success');
  };

  if (!profile?.is_admin) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Access Denied</h2>
          <p className="text-slate-500 text-sm">You need admin privileges to access this page.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-800">Admin Panel</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage users, configuration, and view statistics</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 bg-white border border-slate-200 rounded-lg p-1 w-fit">
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={<Shield className="w-4 h-4" />} label="Overview" />
          <TabButton active={tab === 'users'} onClick={() => setTab('users')} icon={<Users className="w-4 h-4" />} label="Users" />
          <TabButton active={tab === 'config'} onClick={() => setTab('config')} icon={<Settings className="w-4 h-4" />} label="Config" />
        </div>

        {/* OVERVIEW TAB */}
        {tab === 'overview' && stats && (
          <div className="space-y-6 animate-fade-in">
            {/* Stats cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={<Users className="w-5 h-5" />}
                label="Pending Users"
                value={stats.pendingUsers}
                color="amber"
              />
              <StatCard
                icon={<UserCheck className="w-5 h-5" />}
                label="Approved Users"
                value={stats.approvedUsers}
                color="emerald"
              />
              <StatCard
                icon={<Mail className="w-5 h-5" />}
                label="Total Emails"
                value={stats.totalEmails}
                color="blue"
              />
              <StatCard
                icon={<MessageSquare className="w-5 h-5" />}
                label="Total Messages"
                value={stats.totalMessages}
                color="purple"
              />
            </div>

            {/* Pending approvals */}
            {pendingUsers.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    Pending Approvals ({pendingUsers.length})
                  </h3>
                </div>
                <div className="divide-y divide-slate-50">
                  {pendingUsers.map((user) => (
                    <div key={user.id} className="flex items-center justify-between px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{user.username}</p>
                        <p className="text-xs text-slate-400">
                          Requested {new Date(user.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleApprove(user.id, true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Approve
                        </button>
                        <button
                          onClick={() => handleApprove(user.id, false)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pendingUsers.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                <UserCheck className="w-10 h-10 text-emerald-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No pending approvals. Everyone is up to date.</p>
              </div>
            )}
          </div>
        )}

        {/* USERS TAB */}
        {tab === 'users' && (
          <div className="space-y-6 animate-fade-in">
            {/* Approved users */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">
                  Approved Users ({approvedUsers.length})
                </h3>
              </div>
              {approvedUsers.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No approved users yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <th className="text-left text-xs font-medium text-slate-500 px-5 py-2.5">Username</th>
                        <th className="text-left text-xs font-medium text-slate-500 px-5 py-2.5 hidden sm:table-cell">Emails Created</th>
                        <th className="text-left text-xs font-medium text-slate-500 px-5 py-2.5 hidden md:table-cell">Last Login</th>
                        <th className="text-left text-xs font-medium text-slate-500 px-5 py-2.5 hidden lg:table-cell">Approved</th>
                        <th className="text-right text-xs font-medium text-slate-500 px-5 py-2.5">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {approvedUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                                {user.username.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm font-medium text-slate-700">{user.username}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-sm text-slate-600 hidden sm:table-cell">{user.emails_created || 0}</td>
                          <td className="px-5 py-3 text-sm text-slate-600 hidden md:table-cell">
                            {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                          </td>
                          <td className="px-5 py-3 text-sm text-slate-600 hidden lg:table-cell">
                            {user.approved_at ? new Date(user.approved_at).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleResetPassword(user.id)}
                                className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                title="Reset password"
                              >
                                <KeyRound className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeactivateTarget(user)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Deactivate"
                              >
                                <UserX className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CONFIG TAB */}
        {tab === 'config' && config && (
          <div className="max-w-2xl animate-fade-in">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">Service Configuration</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Last updated {new Date(config.updated_at).toLocaleString()}
                </p>
              </div>
              <div className="p-5 space-y-5">
                <ConfigField
                  label="Service Name"
                  description="Displayed in the app header and emails"
                >
                  <input
                    type="text"
                    value={configForm.service_name || ''}
                    onChange={(e) => setConfigForm({ ...configForm, service_name: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </ConfigField>

                <ConfigField
                  label="Email Domain"
                  description="Domain for temporary email addresses"
                >
                  <input
                    type="text"
                    value={configForm.email_domain || ''}
                    onChange={(e) => setConfigForm({ ...configForm, email_domain: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </ConfigField>

                <ConfigField
                  label="Email TTL (seconds)"
                  description="How long temp emails live before auto-deletion (minimum: 60)"
                >
                  <input
                    type="number"
                    min={60}
                    value={configForm.email_ttl_seconds || 3600}
                    onChange={(e) => setConfigForm({ ...configForm, email_ttl_seconds: parseInt(e.target.value) || 60 })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    = {Math.floor((configForm.email_ttl_seconds || 3600) / 60)} minutes
                  </p>
                </ConfigField>

                <ConfigField
                  label="Max Emails Per User"
                  description="Maximum temp email addresses a user can create"
                >
                  <input
                    type="number"
                    min={1}
                    value={configForm.max_emails_per_user || 100}
                    onChange={(e) => setConfigForm({ ...configForm, max_emails_per_user: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </ConfigField>

                <div className="pt-3 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={handleSaveConfig}
                    disabled={savingConfig}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {savingTest(savingConfig)}
                    <Save className="w-4 h-4" />
                    {savingConfig ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Temp Password Modal */}
      <Modal
        open={!!tempPasswordModal}
        onClose={() => setTempPasswordModal(null)}
        title="Temporary Password"
        footer={
          <button
            onClick={() => setTempPasswordModal(null)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Done
          </button>
        }
      >
        {tempPasswordModal && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              A temporary password has been generated for <span className="font-medium text-slate-700">{tempPasswordModal.username}</span>. Share it securely.
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-center justify-between">
              <code className="text-lg font-mono font-bold text-slate-800 tracking-wide">
                {tempPasswordModal.password}
              </code>
              <button
                onClick={() => handleCopy(tempPasswordModal.password, 'Password')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm text-slate-600 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              The user should change this password after signing in.
            </div>
          </div>
        )}
      </Modal>

      {/* Deactivate Confirmation Modal */}
      <Modal
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        title="Deactivate User"
        footer={
          <>
            <button
              onClick={() => setDeactivateTarget(null)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDeactivate}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Deactivate
            </button>
          </>
        }
      >
        {deactivateTarget && (
          <p className="text-sm text-slate-600">
            Are you sure you want to deactivate <span className="font-medium text-slate-800">{deactivateTarget.username}</span>? They will lose access immediately and need re-approval to sign in again.
          </p>
        )}
      </Modal>
    </div>
  );
}

function savingTest(saving: boolean) {
  if (!saving) return null;
  return <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />;
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-colors ${
        active ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: 'amber' | 'emerald' | 'blue' | 'purple' }) {
  const colors = {
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${colors[color]}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function ConfigField({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <p className="text-xs text-slate-400 mb-2">{description}</p>
      {children}
    </div>
  );
}
