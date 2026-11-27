// Shared success/error message box used by every page
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };

// <Alert type="error" onClose={() => setError('')}>Message</Alert>
export default function Alert({ type = 'info', children, onClose }) {
  if (!children) return null;
  const Icon = ICONS[type];
  return (
    <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <Icon size={20} aria-hidden="true" />
      <div>{children}</div>
      {onClose && (
        <button type="button" className="alert-close" onClick={onClose} aria-label="Dismiss message">
          <X size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
