// One command for the whole app on Floci:  npm run deploy:floci
//   1. every AWS resource and Lambda of the 3 services (scripts/floci-setup.mjs), with the QR email link
//      pointing at the deployed check-in page instead of the local dev server
//   2. the frontend: built against the API Gateway and uploaded to the S3 web bucket (scripts/floci-web.mjs)
// Afterwards the app runs fully on Floci at the printed website address.
import 'dotenv/config';
import { WEB_URL } from './floci-http-lambda.mjs';

// QR codes open .../index.html#/check-in/<token> (the queue service adds "/check-in/<token>" to this base)
process.env.CHECKIN_BASE_URL = `${WEB_URL}#`;

await import('./floci-setup.mjs'); // runs the full setup; it stops the process itself if something fails

const { deployWeb } = await import('./floci-web.mjs');
try {
  const url = await deployWeb();
  console.log('\n============================================================');
  console.log(` OfficeOurs is running on Floci: ${url}`);
  console.log('============================================================');
} catch (err) {
  console.error(`Frontend deploy failed: ${err.message}`);
  process.exit(1);
}
