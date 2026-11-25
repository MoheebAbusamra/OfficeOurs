// [S3] SQS consumer: long-polls the "request confirmed" queue on Floci and hands each message to the S3 Lambda
// (or runs the same handler in-process when QUEUE_LAMBDA_NAME is empty). A message is deleted only after it succeeds.
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { awsConfig, awsEnabled } from './aws.js';
import { handleMessageBody } from './events.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
let running = false;

// Sends one message to the Lambda in the same shape SQS would, and reports whether it failed
async function runInLambda(lambda, message) {
  const event = { Records: [{ messageId: message.MessageId, body: message.Body, eventSource: 'aws:sqs' }] };
  const out = await lambda.send(new InvokeCommand({
    FunctionName: process.env.QUEUE_LAMBDA_NAME,
    Payload: Buffer.from(JSON.stringify(event)),
  }));
  const payload = out.Payload ? JSON.parse(Buffer.from(out.Payload).toString() || '{}') : {};
  if (out.FunctionError || payload.batchItemFailures?.length) {
    throw new Error(`Lambda failed: ${out.FunctionError || 'message reported as failed'}`);
  }
}

export function startQueueConsumer() {
  const queueUrl = process.env.SQS_QUEUE_URL;
  if (running || !awsEnabled() || !queueUrl) {
    if (!running) console.log('[S3] SQS consumer off (set AWS_ENDPOINT_URL and SQS_QUEUE_URL to turn it on)');
    return;
  }
  running = true;
  const sqs = new SQSClient(awsConfig());
  const lambda = process.env.QUEUE_LAMBDA_NAME ? new LambdaClient(awsConfig()) : null;
  console.log(`[S3] SQS consumer on: ${queueUrl} -> ${lambda ? `Lambda ${process.env.QUEUE_LAMBDA_NAME}` : 'in-process handler'}`);

  (async () => {
    while (running) {
      try {
        const { Messages = [] } = await sqs.send(new ReceiveMessageCommand({
          QueueUrl: queueUrl, MaxNumberOfMessages: 5, WaitTimeSeconds: 10, VisibilityTimeout: 60,
        }));
        for (const message of Messages) {
          try {
            if (lambda) await runInLambda(lambda, message);
            else await handleMessageBody(message.Body);
            await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
          } catch (err) {
            // Not deleted: SQS shows it again after the visibility timeout, then moves it to the dead-letter queue
            console.error(`[S3] message ${message.MessageId} failed, will retry: ${err.message}`);
          }
        }
      } catch (err) {
        console.error(`[S3] SQS receive failed: ${err.message}`);
        await sleep(5000); // Floci not up yet: wait and try again instead of crashing
      }
    }
  })();
}

export function stopQueueConsumer() {
  running = false;
}
