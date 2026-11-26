// [S3] Reads the events S2 publishes (SNS -> SQS) and runs the matching S3 job
// Message format: { "eventType": "RequestConfirmed", "eventId", "occurredAt", "data": { "requestId" } }
import { processRequestConfirmed, removeFromQueue } from './logic.js';
import { isUuid } from './validation.js';

// An SQS body is either our event, or an SNS envelope { Type: 'Notification', Message: '<our event as JSON>' }
export function parseEventBody(body) {
  let msg = typeof body === 'string' ? JSON.parse(body) : body;
  if (msg?.Type === 'Notification' && typeof msg.Message === 'string') msg = JSON.parse(msg.Message);
  return msg;
}

// Runs one event. Throws on a real failure so SQS delivers it again (and finally to the dead-letter queue).
export async function handleQueueEvent(event) {
  const requestId = event?.data?.requestId;
  if (!isUuid(requestId)) {
    console.warn('[S3] ignored event without a valid data.requestId', event?.eventType);
    return { ignored: true };
  }
  switch (event.eventType) {
    case 'RequestConfirmed':
      return processRequestConfirmed(requestId);
    case 'RequestCancelled':
      return removeFromQueue(requestId);
    default:
      console.warn(`[S3] ignored unknown event type ${event.eventType}`);
      return { ignored: true };
  }
}

// One SQS message body -> result. Business-rule rejections (409/404) are logged and dropped, not retried forever.
export async function handleMessageBody(body) {
  const event = parseEventBody(body);
  try {
    return await handleQueueEvent(event);
  } catch (err) {
    if (err.status === 404 || err.status === 409) {
      console.warn(`[S3] dropped ${event?.eventType} for ${event?.data?.requestId}: ${err.message}`);
      return { dropped: true, reason: err.code };
    }
    throw err;
  }
}
