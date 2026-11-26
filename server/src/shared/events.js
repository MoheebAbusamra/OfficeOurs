// [Shared] Event channel between services (S2 announces, S3 listens). On Floci this becomes SNS -> SQS.
//
// S2 (requests) calls:  await publish(EVENTS.REQUEST_CONFIRMED, { requestId, ... })
// S3 (queue) calls once at start-up:  subscribe(EVENTS.REQUEST_CONFIRMED, async (event) => { ...add to queue... })
//
// With SNS_TOPIC_ARN + AWS_ENDPOINT_URL set, publish() also sends the event to SNS; without them S2 works on its own.
import { randomUUID } from 'node:crypto';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { awsConfig, awsEnabled } from '../services/queue/aws.js';

export const EVENTS = {
  // A request was confirmed -> S3 adds the student to the slot queue (#14) and emails the QR ticket (#12)
  // payload: { requestId, slotId, studentId, instructorId }
  REQUEST_CONFIRMED: 'request.confirmed',

  // A request was cancelled -> S3 removes it from the queue if it was queued
  // payload: { requestId, slotId, previousStatus, cancelledBy }
  REQUEST_CANCELLED: 'request.cancelled',
};

// { "request.confirmed": [handler1, handler2], ... }
const handlers = {};

// Register a function that runs every time this event is published
export function subscribe(name, handler) {
  if (!handlers[name]) handlers[name] = [];
  handlers[name].push(handler);
}

// Event names on SNS, in the format S3's SQS consumer reads (see services/queue/events.js)
const SNS_EVENT_TYPES = { [EVENTS.REQUEST_CONFIRMED]: 'RequestConfirmed', [EVENTS.REQUEST_CANCELLED]: 'RequestCancelled' };
let sns;

// Sends the event to SNS_TOPIC_ARN (SNS -> SQS -> S3 Lambda). Skipped when AWS/Floci is not configured.
async function publishToSns(name, payload) {
  const topic = process.env.SNS_TOPIC_ARN;
  if (!topic || !awsEnabled() || !SNS_EVENT_TYPES[name]) return;
  sns ||= new SNSClient(awsConfig());
  const event = { eventType: SNS_EVENT_TYPES[name], eventId: randomUUID(), occurredAt: new Date().toISOString(), data: payload };
  await sns.send(new PublishCommand({ TopicArn: topic, Message: JSON.stringify(event) }));
  console.log(`[events] ${event.eventType} sent to SNS for request ${payload.requestId}`);
}

// Sends the event to SNS, then runs every in-process handler, one after the other, and waits for them.
// A failing handler (or SNS) is logged but never breaks the request that published the event.
export async function publish(name, payload) {
  try {
    await publishToSns(name, payload);
  } catch (err) {
    console.error(`[events] could not send "${name}" to SNS:`, err.message);
  }
  for (const handler of handlers[name] || []) {
    try {
      await handler(payload);
    } catch (err) {
      console.error(`[events] a handler of "${name}" failed:`, err);
    }
  }
}
