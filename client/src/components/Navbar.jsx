// [S2] Shared top navigation; menu changes by role (student/instructor)
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  CalendarDays, CalendarPlus, ClipboardList, History, Inbox, LayoutDashboard, LogOut, Menu,
  MessageCircleQuestion, NotebookPen, X,
} from 'lucide-react';
import { homeFor, useAuth } from '@/context/AuthContext';
import NotificationBell from './NotificationBell';

const LINKS = {
  student: [
    { to: '/student/slots', label: 'Book a slot', icon: CalendarDays },
    { to: '/student/requests', label: 'My requests', icon: ClipboardList },
    { to: '/student/history', label: 'History', icon: History },
  ],
  instructor: [
    { to: '/instructor/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/instructor/slots', label: 'My slots', icon: CalendarPlus },
    { to: '/instructor/inbox', label: 'Inbox', icon: Inbox },
    { to: '/instructor/faqs', label: 'FAQs', icon: MessageCircleQuestion },
    { to: '/instructor/history', label: 'History', icon: History },
  ],
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="nav">
      <nav className="nav-inner" aria-label="Main">
        <Link to={homeFor(user)} className="brand">
          <span className="brand-mark"><NotebookPen size={18} aria-hidden="true" /></span>
          OfficeOurs
        </Link>

        <div className={`nav-links${open ? ' open' : ''}`}>
          {LINKS[user.role].map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="nav-link" onClick={() => setOpen(false)}>
              <Icon size={18} aria-hidden="true" /> {label}
            </NavLink>
          ))}
        </div>

        <div className="nav-right">
          <div className="user-chip">
            <strong>{user.fullName}</strong>
            <small>{user.role === 'student' ? user.group : 'Instructor'}</small>
          </div>
          <NotificationBell />
          <button type="button" className="btn btn-ghost icon-btn" onClick={logout} aria-label="Log out" title="Log out">
            <LogOut size={20} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-ghost icon-btn nav-toggle" onClick={() => setOpen(o => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
            {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </nav>
    </header>
  );
}
