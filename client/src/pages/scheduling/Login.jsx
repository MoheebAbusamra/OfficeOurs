// Login: Login form (university ID + password)
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { homeFor, useAuth } from '@/context/AuthContext';
import AuthLayout from '@/components/AuthLayout';
import Alert from '@/components/Alert';
import PasswordInput from '@/components/PasswordInput';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ universityId: '', password: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user)} replace />;

  const set = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: '' });
  };

  const submit = async e => {
    e.preventDefault();
    const found = {};
    if (!form.universityId.trim()) found.universityId = 'Enter your university ID';
    if (!form.password) found.password = 'Enter your password';
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    setMessage('');
    try {
      const me = await login(form.universityId.trim(), form.password);
      navigate(location.state?.from || homeFor(me), { replace: true });
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div className="card auth-card">
        <h2>Welcome back</h2>
        <p className="muted" style={{ marginBottom: '1.5rem' }}>Log in with your university ID.</p>

        <form className="form" onSubmit={submit} noValidate>
          <Alert type="error" onClose={() => setMessage('')}>{message}</Alert>

          <div className="field">
            <label className="label" htmlFor="universityId">University ID</label>
            <input id="universityId" name="universityId" className="input" autoComplete="username" placeholder="e.g. 241339"
              value={form.universityId} onChange={set} aria-invalid={!!errors.universityId} aria-describedby="universityId-error" />
            {errors.universityId && <span id="universityId-error" className="field-error">{errors.universityId}</span>}
          </div>

          <div className="field">
            <label className="label" htmlFor="password">Password</label>
            <PasswordInput id="password" name="password" autoComplete="current-password"
              value={form.password} onChange={set} invalid={errors.password} describedBy="password-error" />
            {errors.password && <span id="password-error" className="field-error">{errors.password}</span>}
          </div>

          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Logging in...' : <>Log in <ArrowRight size={18} aria-hidden="true" /></>}
          </button>
        </form>

        <p className="auth-switch">First time here? <Link to="/register">Activate your account</Link></p>
        {USE_MOCKS && (
          <p className="demo hint">Demo mode: try <strong>241339</strong> (student) or <strong>I-1001</strong> (instructor) with any 8+ character password.</p>
        )}
      </div>
    </AuthLayout>
  );
}
