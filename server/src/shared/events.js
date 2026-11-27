// Event channel between services (the requests service announces, the queue service listens). On Floci this becomes SNS -> SQS.
//
// The requests service calls:  await publish(EVENTS.REQUEST_CONFIRMED, { requestId, ... })
// The queue service calls once at start-up:  subscribe(EVENTS.REQUEST_CONFIRMED, async (event) => { ...add to queue... })
//
// With SNS_TOPIC_ARN + AWS_ENDPOINT_URL set (Floci), publish() sends the event to SNS -> SQS -> queue-worker Lambda.
// Without them (local dev without Floci, Vercel), the queue service handles the event directly in the same server,
// with the same handler its Lambda uses, so confirming a request always queues the student and sends the QR email.
import { randomUUID } from 'node:crypto';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { awsConfig, awsEnabled } from '../services/queue/aws.js';

export const EVENTS = {
  // A request was confirmed -> the queue service adds the student to the slot queue (#14) and emails the QR ticket (#12)
  // payload: { requestId, slotId, studentId, instructorId }
  REQUEST_CONFIRMED: 'request.confirmed',

  // A request was cancelled -> the queue service removes it from the queue if it was queued
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

// Event names on SNS, in the format the queue service's SQS consumer reads (see services/queue/events.js)
const SNS_EVENT_TYPES = { [EVENTS.REQUEST_CONFIRMED]: 'RequestConfirmed', [EVENTS.REQUEST_CANCELLED]: 'RequestCancelled' };
let sns;

// Builds the event message, the same shape on SNS and in-process
const toEvent = (name, payload) => ({
  eventType: SNS_EVENT_TYPES[name], eventId: randomUUID(), occurredAt: new Date().toISOString(), data: payload,
});

// Sends the event to SNS_TOPIC_ARN (SNS -> SQS -> queue-worker Lambda). Returns false when AWS/Floci is not configured.
async function publishToSns(event) {
  const topic = process.env.SNS_TOPIC_ARN;
  if (!topic || !awsEnabled()) return false;
  sns ||= new SNSClient(awsConfig());
  await sns.send(new PublishCommand({ TopicArn: topic, Message: JSON.stringify(event) }));
  console.log(`[events] ${event.eventType} sent to SNS for request ${event.data.requestId}`);
  return true;
}

// No SNS: the queue service handles the event right here (loaded only when needed)
async function handleInProcess(event) {
  const { handleMessageBody } = await import('../services/queue/events.js');
  const result = await handleMessageBody(event);
  console.log(`[events] ${event.eventType} handled in-process for request ${event.data.requestId}`);
  return result;
}

// Sends the event to SNS, or handles it in-process when SNS is off or fails, then runs any subscribed handlers.
// A failure is logged but never breaks the request that published the event.
export async function publish(name, payload) {
  if (SNS_EVENT_TYPES[name]) {
    const event = toEvent(name, payload);
    let sent = false;
    try {
      sent = await publishToSns(event);
    } catch (err) {
      console.error(`[events] could not send "${name}" to SNS, handling it in-process:`, err.message);
    }
    if (!sent) {
      try {
        await handleInProcess(event);
      } catch (err) {
        console.error(`[events] in-process handling of "${name}" failed:`, err.message);
      }
    }
  }
  for (const handler of handlers[name] || []) {
    try {
      await handler(payload);
    } catch (err) {
      console.error(`[events] a handler of "${name}" failed:`, err);
    }
  }
}
