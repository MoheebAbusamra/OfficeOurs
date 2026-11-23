// [S3] CheckIn: Page the QR code opens; simulates door check-in (#12)
import { useParams } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';

export default function CheckIn() {
  const { token } = useParams();
  return (
    <main className="main">
      <PageHeader eyebrow="Show this at the door" title="Check in" description="Tear the ticket to check in to your meeting." />
      <div className="todo stack">
        <span className="hand">S3 builds this page next</span>
        <p className="muted">API: getCheckIn, checkIn (api/queue.js). Ticket token: {token}</p>
        <p className="muted">Uses: React Bits TearTicket (tear the stub = check in)</p>
      </div>
    </main>
  );
}
