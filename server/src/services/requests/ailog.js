// AI log on S3: one JSON file per Gemini call (what was asked, what the AI answered, how long it took)
// Answers "why did the AI say that?" later, and shows the AI's hit rate. Bucket: AI_LOG_BUCKET on Floci.
// Skipped when Floci is not configured, and a failed write never breaks the request.
import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { awsConfig, awsEnabled } from '../queue/aws.js'; // the same Floci settings the queue service uses

let client;
const s3 = () => (client ||= new S3Client(awsConfig()));

// entry: { kind: 'faq-check' | 'faq-suggest', ok, ms, ... }  ->  ai-log/2026-11-27/2026-11-27T10-15-00-000Z-faq-check-1a2b3c4d.json
export async function logAiCall(entry) {
  const bucket = process.env.AI_LOG_BUCKET;
  if (!bucket || !awsEnabled()) return;

  const at = new Date().toISOString();
  const key = `ai-log/${at.slice(0, 10)}/${at.replace(/[:.]/g, '-')}-${entry.kind}-${randomUUID().slice(0, 8)}.json`;
  try {
    await s3().send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify({ at, ...entry }, null, 2),
      ContentType: 'application/json',
    }));
  } catch (err) {
    console.error('[S2 ai-log] could not save to S3:', err.message);
  }
}
