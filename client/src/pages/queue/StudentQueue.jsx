// [S3] StudentQueue: Shows how many students are ahead (no names) (#7)
import PageHeader from '@/components/PageHeader';

export default function StudentQueue() {
  return (
    <>
      <PageHeader eyebrow="Hang tight" title="Your place in line" description="How many students are ahead of you, updated live." />
      <div className="todo stack">
        <span className="hand">S3 builds this page next</span>
        <p className="muted">API: getQueuePosition (api/queue.js)</p>
      </div>
    </>
  );
}
