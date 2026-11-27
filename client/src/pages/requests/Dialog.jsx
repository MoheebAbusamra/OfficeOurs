// Reusable pop-up sheet for the requests pages (FAQ form, delete confirm, later reject/cancel reasons): native <dialog>, Escape closes it
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// <Dialog open={bool} onClose={fn} eyebrow="..." title="..." size="sm|md">...</Dialog>
// Put data-autofocus on the element that should get focus when it opens.
export default function Dialog({ open, onClose, eyebrow, title, size = 'md', children }) {
  const ref = useRef(null);

  // Open/close the native dialog (gives us the backdrop, focus trap and Escape for free)
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Escape fires "cancel": let React state decide instead of the browser
  const onCancel = e => { e.preventDefault(); onClose(); };
  // Click on the dim backdrop (outside the sheet) closes it
  const onClick = e => { if (e.target === ref.current) onClose(); };

  return (
    <dialog ref={ref} className={`sheet sheet-${size}`} onCancel={onCancel} onClick={onClick} aria-labelledby="sheet-title">
      {open && (
        <div className="sheet-inner tape">
          <header className="sheet-head">
            <div>
              {eyebrow && <span className="hand sheet-eyebrow">{eyebrow}</span>}
              <h2 id="sheet-title">{title}</h2>
            </div>
            <button type="button" className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Close">
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}
