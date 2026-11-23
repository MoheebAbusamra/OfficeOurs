// [S3] History: Past meetings + notes for both roles (#4)
import PageHeader from '@/components/PageHeader';

export default function History() {
  return (
    <>
      <PageHeader eyebrow="Paper trail" title="Meeting history" description="Every past meeting with notes from both sides." />
      <div className="todo stack">
        <span className="hand">S3 builds this page next</span>
        <p className="muted">API: getMeetings, getMeeting, saveMeetingNotes (api/queue.js)</p>
      </div>
    </>
  );
}
