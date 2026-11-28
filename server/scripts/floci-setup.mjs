// Creates the queue service's AWS resources on Floci (safe to run again): S3 bucket, SQS queue + dead-letter queue,
// SNS topic subscription (the requests service publishes, the queue service receives), SES sender identity and the queue-worker Lambda.
// Usage: docker compose up -d   then   npm run floci:setup --prefix server
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { CreateQueueCommand, GetQueueAttributesCommand, SetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';
import { CreateTopicCommand, SNSClient, SubscribeCommand } from '@aws-sdk/client-sns';
import { SESClient, VerifyEmailIdentityCommand } from '@aws-sdk/client-ses';
import {
  CreateEventSourceMappingCommand, CreateFunctionCommand, GetFunctionCommand, LambdaClient, ListEventSourceMappingsCommand,
  UpdateEventSourceMappingCommand, UpdateFunctionCodeCommand, UpdateFunctionConfigurationCommand, waitUntilFunctionUpdated,
} from '@aws-sdk/client-lambda';
import { packageLambda } from './package-lambda.mjs';
// The scheduling service's setup. Its code stays in its own folder, it is only called below.
import { setupS1 } from '../src/services/scheduling/floci-setup.js';
// The requests service's setup (SNS topic, AI-log bucket, IAM role, Lambda, API Gateway routes), also in its own folder
import { setupS2 } from '../src/services/requests/floci-setup.js';
// The scheduling and queue APIs as Lambdas behind the same API Gateway "officeours-api"
import { setupServiceApis } from './floci-api.mjs';

process.env.AWS_ENDPOINT_URL ||= 'http://localhost:4566';
const config = {
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL,
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test', secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test' },
};

const BUCKET = process.env.S3_BUCKET || 'officeours-qr';
const QUEUE = 'officeours-request-confirmed';
const TOPIC = 'officeours-request-events'; // the requests service publishes RequestConfirmed here
const LAMBDA = process.env.QUEUE_LAMBDA_NAME || 'officeours-queue-worker';
const RUNTIME = 'nodejs22.x'; // supabase-js needs the native WebSocket of Node 22+
const SENDER = process.env.SES_SENDER_EMAIL && process.env.SES_SENDER_EMAIL !== 'placeholder@example.com'
  ? process.env.SES_SENDER_EMAIL : 'no-reply@officeours.test';

const s3 = new S3Client(config);
const sqs = new SQSClient(config);
const sns = new SNSClient(config);
const ses = new SESClient(config);
const lambda = new LambdaClient(config);
const step = (label, value = '') => console.log(`  ok  ${label}${value ? `: ${value}` : ''}`);

async function bucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }
  step('S3 bucket for QR images', BUCKET);
}

async function queues() {
  const { QueueUrl: dlqUrl } = await sqs.send(new CreateQueueCommand({ QueueName: `${QUEUE}-dlq` }));
  const { Attributes: dlq } = await sqs.send(new GetQueueAttributesCommand({ QueueUrl: dlqUrl, AttributeNames: ['QueueArn'] }));
  const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: QUEUE }));
  const { Attributes } = await sqs.send(new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ['QueueArn'] }));
  // After 3 failed tries a message moves to the dead-letter queue instead of looping forever
  await sqs.send(new SetQueueAttributesCommand({
    QueueUrl,
    Attributes: { RedrivePolicy: JSON.stringify({ deadLetterTargetArn: dlq.QueueArn, maxReceiveCount: '3' }), VisibilityTimeout: '60' },
  }));
  step('SQS queue', QueueUrl);
  step('SQS dead-letter queue', dlqUrl);
  return { queueUrl: QueueUrl, queueArn: Attributes.QueueArn };
}

async function topic(queueArn, queueUrl) {
  const { TopicArn } = await sns.send(new CreateTopicCommand({ Name: TOPIC }));
  // Let the topic write to the queue, then subscribe the queue (raw = our JSON event, no SNS envelope)
  await sqs.send(new SetQueueAttributesCommand({
    QueueUrl: queueUrl,
    Attributes: {
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Principal: { Service: 'sns.amazonaws.com' }, Action: 'sqs:SendMessage', Resource: queueArn, Condition: { ArnEquals: { 'aws:SourceArn': TopicArn } } }],
      }),
    },
  }));
  await sns.send(new SubscribeCommand({ TopicArn, Protocol: 'sqs', Endpoint: queueArn, Attributes: { RawMessageDelivery: 'true' } }));
  step('SNS topic -> SQS subscription', TopicArn);
  return TopicArn;
}

async function sesIdentity() {
  await ses.send(new VerifyEmailIdentityCommand({ EmailAddress: SENDER }));
  step('SES sender identity', SENDER);
}

