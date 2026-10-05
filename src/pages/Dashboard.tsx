import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Mail, Clock, Trash2, RefreshCw, Copy, KeyRound,
  Inbox, Send, ChevronRight, ArrowLeft, AlertCircle,
} from 'lucide-react';
import { emailApi, adminApi } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useAuth } from '@/lib/auth-context';
import type { InboxEmail, Message, AppConfig } from '@/lib/types';
import LoadingSpinner from '@/components/LoadingSpinner';
import Modal from '@/components/Modal';

export default function Dashboard() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [inbox, setInbox] = useState<InboxEmail[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<InboxEmail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newEmailLocal, setNewEmailLocal] = useState('');
  const [creating, setCreating] = useState(false);

  const [showTestSend, setShowTestSend] = useState(false);
  const [testSubject, setTestSubject] = useState('');
  const [testBody, setTestBody] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const c = await adminApi.getConfig();
      setConfig(c);
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  }, []);

  const loadInbox = useCallback(async () => {
    setLoadingInbox(true);
    try {
      const emails = await emailApi.getInbox();
      setInbox(emails);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load inbox', 'error');
    } finally {
      setLoadingInbox(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadConfig();
    loadInbox();
  }, [loadConfig, loadInbox]);

  // Auto-refresh inbox every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadInbox();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadInbox]);

  const handleCreateEmail = async () => {
    if (!newEmailLocal) return;
    setCreating(true);
    try {
      const { email, expiresIn } = await emailApi.create(newEmailLocal);
      showToast(`Email created: ${email.email} (expires in ${expiresIn})`, 'success');
      setShowCreate(false);
      setNewEmailLocal('');
      await loadInbox();
      setSelectedEmail({
        id: email.id,
        email: email.email,
        messageCount: 0,
        createdAt: email.created_at,
        expiresAt: email.expires_at,
        latestMessage: null,
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create email', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleSelectEmail = async (email: InboxEmail) => {
    setSelectedEmail(email);
    setSelectedMessage(null);
    setLoadingMessages(true);
    try {
      const msgs = await emailApi.getMessages(email.id);
      setMessages(msgs);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load messages', 'error');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSelectMessage = async (msg: Message) => {
    setLoadingMessage(true);
    try {
      const full = await emailApi.getMessage(msg.temp_email_id, msg.id);
      setSelectedMessage(full);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load message', 'error');
    } finally {
      setLoadingMessage(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} copied to clipboard`, 'success');
  };

  const handleTestSend = async () => {
    if (!selectedEmail || !testSubject || !testBody) return;
    setSendingTest(true);
    try {
      const { otp } = await emailApi.testSend(selectedEmail.email, testSubject, testBody);
      showToast(otp ? `Test email sent! OTP detected: ${otp}` : 'Test email sent!', 'success');
      setShowTestSend(false);
      setTestSubject('');
      setTestBody('');
      const msgs = await emailApi.getMessages(selectedEmail.id);
      setMessages(msgs);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to send test email', 'error');
    } finally {
      setSendingTest(false);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  const formatExpiry = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    if (diff <= 0) return 'expired';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s left`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m left`;
    return `${Math.floor(diff / 3600000)}h left`;
  };

  if (!profile?.is_approved) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Pending Approval</h2>
          <p className="text-slate-500 text-sm">
            Your account is awaiting administrator approval. You'll be able to access the inbox once approved.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Action bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Your Inbox</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {config && (
                <>
                  Domain: <span className="font-medium text-slate-600">@{config.email_domain}</span>
                  {' · '}
                  TTL: <span className="font-medium text-slate-600">{Math.floor(config.email_ttl_seconds / 60)} min</span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadInbox}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Email
            </button>
          </div>
        </div>

        {/* Two-panel layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
          {/* Left panel: Email list */}
          <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Inbox className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">
                  Emails ({inbox.length})
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingInbox ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner />
                </div>
              ) : inbox.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <Mail className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-sm text-slate-400">No temp emails yet</p>
                  <p className="text-xs text-slate-400 mt-1">Create one to get started</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {inbox.map((email, idx) => (
                    <button
                      key={email.id}
                      onClick={() => handleSelectEmail(email)}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors animate-fade-in ${
                        selectedEmail?.id === email.id ? 'bg-blue-50 border-l-3 border-blue-500' : ''
                      }`}
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-medium text-slate-700 truncate">{email.email}</span>
                        {email.messageCount > 0 && (
                          <span className="flex-shrink-0 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                            {email.messageCount}
                          </span>
                        )}
                      </div>
                      {email.latestMessage ? (
                        <div className="text-xs text-slate-500 truncate">
                          <span className="text-slate-600">{email.latestMessage.from}</span>
                          {' · '}
                          {email.latestMessage.subject || '(no subject)'}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">No messages yet</div>
                      )}
                      <div className="flex items-center gap-1 mt-1 text-xs text-slate-400">
                        <Clock className="w-3 h-3" />
                        {formatExpiry(email.expiresAt)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right panel: Messages / Message viewer */}
          <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
            {!selectedEmail ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                  <Mail className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-sm font-medium text-slate-600">Select an email to view messages</h3>
                <p className="text-xs text-slate-400 mt-1">Or create a new temp email address</p>
              </div>
            ) : selectedMessage ? (
              /* Message viewer */
              <div className="flex-1 flex flex-col">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => setSelectedMessage(null)}
                    className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to messages
                  </button>
                  <button
                    onClick={() => handleCopy(selectedMessage.to, 'Email address')}
                    className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Copy address</span>
                  </button>
                </div>

                {loadingMessage ? (
                  <div className="flex-1 flex items-center justify-center">
                    <LoadingSpinner />
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                    {/* OTP highlight */}
                    {selectedMessage.otp && (
                      <div className="mb-4 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-4 animate-fade-in">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center">
                            <KeyRound className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs text-emerald-700 font-medium">OTP Detected</p>
                            <p className="text-2xl font-bold text-emerald-800 tracking-wider mt-0.5">{selectedMessage.otp}</p>
                          </div>
                          <button
                            onClick={() => handleCopy(selectedMessage.otp!, 'OTP')}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copy
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Email headers */}
                    <div className="space-y-3 mb-6">
                      <h2 className="text-lg font-bold text-slate-800">
                        {selectedMessage.subject || '(no subject)'}
                      </h2>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex gap-2">
                          <span className="text-slate-400 w-16 flex-shrink-0">From</span>
                          <span className="text-slate-700">{selectedMessage.from}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-slate-400 w-16 flex-shrink-0">To</span>
                          <span className="text-slate-700">{selectedMessage.to}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-slate-400 w-16 flex-shrink-0">Date</span>
                          <span className="text-slate-700">{new Date(selectedMessage.received_at).toLocaleString()}</span>
                        </div>
                        {selectedMessage.size_bytes > 0 && (
                          <div className="flex gap-2">
                            <span className="text-slate-400 w-16 flex-shrink-0">Size</span>
                            <span className="text-slate-700">{(selectedMessage.size_bytes / 1024).toFixed(1)} KB</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-4">
                      {/* Email body */}
                      {selectedMessage.body_html ? (
                        <div
                          className="prose prose-sm max-w-none text-slate-700 [&_a]:text-blue-600 [&_a]:underline"
                          dangerouslySetInnerHTML={{ __html: selectedMessage.body_html }}
                        />
                      ) : (
                        <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                          {selectedMessage.body_text || '(empty body)'}
                        </pre>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Messages list for selected email */
              <div className="flex-1 flex flex-col">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{selectedEmail.email}</p>
                    <p className="text-xs text-slate-400">
                      {selectedEmail.messageCount} message{selectedEmail.messageCount !== 1 ? 's' : ''} · {formatExpiry(selectedEmail.expiresAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleCopy(selectedEmail.email, 'Email address')}
                      className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors px-2 py-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setShowTestSend(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-600 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Test Send</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center py-12">
                      <LoadingSpinner />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                      <Inbox className="w-10 h-10 text-slate-300 mb-3" />
                      <p className="text-sm text-slate-400">No messages yet</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Send an email to {selectedEmail.email} or use Test Send
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {messages.map((msg, idx) => (
                        <button
                          key={msg.id}
                          onClick={() => handleSelectMessage(msg)}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors animate-fade-in"
                          style={{ animationDelay: `${idx * 50}ms` }}
                        >
                          <div className="flex items-start justify-between gap-3 mb-1">
                            <span className="text-sm font-medium text-slate-700 truncate">{msg.from}</span>
                            <span className="text-xs text-slate-400 flex-shrink-0">{formatTime(msg.received_at)}</span>
                          </div>
                          <p className="text-sm text-slate-600 truncate">{msg.subject || '(no subject)'}</p>
                          <p className="text-xs text-slate-400 truncate mt-0.5">
                            {msg.body_text.substring(0, 80)}
                            {msg.body_text.length > 80 ? '...' : ''}
                          </p>
                          {msg.otp && (
                            <div className="mt-1.5 inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-medium">
                              <KeyRound className="w-3 h-3" />
                              OTP: {msg.otp}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Email Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Temp Email"
        footer={
          <>
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateEmail}
              disabled={creating || !newEmailLocal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {creating && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {creating ? 'Creating...' : 'Create'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Enter a name for your temporary email address. Emails sent to this address will appear in your inbox.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Email address</label>
            <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
              <input
                type="text"
                value={newEmailLocal}
                onChange={(e) => setNewEmailLocal(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                placeholder="myname"
                className="flex-1 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateEmail()}
                autoFocus
              />
              <span className="px-3 py-2.5 text-sm text-slate-500 bg-slate-50 border-l border-slate-200">
                @{config?.email_domain || 'tempmail.tk'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              3-64 characters: letters, numbers, dots, hyphens, underscores
            </p>
          </div>
        </div>
      </Modal>

      {/* Test Send Modal */}
      <Modal
        open={showTestSend}
        onClose={() => setShowTestSend(false)}
        title="Send Test Email"
        footer={
          <>
            <button
              onClick={() => setShowTestSend(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleTestSend}
              disabled={sendingTest || !testSubject || !testBody}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {sendingTest && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {sendingTest ? 'Sending...' : 'Send'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Send a test email to <span className="font-medium text-slate-700">{selectedEmail?.email}</span>. Include a number like "123456" to test OTP detection.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Subject</label>
            <input
              type="text"
              value={testSubject}
              onChange={(e) => setTestSubject(e.target.value)}
              placeholder="Test subject"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Body</label>
            <textarea
              value={testBody}
              onChange={(e) => setTestBody(e.target.value)}
              placeholder="Your verification code is 123456"
              rows={4}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
