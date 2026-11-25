// [S3] AWS Lambda handler (deployed to Floci): gets "request confirmed" messages from SQS, adds the student to the queue,
// makes the QR code (stored in S3) and sends the ticket email (Brevo + SES copy). Bundled by floci/package-lambda.mjs.
import { handleMessageBody } from './events.js';

// event = { Records: [{ messageId, body }] } (SQS shape). Failed messages are reported back so only they are retried.
export async function handler(event) {
  const batchItemFailures = [];
  for (const record of event?.Records || []) {
    try {
      const result = await handleMessageBody(record.body);
      console.log(`[S3 lambda] ${record.messageId}: ${JSON.stringify(result)}`);
    } catch (err) {
      console.error(`[S3 lambda] ${record.messageId} failed: ${err.message}`);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
}
