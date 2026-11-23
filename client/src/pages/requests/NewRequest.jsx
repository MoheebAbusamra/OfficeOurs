// [S2] NewRequest: Student submits a request; AI checks it against the FAQ first (#6, #13)
import PageHeader from '@/components/PageHeader';

export default function NewRequest() {
  return (
    <>
      <PageHeader eyebrow="Ask first, book second" title="New request" description="Describe your question. We check the FAQ before you book." />
      <div className="todo stack">
        <span className="hand">S2 builds this page next</span>
        <p className="muted">API: checkFaq, createRequest (api/requests.js), getSlot (api/scheduling.js)</p>
      </div>
    </>
  );
}
