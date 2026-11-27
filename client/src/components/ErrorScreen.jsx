// Full-page error screen in the app's hand-drawn style: an SVG scene, a big outlined code, a message and actions.
// Used by the 404 page (lost), the "server unreachable" overlay (offline) and the crash screen (crash).
import './errors.css';

const INK = '#2B0710';
const BURGUNDY = '#590A1C';
const BUTTER = '#FCEA9C';
const BLUE = '#A8D4F9';

// A paper plane that flew off course, leaving a looping dashed trail and question marks
function Lost() {
  return (
    <svg viewBox="0 0 280 220" className="err-svg" aria-hidden="true">
      <ellipse cx="140" cy="204" rx="92" ry="7" fill="rgba(89,10,28,0.12)" />
      <path className="err-trail" d="M18 176 C 70 150, 30 92, 92 96 S 150 168, 196 120 S 214 70, 224 58" fill="none" stroke={BURGUNDY} strokeWidth="2.6" strokeDasharray="7 9" strokeLinecap="round" />
      <g className="err-plane">
        <g transform="translate(206 26) rotate(-12)">
          <path d="M0 24 L64 0 L38 44 L28 30 Z" fill={BUTTER} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
          <path d="M28 30 L64 0" stroke={INK} strokeWidth="2.2" />
          <path d="M28 30 L25 44 L38 44" fill={BLUE} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
        </g>
      </g>
      <text className="err-q err-q1" x="60" y="62">?</text>
      <text className="err-q err-q2" x="142" y="44">?</text>
      <text className="err-q err-q3" x="112" y="150">?</text>
      <path d="M216 168 l10 -10 l8 12 l12 -6 l-2 14 l-14 4 z" fill="#fff" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

// A sleepy cloud (the server) with its plug pulled out of the socket, sparks in the gap
function Offline() {
  return (
    <svg viewBox="0 0 280 220" className="err-svg" aria-hidden="true">
      <ellipse cx="140" cy="204" rx="92" ry="7" fill="rgba(89,10,28,0.12)" />
      <g className="err-cloud">
        <path d="M158 92 a30 30 0 0 1 56 -10 a24 24 0 1 1 14 46 h-70 a22 22 0 0 1 0 -36 z" fill={BLUE} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M180 108 q5 4 10 0 M204 108 q5 4 10 0" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
        <text className="err-z" x="232" y="64">z</text>
        <text className="err-z err-z2" x="246" y="46">z</text>
      </g>
      <path className="err-cable" d="M196 128 C 200 160, 176 170, 160 172" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <g className="err-plug">
        <rect x="132" y="162" width="28" height="20" rx="5" fill={BUTTER} stroke={INK} strokeWidth="2.6" />
        <path d="M132 168 h-9 M132 176 h-9" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
      </g>
      <g className="err-sparks" stroke={BURGUNDY} strokeWidth="2.4" strokeLinecap="round">
        <path d="M110 160 l-6 -8" /><path d="M106 172 h-9" /><path d="M110 184 l-6 8" />
      </g>
      <path d="M14 190 C 40 192, 56 180, 66 174" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <rect x="66" y="160" width="28" height="28" rx="6" fill="#fff" stroke={INK} strokeWidth="2.6" />
      <rect x="74" y="168" width="4" height="12" rx="1.5" fill={INK} />
      <rect x="82" y="168" width="4" height="12" rx="1.5" fill={INK} />
    </svg>
  );
}

// A pencil snapped in two over an ink blot
function Crash() {
  return (
    <svg viewBox="0 0 280 220" className="err-svg" aria-hidden="true">
      <ellipse cx="140" cy="204" rx="92" ry="7" fill="rgba(89,10,28,0.12)" />
      <path className="err-blot" d="M104 168 c-14 -18 6 -34 24 -28 c10 -16 38 -14 42 4 c20 -2 30 20 14 30 c8 16 -12 30 -28 20 c-10 14 -36 12 -40 -4 c-16 2 -24 -12 -12 -22 z" fill={BURGUNDY} />
      <circle cx="196" cy="186" r="5" fill={BURGUNDY} /><circle cx="88" cy="150" r="3.5" fill={BURGUNDY} /><circle cx="206" cy="160" r="3" fill={BURGUNDY} />
      <g className="err-half err-half-l">
        <g transform="translate(36 96) rotate(-16)">
          <rect x="-22" y="0" width="16" height="24" rx="4" fill={BLUE} stroke={INK} strokeWidth="2.6" />
          <rect x="-8" y="0" width="10" height="24" fill="#E8DFCF" stroke={INK} strokeWidth="2.6" />
          <path d="M2 0 H92 L98 6 L91 12 L99 18 L92 24 H2 Z" fill={BUTTER} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
          <path d="M8 8 H84" stroke="rgba(43,7,16,0.25)" strokeWidth="2" />
        </g>
      </g>
      <g className="err-half err-half-r">
        <g transform="translate(160 74) rotate(18)">
          <path d="M6 0 L0 6 L7 12 L0 18 L6 24 H70 V0 Z" fill={BUTTER} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
          <path d="M70 0 L98 12 L70 24 Z" fill="#F1D9B5" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
          <path d="M88 8 L98 12 L88 16 Z" fill={INK} />
        </g>
      </g>
    </svg>
  );
}

const ART = { lost: Lost, offline: Offline, crash: Crash };

export default function ErrorScreen({ variant, code, kicker, title, text, children, details, overlay = false, status }) {
  const Art = ART[variant];
  return (
    <div className={`err${overlay ? ' err-overlay' : ''}`} role={overlay ? 'alertdialog' : 'main'} aria-labelledby="err-title">
      <div className="err-card">
        <div className="err-art"><Art /></div>
        <div className="err-copy">
          <span className="err-code" aria-hidden="true">{code}</span>
          <p className="hand err-kicker">{kicker}</p>
          <h1 id="err-title" className="err-title">{title}</h1>
          <p className="err-text">{text}</p>
          {status && <p className="err-status" role="status">{status}</p>}
          <div className="err-actions">{children}</div>
          {details && (
            <details className="err-details">
              <summary>Technical details</summary>
              <pre>{details}</pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
