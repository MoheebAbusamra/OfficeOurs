// [S3] InstructorQueue: Instructor calls next, skips or ends the queue (#11)
import PageHeader from '@/components/PageHeader';

export default function InstructorQueue() {
  return (
    <>
      <PageHeader eyebrow="Run the room" title="Queue" description="Call the next student, skip, or close the queue." />
      <div className="todo stack">
        <span className="hand">S3 builds this page next</span>
        <p className="muted">API: getSlotQueue, callNext, skipEntry, closeQueue (api/queue.js)</p>
      </div>
    </>
  );
}
