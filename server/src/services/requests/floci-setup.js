// [S2] Creates S2's AWS resources on Floci (safe to run again, existing resources are reused or updated):
//   1. SNS topic        S2 publishes "request confirmed / cancelled" here (S3 subscribes its SQS queue to it)
//   2. S3 bucket        the AI log, one JSON file per Gemini call
//   3. IAM role         what the S2 Lambda may do: publish to the topic, write to the bucket, write logs
//   4. Lambda           "officeours-requests" = the whole S2 service (lambda.js wraps our Express routes)
//   5. API Gateway      S2's routes on the app's one HTTP API "officeours-api"
// Steps 3 to 5 use the shared helper scripts/floci-http-lambda.mjs, the same one S1's and S3's APIs use.
// scripts/floci-setup.mjs calls setupS2(), so the whole group's setup stays one command.
// It can also run alone, from the server folder: node src/services/requests/floci-setup.js
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { SNSClient, CreateTopicCommand } from '@aws-sdk/client-sns';
import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { deployHttpLambda, baseLambdaEnv, flociConfig } from '../../../scripts/floci-http-lambda.mjs';

// Names of S2's resources on Floci
const TOPIC = 'officeours-request-events'; // same name as in S3's setup: creating it again returns the same topic
const BUCKET = process.env.AI_LOG_BUCKET || 'officeours-ai-log';
const ROLE = 'officeours-requests-lambda-role';
const LAMBDA = 'officeours-requests';

// S2's paths. "{proxy+}" = anything below the path, e.g. /api/v1/requests/<id>/status. ANY = every HTTP method.
const ROUTES = ['/api/v1/requests', '/api/v1/faqs', '/api/v1/notifications']
  .flatMap((path) => [`ANY ${path}`, `ANY ${path}/{proxy+}`]);

const sns = new SNSClient(flociConfig);
const s3 = new S3Client(flociConfig);
const step = (label, value = '') => console.log(`  ok  ${label}${value ? `: ${value}` : ''}`);

// 1. SNS topic. CreateTopic returns the existing topic if it is already there.
async function createTopic() {
  const { TopicArn } = await sns.send(new CreateTopicCommand({ Name: TOPIC }));
  step('SNS topic (S2 publishes request events)', TopicArn);
  return TopicArn;
}

// 2. S3 bucket for the AI log
async function createBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }
  step('S3 bucket (AI log)', BUCKET);
}

// Creates everything S2 needs, in order, and returns the values for server/.env
export async function setupS2() {
  console.log(`Setting up S2 (Requests, FAQ & Notifications) resources on ${flociConfig.endpoint}`);
  const topicArn = await createTopic();
  await createBucket();

  // 3 to 5. IAM role (least privilege), Lambda, API Gateway routes
  const { url } = await deployHttpLambda({
    name: LAMBDA,
    entry: fileURLToPath(new URL('./lambda.js', import.meta.url)),
    roleName: ROLE,
    permissions: [
      { Effect: 'Allow', Action: 'sns:Publish', Resource: topicArn },
      { Effect: 'Allow', Action: 's3:PutObject', Resource: `arn:aws:s3:::${BUCKET}/ai-log/*` },
    ],
    environment: {
      ...baseLambdaEnv(),
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
      GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      SNS_TOPIC_ARN: topicArn,
      AI_LOG_BUCKET: BUCKET,
    },
    routes: ROUTES,
  });
  console.log(`      Try it (expect 401 "Please log in first"): curl.exe "${url}/api/v1/faqs"`);
  return { topicArn, bucket: BUCKET, apiUrl: url };
}

// Run by itself: node src/services/requests/floci-setup.js
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const { topicArn, bucket } = await setupS2();
    console.log('\nDone. Put these in server/.env:');
    console.log(`  SNS_TOPIC_ARN=${topicArn}`);
    console.log(`  AI_LOG_BUCKET=${bucket}`);
  } catch (err) {
    console.error(`S2 Floci setup failed: ${err.message}`);
    console.error('Is Floci running? Start it with: docker compose up -d');
    process.exit(1);
  }
}
