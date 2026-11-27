// Full-screen "can't reach the server" page. http.js fires "officeours:server-down" when the API does not
// answer at all (network error, or a gateway error with no JSON body). It retries on its own and reloads
// the page as soon as the API answers again.
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, RotateCw } from 'lucide-react';
import { pingServer } from '@/api/http';
import ErrorScreen from './ErrorScreen';

const RETRY_SECONDS = 8;

export default function ServerStatus() {
  const [down, setDown] = useState(false);
  const [seconds, setSeconds] = useState(RETRY_SECONDS);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const onDown = () => setDown(true);
    window.addEventListener('officeours:server-down', onDown);
    return () => window.removeEventListener('officeours:server-down', onDown);
  }, []);

  const check = useCallback(async () => {
    setChecking(true);
    const ok = await pingServer();
    setChecking(false);
    if (ok) window.location.reload(); // fresh start: every page loads its data again
    else setSeconds(RETRY_SECONDS);
  }, []);

  // The page behind stays still while this screen is up
  useEffect(() => {
    if (!down) return undefined;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [down]);

  // Count down, then try again
  useEffect(() => {
    if (!down || checking) return undefined;
    if (seconds === 0) { check(); return undefined; }
    const id = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [down, checking, seconds, check]);

  if (!down) return null;
  return (
    <ErrorScreen
      overlay
      variant="offline"
      code="503"
      kicker="the line went quiet,"
      title="We can't reach OfficeOurs right now"
      text="The server or the cloud services are not answering. Nothing you saved is lost; this page reconnects on its own as soon as they are back."
      status={<><RefreshCw size={16} aria-hidden="true" /> {checking ? 'Checking...' : `Trying again in ${seconds}s`}</>}
    >
      <button type="button" className="btn btn-primary" onClick={check} disabled={checking}>
        <RotateCw size={18} aria-hidden="true" /> Try now
      </button>
    </ErrorScreen>
  );
}
