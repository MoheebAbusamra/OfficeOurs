// [S1] Split screen for login/register: hand-drawn hero on the left, the form on the right
import { BookOpen, Notebook, NotebookPen, NotebookText, PenLine, Pencil } from 'lucide-react';

// Floating background doodles: [icon, left, top, size, seconds per drift, start rotation]
const HERO_DOODLES = [
  [NotebookPen, '6%', '14%', 46, 19, -12], [PenLine, '78%', '9%', 38, 23, 18], [BookOpen, '64%', '38%', 52, 27, -6],
  [Pencil, '12%', '58%', 34, 21, 24], [NotebookText, '84%', '66%', 44, 25, 8], [PenLine, '40%', '86%', 30, 17, -20],
];
const PANEL_DOODLES = [
  [Notebook, '8%', '10%', 40, 24, 10], [Pencil, '86%', '18%', 32, 20, -16], [NotebookPen, '82%', '80%', 44, 26, 6], [PenLine, '10%', '84%', 34, 22, 22],
];

function Doodles({ items, tone }) {
  return (
    <div className={`doodles doodles-${tone}`} aria-hidden="true">
      {items.map(([Icon, x, y, size, dur, rot], i) => (
        <span key={i} className="doodle" style={{ '--x': x, '--y': y, '--d': `${dur}s`, '--r': `${rot}deg`, '--delay': `${-i * 3}s` }}>
          <Icon size={size} strokeWidth={1.5} />
        </span>
      ))}
    </div>
  );
}

export default function AuthLayout({ children }) {
  return (
    <div className="auth">
      <section className="auth-hero" aria-label="About OfficeOurs">
        <Doodles items={HERO_DOODLES} tone="hero" />
        <div className="brand">
          <span className="brand-mark"><NotebookPen size={18} aria-hidden="true" /></span>
          OfficeOurs
        </div>

        <div className="stack">
          <span className="hand" style={{ fontSize: '1.4rem', color: 'var(--burgundy)' }}>no more email threads,</span>
          <h1>Office hours, <span className="circled">sorted</span>.</h1>
          <p className="lead">
            Book a slot that fits your timetable, get your answer from the FAQ first,
            and walk in with a QR ticket when it is <span className="marker-blue marker">your turn</span>.
          </p>
        </div>

        <div className="notes" aria-hidden="true">
          <div className="note">Slot booked<small>Tue 10:00, Room C-204</small></div>
          <div className="note">QR ticket sent<small>Check your inbox</small></div>
          <div className="note">You are #2<small>About 15 min left</small></div>
        </div>
      </section>

      <section className="auth-panel">
        <Doodles items={PANEL_DOODLES} tone="panel" />
        {children}
      </section>
    </div>
  );
}
