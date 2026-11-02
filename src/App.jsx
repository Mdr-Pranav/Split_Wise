import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { InboxProvider } from './context/InboxContext';
import { GroupsProvider } from './context/GroupsContext';
import Layout from './components/Layout';
import Logo from './components/Logo';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import GroupPage from './pages/GroupPage';
import JoinGroup from './pages/JoinGroup';
import Settings from './pages/Settings';
import HowItWorks from './pages/HowItWorks';

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Logo className="h-10 w-10 animate-pulse" />
    </div>
  );
}

// Signed-out visitors go to login, then come back where they were headed
// (so a shared /join?code=… link still works after signing in)
function Protected({ children }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Layout>{children}</Layout>;
}

function PublicOnly({ children }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (session) {
    const from = location.state?.from;
    return <Navigate to={from ? `${from.pathname}${from.search}` : '/'} replace />;
  }
  return children;
}

// Tapping a push notification while the app is open: the service worker
// asks the page to go there instead of opening a second window
function NotificationLinks() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e) => {
      if (e.data?.type === 'navigate' && typeof e.data.url === 'string' && e.data.url.startsWith('/')) navigate(e.data.url);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
  return null;
}

// A crash on one screen clears once you move to another
function RouteBoundary({ children }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="ambient" aria-hidden="true">
        <span />
        <span />
      </div>
      <ToastProvider>
        <AuthProvider>
          <InboxProvider>
          <GroupsProvider>
            <NotificationLinks />
            <RouteBoundary>
            <Routes>
              <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
              <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
              <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/" element={<Protected><Dashboard /></Protected>} />
              <Route path="/groups/:id" element={<Protected><GroupPage /></Protected>} />
              <Route path="/join" element={<Protected><JoinGroup /></Protected>} />
              <Route path="/settings" element={<Protected><Settings /></Protected>} />
              <Route path="/how-it-works" element={<Protected><HowItWorks /></Protected>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </RouteBoundary>
          </GroupsProvider>
          </InboxProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
