// [S1] Password field with a show/hide toggle: a small student who opens their eyes when the password is visible
import { useState } from 'react';

function StudentFace({ open }) {
  return (
    <svg className={`student${open ? ' eyes-open' : ''}`} viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
      <circle cx="16" cy="18" r="10" className="student-face" />
      <path d="M4 10 16 5l12 5-12 5Z" className="student-cap" />
      <path d="M24 11v5" className="student-tassel" />
      <ellipse cx="12" cy="18" rx="1.6" ry="2" className="student-eye" />
      <ellipse cx="20" cy="18" rx="1.6" ry="2" className="student-eye" />
      <path d="M10 18.5q2 1.6 4 0M18 18.5q2 1.6 4 0" className="student-lids" />
      <path d="M13.5 23q2.5 1.5 5 0" className="student-mouth" />
    </svg>
  );
}

// Same props as a normal input: id, name, value, onChange, autoComplete, plus invalid + describedBy
export default function PasswordInput({ invalid, describedBy, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-wrap">
      <input {...props} type={visible ? 'text' : 'password'} className="input"
        aria-invalid={!!invalid} aria-describedby={describedBy} />
      <button type="button" className="password-toggle" onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}>
        <StudentFace open={visible} />
      </button>
    </div>
  );
}
