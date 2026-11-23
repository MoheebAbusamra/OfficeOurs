// [S2] MyRequests: Student tracks request status, edits or cancels (#2, #5)
import PageHeader from '@/components/PageHeader';

export default function MyRequests() {
  return (
    <>
      <PageHeader eyebrow="Where things stand" title="My requests" description="Track every request, edit it before it is opened, or cancel it." />
      <div className="todo stack">
        <span className="hand">S2 builds this page next</span>
        <p className="muted">API: getRequests, updateRequest, setRequestStatus (api/requests.js)</p>
      </div>
    </>
  );
}
