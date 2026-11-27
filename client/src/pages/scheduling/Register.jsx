// Register: Student enters university ID; group, modules and schedule are filled in automatically from seed data
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { register } from '@/api/auth';
import { homeFor, useAuth } from '@/context/AuthContext';
import AuthLayout from '@/components/AuthLayout';
import Alert from '@/components/Alert';
import PasswordInput from '@/components/PasswordInput';

export default function Register() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ universityId: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState(null); // registry data returned by the backend

  if (user && !found && !busy) return <Navigate to={homeFor(user)} replace />;

  const set = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: '' });
  };

  const submit = async e => {
    e.preventDefault();
    const bad = {};
    if (!form.universityId.trim()) bad.universityId = 'Enter your university ID';
    if (form.password.length < 8) bad.password = 'Use at least 8 characters';
    if (form.confirm !== form.password) bad.confirm = 'Passwords do not match';
    setErrors(bad);
    if (Object.keys(bad).length) return;

    setBusy(true);
    setMessage('');
    try {
      const res = await register(form.universityId.trim(), form.password);
      await login(form.universityId.trim(), form.password);
      setFound(res.data);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Step 2: show what the registry auto-filled
  if (found) {
    return (
      <AuthLayout>
        <div className="card auth-card stack">
          <span className="hand" style={{ color: 'var(--burgundy)', fontSize: '1.3rem' }}>we found you!</span>
          <h2>Hi, {found.role === 'instructor' ? found.fullName : found.fullName.split(' ')[0]}</h2>
          <div className="card card-butter stack" style={{ boxShadow: 'none', padding: '1rem' }}>
            <div><span className="muted">Role</span><br /><strong>{found.role === 'student' ? 'Student' : 'Instructor'}</strong></div>
            {found.group && <div><span className="muted">Group</span><br /><strong>{found.group}</strong></div>}
            <div>
              <span className="muted">Modules</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.35rem' }}>
                {found.modules.map(m => <span key={m.id} className="badge"><Check size={14} aria-hidden="true" />{m.code}</span>)}
              </div>
            </div>
            {found.role === 'student' && <p className="hint">Your weekly timetable ({found.schedule.length} classes) is linked, so clashing slots show last.</p>}
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={() => navigate(homeFor(found), { replace: true })}>
            Continue <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="card auth-card">
        <h2>Activate your account</h2>
        <p className="muted" style={{ marginBottom: '1.5rem' }}>Enter your university ID. We fill in your group, modules and timetable for you.</p>

        <form className="form" onSubmit={submit} noValidate>
          <Alert type="error" onClose={() => setMessage('')}>{message}</Alert>

          <div className="field">
            <label className="label" htmlFor="universityId">University ID</label>
            <input id="universityId" name="universityId" className="input" autoComplete="username" placeholder="e.g. 241339 or I-1001"
              value={form.universityId} onChange={set} aria-invalid={!!errors.universityId} aria-describedby="universityId-error" />
            {errors.universityId && <span id="universityId-error" className="field-error">{errors.universityId}</span>}
          </div>

          <div className="field">
            <label className="label" htmlFor="password">Password</label>
            <PasswordInput id="password" name="password" autoComplete="new-password"
              value={form.password} onChange={set} invalid={errors.password} describedBy="password-hint" />
            <span id="password-hint" className={errors.password ? 'field-error' : 'hint'}>{errors.password || 'At least 8 characters'}</span>
          </div>

          <div className="field">
            <label className="label" htmlFor="confirm">Confirm password</label>
            <PasswordInput id="confirm" name="confirm" autoComplete="new-password"
              value={form.confirm} onChange={set} invalid={errors.confirm} describedBy="confirm-error" />
            {errors.confirm && <span id="confirm-error" className="field-error">{errors.confirm}</span>}
          </div>

          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Checking your ID...' : <>Activate <ArrowRight size={18} aria-hidden="true" /></>}
          </button>
        </form>

        <p className="auth-switch">Already active? <Link to="/login">Log in</Link></p>
      </div>
    </AuthLayout>
  );
}
