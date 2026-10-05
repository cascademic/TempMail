import { useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ToastProvider } from '@/lib/toast-context';
import { FullPageLoader } from '@/components/LoadingSpinner';
import AuthPage from '@/pages/AuthPage';
import Dashboard from '@/pages/Dashboard';
import AdminPanel from '@/pages/AdminPanel';
import ProfilePage from '@/pages/ProfilePage';
import Header, { type Page } from '@/components/Header';

function AppContent() {
  const { session, profile, loading } = useAuth();
  const [page, setPage] = useState<Page>('dashboard');

  if (loading) {
    return <FullPageLoader message="Loading your inbox..." />;
  }

  if (!session || !profile) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header currentPage={page} onNavigate={setPage} />
      {page === 'dashboard' && <Dashboard />}
      {page === 'admin' && <AdminPanel />}
      {page === 'profile' && <ProfilePage />}
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