async function worker() {
  const zipPath = await packageLambda();
  const ZipFile = readFileSync(zipPath);
  const Environment = {
    Variables: {
      SUPABASE_URL: process.env.SUPABASE_URL || '',
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || '',
      BREVO_API_KEY: process.env.BREVO_API_KEY || '',
      BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL || '',
      BREVO_SENDER_NAME: process.env.BREVO_SENDER_NAME || 'OfficeOurs',
      CHECKIN_BASE_URL: process.env.CHECKIN_BASE_URL || process.env.CLIENT_URL || 'http://localhost:5173',
      APP_TIMEZONE: process.env.APP_TIMEZONE || 'Africa/Cairo',
      // Inside the Lambda container Floci is reached by its Docker service name
      AWS_ENDPOINT_URL: process.env.LAMBDA_AWS_ENDPOINT_URL || 'http://floci:4566',
      S3_BUCKET: BUCKET,
      SES_SENDER_EMAIL: SENDER,
    },
  };

  let exists = true;
  try { await lambda.send(new GetFunctionCommand({ FunctionName: LAMBDA })); } catch { exists = false; }

  if (exists) {
    await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: LAMBDA, ZipFile }));
    await waitUntilFunctionUpdated({ client: lambda, maxWaitTime: 60 }, { FunctionName: LAMBDA }).catch(() => {});
    await lambda.send(new UpdateFunctionConfigurationCommand({ FunctionName: LAMBDA, Runtime: RUNTIME, Environment, Timeout: 30 }));
  } else {
    await lambda.send(new CreateFunctionCommand({
      FunctionName: LAMBDA,
      Runtime: RUNTIME,
      Handler: 'index.handler',
      Role: 'arn:aws:iam::000000000000:role/officeours-lambda', // Floci does not check IAM roles
      Code: { ZipFile },
      Timeout: 30,
      MemorySize: 256,
      Environment,
    }));
  }
  step(`Lambda ${exists ? 'updated' : 'created'}`, LAMBDA);
}

// SQS -> Lambda trigger: Floci hands every new "request confirmed" message to the worker Lambda by itself,
// the same way AWS does, so the queue works with only Floci running (no local poller needed).
// The Lambda reports failed messages one by one, so only those are retried (then moved to the dead-letter queue).
async function trigger(queueArn) {
  const settings = { Enabled: true, BatchSize: 5, FunctionResponseTypes: ['ReportBatchItemFailures'] };
  const { EventSourceMappings = [] } = await lambda.send(
    new ListEventSourceMappingsCommand({ FunctionName: LAMBDA, EventSourceArn: queueArn }),
  );
  const existing = EventSourceMappings.find(m => m.EventSourceArn === queueArn && String(m.FunctionArn).endsWith(`:${LAMBDA}`));
  if (existing) {
    await lambda.send(new UpdateEventSourceMappingCommand({ UUID: existing.UUID, FunctionName: LAMBDA, ...settings }));
  } else {
    await lambda.send(new CreateEventSourceMappingCommand({ FunctionName: LAMBDA, EventSourceArn: queueArn, ...settings }));
  }
  step(`SQS -> Lambda trigger ${existing ? 'updated' : 'created'}`, `${QUEUE} -> ${LAMBDA}`);
}

try {
  console.log(`Setting up S3 (Queue, QR & History) resources on ${config.endpoint}`);
  await bucket();
  const { queueUrl, queueArn } = await queues();
  const topicArn = await topic(queueArn, queueUrl);
  await sesIdentity();
  await worker();
  await trigger(queueArn);
    // Also create the scheduling service's resources (DynamoDB, IAM, Lambda, EventBridge, API Gateway) in the same Floci,
  // so the whole group needs only this one command (PROJECT_CONTEXT section 10: "one setup script").
  await setupS1();
  // The requests service's resources: its Lambda runs the whole service behind the app's API Gateway
  const s2 = await setupS2();
  // the rest of the app's API (scheduling and queue), so every /api/v1 route runs on Floci
  await setupServiceApis();
  console.log('\nDone. Put these in server/.env:');
  console.log(`  AWS_ENDPOINT_URL=${config.endpoint}`);
  console.log(`  S3_BUCKET=${BUCKET}`);
  console.log(`  SQS_QUEUE_URL=${queueUrl.replace('://floci:', '://localhost:')}`);
  console.log(`  QUEUE_LAMBDA_NAME=${LAMBDA}`);
  console.log(`  SES_SENDER_EMAIL=${SENDER}`);
  console.log(`  SNS_TOPIC_ARN=${topicArn}`);
  console.log(`  AI_LOG_BUCKET=${s2.bucket}`);
  console.log(`\nApp API on Floci (all 3 services): ${s2.apiUrl}/api/v1`);
  console.log(`  Try it: curl.exe "${s2.apiUrl}/api/v1/health"`);
} catch (err) {
  console.error(`\nFloci setup failed: ${err.message}`);
  console.error('Is Floci running? Start it with: docker compose up -d');
  process.exit(1);
}
