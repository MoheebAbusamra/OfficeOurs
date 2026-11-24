// [S1] Dashboard: Instructor home: requests count, priorities, next meeting, stats (#10)
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarCheck, CalendarPlus, Clock, Flame, Inbox, ListOrdered, MessageCircleQuestion, RefreshCw, Timer, TrendingUp, Users,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Alert from '@/components/Alert';
import { useAuth } from '@/context/AuthContext';
import { getDashboard } from '@/api/scheduling';
import './scheduling.css';

// "2026-11-25" -> { day: 'Wed', num: 25, month: 'Nov' }. Adding T00:00 keeps it in local time
const dateParts = d => {
  const date = new Date(`${d}T00:00`);
  return {
    day: date.toLocaleDateString('en-GB', { weekday: 'long' }),
    num: date.getDate(),
    month: date.toLocaleDateString('en-GB', { month: 'short' }),
  };
};

// Small number tile used for the stats row
function Stat({ icon: Icon, value, label, hint }) {
  return (
    <div className="stat">
      <Icon size={22} aria-hidden="true" />
      <strong>{value}</strong>
      <span>{label}</span>
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // GET /dashboard: one call, the API combines S1 slots, S2 requests and S3 meetings
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    return getDashboard()
      .then(res => setData(res.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const next = data?.nextMeeting;
  const parts = next ? dateParts(next.date) : null;
  const rate = data ? Math.round((data.stats.acceptanceRate || 0) * 100) : 0;

  return (
    <>
      <PageHeader eyebrow={`Good to see you, ${user.fullName}`} title="Dashboard" description="Pending requests, your next meeting and this week at a glance.">
        <button type="button" className="btn btn-ghost" onClick={load} disabled={loading}>
          <RefreshCw size={18} aria-hidden="true" /> {loading ? 'Loading...' : 'Refresh'}
        </button>
      </PageHeader>

      <div className="stack">
        <Alert type="error" onClose={() => setError('')}>{error}</Alert>

        {loading && !data && <p className="muted">Loading your dashboard...</p>}

        {data && (
          <>
            <div className="dash-top">
              {/* Next confirmed meeting */}
              <section className="dash-next" aria-labelledby="next-title">
                <h2 id="next-title" className="dash-label"><CalendarCheck size={18} aria-hidden="true" /> Next meeting</h2>
                {next ? (
                  <div className="dash-next-body">
                    <div className="slot-date dash-next-date" aria-label={`${parts.day} ${parts.num} ${parts.month}`}>
                      <span>{parts.day}</span>
                      <strong>{parts.num}</strong>
                      <span>{parts.month}</span>
                    </div>
                    <div className="stack dash-next-info">
                      <span className="dash-next-time"><Clock size={18} aria-hidden="true" /> {next.startTime}</span>
                      <h3>{next.title}</h3>
                      <span className="hand">with {next.studentName}</span>
                      <Link to={`/instructor/queue/${next.slotId}`} className="btn btn-primary">
                        <ListOrdered size={18} aria-hidden="true" /> Open queue
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="dash-empty">
                    <span className="hand">No confirmed meetings yet</span>
                    <p className="muted">Confirm requests in your inbox and the next one shows here.</p>
                  </div>
                )}
              </section>

              {/* Requests waiting for a decision (S2 data) */}
              <section className="dash-pending" aria-labelledby="pending-title">
                <h2 id="pending-title" className="dash-label"><Inbox size={18} aria-hidden="true" /> Waiting for you</h2>
                <strong className="dash-big">{data.pendingRequests}</strong>
                <span>pending request{data.pendingRequests === 1 ? '' : 's'}</span>
                {data.highPriorityPending > 0 && (
                  <span className="badge badge-rejected"><Flame size={14} aria-hidden="true" /> {data.highPriorityPending} high priority</span>
                )}
                <Link to="/instructor/inbox" className="btn btn-butter">Open inbox</Link>
              </section>
            </div>

            <section aria-labelledby="stats-title" className="stack">
              <h2 id="stats-title" className="dash-section-title">This week and overall</h2>
              <div className="stats">
                <Stat icon={CalendarPlus} value={data.upcomingSlots} label="Upcoming slots" hint={<Link to="/instructor/slots">Manage slots</Link>} />
                <Stat icon={Users} value={data.stats.meetingsThisWeek} label="Meetings this week" />
                <Stat icon={CalendarCheck} value={data.stats.meetingsTotal} label="Meetings in total" />
                <Stat icon={Timer} value={`${Math.round(data.stats.avgMeetingMinutes || 0)} min`} label="Average meeting" />
                <Stat icon={MessageCircleQuestion} value={data.stats.faqDeflections} label="Answered by your FAQ" hint="Questions the AI solved without a meeting" />
                <div className="stat stat-rate">
                  <TrendingUp size={22} aria-hidden="true" />
                  <strong>{rate}%</strong>
                  <span>Acceptance rate</span>
                  <div className="slot-bar" role="progressbar" aria-label="Acceptance rate" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rate}>
                    <span style={{ width: `${rate}%` }} />
                  </div>
                  <small className="muted">Confirmed out of all decided requests</small>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
