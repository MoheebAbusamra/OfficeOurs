// [Shared] Event channel between services (S2 announces, S3 listens). On Floci this becomes SNS -> SQS.
//
// S2 (requests) calls:  await publish(EVENTS.REQUEST_CONFIRMED, { requestId, ... })
// S3 (queue) calls once at start-up:  subscribe(EVENTS.REQUEST_CONFIRMED, async (event) => { ...add to queue... })
//
// Until S3 subscribes, publish() simply does nothing, so S2 works on its own.

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

// Runs every handler of this event, one after the other, and waits for them.
// Waiting matters: when the instructor confirms, the queue entry already exists when the response arrives.
// A failing handler is logged but never breaks the request that published the event.
export async function publish(name, payload) {
  for (const handler of handlers[name] || []) {
    try {
      await handler(payload);
    } catch (err) {
      console.error(`[events] a handler of "${name}" failed:`, err);
    }
  }
}
