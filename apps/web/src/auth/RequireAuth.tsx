import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { TypingDots } from '@/components/editorial';

/**
 * Wrap protected routes by nesting them under `<Route element={<RequireAuth />}>`.
 *
 * - While the initial session is being resolved, show a loading indicator
 *   (prevents a flicker to /login on page refresh for an already-authed user).
 * - If there's no session, redirect to /login, preserving the intended target
 *   so we can bounce back after sign-in.
 */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <TypingDots />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
