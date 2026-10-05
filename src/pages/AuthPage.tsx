import { useState, type ReactNode } from 'react';
import { Mail, Lock, User, Eye, EyeOff, ArrowLeft, Info } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';

type AuthView = 'login' | 'register' | 'forgot';

interface AuthPageProps {
  initialView?: AuthView;
}

export default function AuthPage({ initialView = 'login' }: AuthPageProps) {
  const [view, setView] = useState<AuthView>(initialView);
  const { signIn, signUp } = useAuth();
  const { showToast } = useToast();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-300/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg mb-3">
            <Mail className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">TempMail</h1>
          <p className="text-sm text-slate-500 mt-1">Temporary email, on demand</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 animate-fade-in-up">
          {view === 'login' && <LoginForm onSwitchView={setView} signIn={signIn} showToast={showToast} />}
          {view === 'register' && <RegisterForm onSwitchView={setView} signUp={signUp} showToast={showToast} />}
          {view === 'forgot' && <ForgotForm onSwitchView={setView} />}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// LOGIN FORM
// ============================================================

function LoginForm({
  onSwitchView,
  signIn,
  showToast,
}: {
  onSwitchView: (v: AuthView) => void;
  signIn: (email: string, password: string) => Promise<void>;
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      await signIn(email, password);
      showToast('Welcome back!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Sign in failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Sign In</h2>
        <p className="text-sm text-slate-500 mt-1">Welcome back to your inbox</p>
      </div>

      <FormField label="Email" icon={<Mail className="w-4 h-4" />}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
      </FormField>

      <FormField label="Password" icon={<Lock className="w-4 h-4" />}>
        <input
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </FormField>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
        {loading ? 'Signing in...' : 'Sign In'}
      </button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => onSwitchView('forgot')}
          className="text-slate-500 hover:text-blue-600 transition-colors"
        >
          Forgot password?
        </button>
        <button
          type="button"
          onClick={() => onSwitchView('register')}
          className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
        >
          Create account
        </button>
      </div>
    </form>
  );
}

// ============================================================
// REGISTER FORM
// ============================================================

function RegisterForm({
  onSwitchView,
  signUp,
  showToast,
}: {
  onSwitchView: (v: AuthView) => void;
  signUp: (username: string, email: string, password: string) => Promise<void>;
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username.length < 3 || username.length > 50) {
      showToast('Username must be 3-50 characters', 'error');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      showToast('Username can only contain letters, numbers, and underscores', 'error');
      return;
    }
    if (password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    setLoading(true);
    try {
      await signUp(username, email, password);
      showToast('Account created! Pending admin approval.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Registration failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Create Account</h2>
        <p className="text-sm text-slate-500 mt-1">New accounts require admin approval</p>
      </div>

      <FormField label="Username" icon={<User className="w-4 h-4" />}>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="johndoe"
          required
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
      </FormField>

      <FormField label="Email" icon={<Mail className="w-4 h-4" />}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
      </FormField>

      <FormField label="Password" icon={<Lock className="w-4 h-4" />}>
        <input
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
          required
          className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </FormField>

      <FormField label="Confirm Password" icon={<Lock className="w-4 h-4" />}>
        <input
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter password"
          required
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
      </FormField>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
        {loading ? 'Creating account...' : 'Create Account'}
      </button>

      <button
        type="button"
        onClick={() => onSwitchView('login')}
        className="w-full text-sm text-slate-500 hover:text-blue-600 transition-colors flex items-center justify-center gap-1"
      >
        <ArrowLeft className="w-3 h-3" /> Back to sign in
      </button>
    </form>
  );
}

// ============================================================
// FORGOT PASSWORD FORM
// ============================================================

function ForgotForm({ onSwitchView }: { onSwitchView: (v: AuthView) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Forgot Password</h2>
        <p className="text-sm text-slate-500 mt-1">Password reset assistance</p>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-slate-600">
          <p className="font-medium text-slate-700 mb-1">Contact your administrator</p>
          <p>Password resets are handled by the admin team. Please contact your system administrator to receive a temporary password.</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onSwitchView('login')}
        className="w-full text-sm text-slate-500 hover:text-blue-600 transition-colors flex items-center justify-center gap-1"
      >
        <ArrowLeft className="w-3 h-3" /> Back to sign in
      </button>
    </div>
  );
}

// ============================================================
// SHARED FORM FIELD
// ============================================================

function FormField({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-600 mb-1.5">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
        {children}
      </div>
    </div>
  );
}
