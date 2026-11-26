// [S2] Status filter tabs on one bottom line with a sliding burgundy underline (My requests + Inbox)
import { useLayoutEffect, useRef, useState } from 'react';

const label = t => (t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1));

// <StatusTabs tabs={['pending', 'all']} value="pending" counts={{ pending: 3, all: 9 }} onChange={setTab} />
export default function StatusTabs({ tabs, value, counts, onChange }) {
  const wrap = useRef(null);
  const [bar, setBar] = useState({ left: 0, width: 0 });

  // Measure the active tab so the underline can slide to it
  useLayoutEffect(() => {
    const measure = () => {
      const btn = wrap.current?.querySelector('[aria-pressed="true"]');
      if (btn) setBar({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [value, counts]);

  return (
    <div className="module-tabs status-tabs" role="group" aria-label="Filter by status" ref={wrap}>
      {tabs.map(t => (
        <button key={t} type="button" className={`module-tab${counts[t] ? '' : ' tab-empty'}`} aria-pressed={value === t} onClick={() => onChange(t)}>
          {label(t)} <span className="tab-count">{counts[t]}</span>
        </button>
      ))}
      <span className="tab-ink" style={{ transform: `translateX(${bar.left}px)`, width: bar.width }} aria-hidden="true" />
    </div>
  );
}
