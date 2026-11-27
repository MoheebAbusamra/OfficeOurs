// Blocks pages unless logged in with the right role
import { Navigate, useLocation } from 'react-router-dom';
import { homeFor, useAuth } from '@/context/AuthContext';

export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="center muted" role="status">Loading your session...</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) return <Navigate to={homeFor(user)} replace />;
  return children;
}
