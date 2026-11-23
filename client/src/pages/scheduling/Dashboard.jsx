// [S1] Dashboard: Instructor home: requests count, priorities, next meeting, stats (#10)
import PageHeader from '@/components/PageHeader';

export default function Dashboard() {
  return (
    <>
      <PageHeader eyebrow="Good to see you" title="Dashboard" description="Pending requests, your next meeting and this week at a glance." />
      <div className="todo stack">
        <span className="hand">S1 builds this page next</span>
        <p className="muted">API: getDashboard (api/scheduling.js)</p>
      </div>
    </>
  );
}
