// Site footer: torn-paper edge, a scrolling strip of what the app does, quick links for the role,
// who is signed in, a spinning "back to top" badge and the giant hand-lettered wordmark
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, ArrowUpRight, Asterisk } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { LINKS } from './Navbar';
import './footer.css';

const STRIP = ['Book a slot', 'Ask the FAQ first', 'Get confirmed', 'Grab your QR ticket', 'Walk in on time'];
const WORD = 'OfficeOurs';
// Torn-paper top edge: a ragged line across the full width
const TEAR = 'M0 30 L0 14 L38 20 L71 9 L112 17 L150 6 L196 15 L231 8 L276 19 L318 10 L355 18 L402 7 L441 16 L487 9 L522 20 L566 11 L604 18 L650 6 L689 15 L733 9 L770 19 L815 8 L851 17 L897 10 L934 19 L978 7 L1017 16 L1061 9 L1098 18 L1140 8 L1173 15 L1200 10 L1200 30 Z';

export default function Footer() {
  const { user } = useAuth();
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);

  // The wordmark letters rise in the first time the footer scrolls into view
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSeen(true); io.disconnect(); }
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const links = LINKS[user?.role] || [];
  const strip = [...STRIP, ...STRIP]; // twice, so the loop has no gap

  return (
    <footer className={`ftr${seen ? ' is-seen' : ''}`} ref={ref}>
      <svg className="ftr-tear" viewBox="0 0 1200 30" preserveAspectRatio="none" aria-hidden="true"><path d={TEAR} /></svg>

      <div className="ftr-body">
        <div className="ftr-strip" aria-hidden="true">
          <div className="ftr-strip-track">
            {strip.map((item, i) => (
              <span key={i} className="ftr-strip-item">{item}<Asterisk size={22} strokeWidth={2.5} /></span>
            ))}
          </div>
        </div>

        <div className="ftr-grid">
          <div className="ftr-intro">
            <p className="hand ftr-kicker">office hours, sorted.</p>
            <p className="ftr-lead">Less waiting in corridors, more time actually talking.</p>
          </div>

          <nav className="ftr-col" aria-label="Footer">
            <h2 className="ftr-heading">Jump to</h2>
            <ul>
              {links.map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} className="ftr-link">
                    <span>{label}</span>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ftr-col">
            <h2 className="ftr-heading">Right now</h2>
            {user && <p className="ftr-who"><span className="ftr-dot" aria-hidden="true" /><span>Signed in as <strong>{user.fullName}</strong></span></p>}
          </div>

          <button type="button" className="ftr-top" onClick={toTop} aria-label="Back to top">
            <svg className="ftr-ring" viewBox="0 0 120 120" aria-hidden="true">
              <defs><path id="ftr-ring" d="M60 60 m-44 0 a44 44 0 1 1 88 0 a44 44 0 1 1 -88 0" /></defs>
              <text><textPath href="#ftr-ring">back to top · back to top · back to top ·</textPath></text>
            </svg>
            <ArrowUp className="ftr-arrow" size={26} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>

        <p className="ftr-word" aria-label={WORD}>
          {WORD.split('').map((letter, i) => (
            <span key={i} aria-hidden="true" style={{ '--i': i, '--r': `${(i % 2 ? 1 : -1) * (3 + (i % 3) * 2)}deg` }}>{letter}</span>
          ))}
        </p>

        <div className="ftr-bottom">
          <span>&copy; {new Date().getFullYear()} OfficeOurs</span>
          <span className="hand">made with too much coffee in Cairo</span>
        </div>
      </div>
    </footer>
  );
}
