// [S1] Checks for new notifications every few seconds and shows the unread count
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '@/api/scheduling';

const POLL_MS = 5000;
const timeAgo = date => {
  const min = Math.round((Date.now() - new Date(date)) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  return `${Math.round(min / 60)} h ago`;
};

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(() => getNotifications({ limit: 20 })
    .then(res => { setItems(res.data); setUnread(res.meta.unreadCount); })
    .catch(() => {}), []); // a failed poll is silent; the next one retries

  // Poll while the tab is visible
  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return undefined;
    const onClick = e => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const openItem = async n => {
    if (!n.isRead) await markNotificationRead(n.id).catch(() => {});
    setOpen(false);
    load();
    if (n.link) navigate(n.link);
  };

  const readAll = async () => { await markAllNotificationsRead().catch(() => {}); load(); };

  return (
    <div className="bell" ref={boxRef}>
      <button type="button" className="btn btn-ghost icon-btn" onClick={() => setOpen(o => !o)}
        aria-label={`Notifications, ${unread} unread`} aria-expanded={open}>
        <Bell size={20} aria-hidden="true" />
        {unread > 0 && <span className="bell-count" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong className="hand">Notifications</strong>
            {unread > 0 && <button type="button" className="btn btn-ghost" onClick={readAll}>Mark all read</button>}
          </div>
          {items.length === 0 && <p className="muted" style={{ padding: '0.75rem' }}>Nothing new. You are all caught up.</p>}
          {items.map(n => (
            <button key={n.id} type="button" className={`bell-item${n.isRead ? '' : ' unread'}`} onClick={() => openItem(n)}>
              {n.message}
              <time dateTime={n.createdAt}>{timeAgo(n.createdAt)}</time>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
