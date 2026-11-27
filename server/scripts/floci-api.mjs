// The scheduling and queue APIs as Lambdas behind "officeours-api",
// the same way the requests service deploys its own in setupS2(). Together the 3 Lambdas serve every /api/v1 route of the app.
// Called by scripts/floci-setup.mjs.
import { fileURLToPath } from 'node:url';
import { deployHttpLambda, baseLambdaEnv } from './floci-http-lambda.mjs';

const entry = (path) => fileURLToPath(new URL(`../src/services/${path}`, import.meta.url));
// ANY /x and ANY /x/{proxy+} = every method on the path and everything below it
const paths = (...list) => list.flatMap((path) => [`ANY /api/v1/${path}`, `ANY /api/v1/${path}/{proxy+}`]);

export async function setupServiceApis() {
  // ---------------- Scheduling API: login + scheduling ----------------
  console.log('Setting up the S1 API Lambda (login + scheduling)');
  const s1 = await deployHttpLambda({
    name: 'officeours-scheduling',
    entry: entry('scheduling/api-lambda.js'),
    roleName: 'officeours-scheduling-lambda-role',
    permissions: [], // only logs (added by the helper); its data lives in Supabase
    environment: {
      ...baseLambdaEnv(),
      CALENDARIFIC_API_KEY: process.env.CALENDARIFIC_API_KEY || '',
    },
    routes: [
      'GET /api/v1/health',
      ...paths('auth', 'modules', 'instructors', 'slots', 'holidays', 'dashboard'),
    ],
  });

  // ---------------- Queue API: queue, check-in, meetings ----------------
  console.log('Setting up the S3 API Lambda (queue, check-in, meetings)');
  const bucket = process.env.S3_BUCKET || 'officeours-qr';
  const sender = process.env.SES_SENDER_EMAIL && process.env.SES_SENDER_EMAIL !== 'placeholder@example.com'
    ? process.env.SES_SENDER_EMAIL : 'no-reply@officeours.test';
  await deployHttpLambda({
    name: 'officeours-queue-api',
    entry: entry('queue/api-lambda.js'),
    roleName: 'officeours-queue-api-lambda-role',
    permissions: [
      { Effect: 'Allow', Action: ['s3:PutObject', 's3:GetObject'], Resource: `arn:aws:s3:::${bucket}/qr/*` },
      { Effect: 'Allow', Action: ['ses:SendEmail', 'ses:SendRawEmail'], Resource: '*' },
    ],
    environment: {
      ...baseLambdaEnv(),
      S3_BUCKET: bucket,
      SES_SENDER_EMAIL: sender,
      BREVO_API_KEY: process.env.BREVO_API_KEY || '',
      BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL || '',
      BREVO_SENDER_NAME: process.env.BREVO_SENDER_NAME || 'OfficeOurs',
      CHECKIN_BASE_URL: process.env.CHECKIN_BASE_URL || process.env.CLIENT_URL || 'http://localhost:5173',
    },
    routes: paths('queue', 'check-in', 'meetings'),
  });

  return { apiUrl: s1.url };
}
