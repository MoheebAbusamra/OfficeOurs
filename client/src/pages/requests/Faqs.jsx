// [S2] Faqs: Instructor manages their FAQ list used by the AI check
import PageHeader from '@/components/PageHeader';

export default function Faqs() {
  return (
    <>
      <PageHeader eyebrow="Answer once" title="FAQs" description="Questions the AI checks before a student books a meeting." />
      <div className="todo stack">
        <span className="hand">S2 builds this page next</span>
        <p className="muted">API: getFaqs, createFaq, updateFaq, deleteFaq (api/requests.js)</p>
      </div>
    </>
  );
}
