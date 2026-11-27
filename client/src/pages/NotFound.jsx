// 404 page for any address the app does not know
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, House } from 'lucide-react';
import { homeFor, useAuth } from '@/context/AuthContext';
import ErrorScreen from '@/components/ErrorScreen';

export default function NotFound() {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <ErrorScreen
      variant="lost"
      code="404"
      kicker="this page wandered off,"
      title="We couldn't find that page"
      text="The link may be old or mistyped. Let's get you back to your office hours."
    >
      <Link to={user ? homeFor(user) : '/login'} className="btn btn-primary">
        <House size={18} aria-hidden="true" /> Take me home
      </Link>
      <button type="button" className="btn" onClick={() => navigate(-1)}>
        <ArrowLeft size={18} aria-hidden="true" /> Go back
      </button>
    </ErrorScreen>
  );
}
