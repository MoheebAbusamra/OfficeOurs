// [S2] Inbox: Instructor filters requests and confirms/rejects them (#9)
import PageHeader from '@/components/PageHeader';

export default function Inbox() {
  return (
    <>
      <PageHeader eyebrow="Requests waiting for you" title="Inbox" description="Filter by status or priority, then confirm or reject." />
      <div className="todo stack">
        <span className="hand">S2 builds this page next</span>
        <p className="muted">API: getRequests, getRequest, setRequestStatus (api/requests.js)</p>
      </div>
    </>
  );
}
