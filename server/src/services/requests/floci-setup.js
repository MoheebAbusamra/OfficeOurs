// [S2] Creates S2's AWS resources on Floci (safe to run again, existing resources are reused or updated):
//   1. SNS topic        S2 publishes "request confirmed / cancelled" here (S3 subscribes its SQS queue to it)
//   2. S3 bucket        the AI log, one JSON file per Gemini call
//   3. IAM role         what the S2 Lambda may do: publish to the topic, write to the bucket, write logs
//   4. Lambda           "officeours-requests" = the whole S2 service (lambda.js wraps our Express routes)
//   5. API Gateway      S2's routes on the app's one HTTP API "officeours-api"
// scripts/floci-setup.mjs calls setupS2(), so the whole group's setup stays one command.
// It can also run alone, from the server folder: node src/services/requests/floci-setup.js
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import AdmZip from 'adm-zip';
import { SNSClient, CreateTopicCommand } from '@aws-sdk/client-sns';
import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { IAMClient, CreateRoleCommand, GetRoleCommand, PutRolePolicyCommand } from '@aws-sdk/client-iam';
import {
  LambdaClient, CreateFunctionCommand, GetFunctionCommand, UpdateFunctionCodeCommand, UpdateFunctionConfigurationCommand,
  AddPermissionCommand, waitUntilFunctionActiveV2, waitUntilFunctionUpdatedV2,
} from '@aws-sdk/client-lambda';
import {
  ApiGatewayV2Client, CreateApiCommand, GetApisCommand, CreateStageCommand,
  CreateIntegrationCommand, GetIntegrationsCommand, CreateRouteCommand, GetRoutesCommand,
} from '@aws-sdk/client-apigatewayv2';

// Names of S2's resources on Floci
const TOPIC = 'officeours-request-events'; // same name as in S3's setup: creating it again returns the same topic
const BUCKET = process.env.AI_LOG_BUCKET || 'officeours-ai-log';
const ROLE = 'officeours-requests-lambda-role';
const LAMBDA = 'officeours-requests';
const API = 'officeours-api'; // the app's one API Gateway; the other services add their routes to it the same way
const ACCOUNT = '000000000000'; // Floci's fake account number

// S2's paths. "{proxy+}" = anything below the path, e.g. /api/v1/requests/<id>/status. ANY = every HTTP method.
const ROUTES = ['/api/v1/requests', '/api/v1/faqs', '/api/v1/notifications']
  .flatMap((path) => [`ANY ${path}`, `ANY ${path}/{proxy+}`]);

const config = {
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
  forcePathStyle: true, // Floci serves buckets as http://host:4566/<bucket>
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
};
const sns = new SNSClient(config);
const s3 = new S3Client(config);
const iam = new IAMClient(config);
const lambda = new LambdaClient(config);
const apigateway = new ApiGatewayV2Client(config);
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

// 3. IAM role: trust policy = Lambda may wear it, permissions = only what S2 needs (least privilege)
async function createRole(topicArn) {
  let arn;
  try {
    arn = (await iam.send(new GetRoleCommand({ RoleName: ROLE }))).Role.Arn;
  } catch {
    const trust = {
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }],
    };
    arn = (await iam.send(new CreateRoleCommand({ RoleName: ROLE, AssumeRolePolicyDocument: JSON.stringify(trust) }))).Role.Arn;
  }
  await iam.send(new PutRolePolicyCommand({
    RoleName: ROLE,
    PolicyName: `${ROLE}-access`,
    PolicyDocument: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        { Effect: 'Allow', Action: 'sns:Publish', Resource: topicArn },
        { Effect: 'Allow', Action: 's3:PutObject', Resource: `arn:aws:s3:::${BUCKET}/ai-log/*` },
        { Effect: 'Allow', Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], Resource: '*' },
      ],
    }),
  }));
  step('IAM role (publish, write AI log, logs)', ROLE);
  return arn;
}

// esbuild joins lambda.js and everything it imports (Express, our routes, supabase-js, AWS SDK) into one file,
// then we zip it, because Lambda needs a zip with index.js inside
async function bundle() {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('./lambda.js', import.meta.url))],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs', // so Lambda finds "index.handler"
    minify: true,
    write: false, // keep it in memory
    logLevel: 'warning',
  });
  const zip = new AdmZip();
  zip.addFile('index.js', Buffer.from(result.outputFiles[0].text));
  return zip.toBuffer();
}

// 4. The Lambda. It runs in its own Docker container, so it gets its own copy of the settings it needs.
async function createLambda(roleArn, topicArn) {
  const ZipFile = await bundle();
  const Environment = {
    Variables: {
      SUPABASE_URL: process.env.SUPABASE_URL || '',
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || '',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
      GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      // Inside Docker, Floci is reached by its service name "floci", not "localhost"
      AWS_ENDPOINT_URL: process.env.LAMBDA_AWS_ENDPOINT_URL || 'http://floci:4566',
      SNS_TOPIC_ARN: topicArn,
      AI_LOG_BUCKET: BUCKET,
      // Frontends allowed to call the API (CORS), comma-separated: local dev now, the S3 website in Part 2
      CLIENT_URL: process.env.LAMBDA_CLIENT_URL || process.env.CLIENT_URL || 'http://localhost:5173',
    },
  };

  let exists = true;
  try {
    await lambda.send(new GetFunctionCommand({ FunctionName: LAMBDA }));
  } catch {
    exists = false;
  }

  if (exists) {
    await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: LAMBDA, ZipFile }));
    await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 60 }, { FunctionName: LAMBDA });
    await lambda.send(new UpdateFunctionConfigurationCommand({ FunctionName: LAMBDA, Role: roleArn, Environment, Timeout: 30, MemorySize: 512 }));
    await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 60 }, { FunctionName: LAMBDA });
  } else {
    await lambda.send(new CreateFunctionCommand({
      FunctionName: LAMBDA,
      Runtime: 'nodejs22.x', // supabase-js needs Node 22+
      Handler: 'index.handler',
      Role: roleArn,
      Code: { ZipFile },
      Timeout: 30, // Gemini can take up to 20 s
      MemorySize: 512,
      Environment,
    }));
    await waitUntilFunctionActiveV2({ client: lambda, maxWaitTime: 60 }, { FunctionName: LAMBDA });
  }
  step(`Lambda ${exists ? 'updated' : 'created'}`, LAMBDA);
  return (await lambda.send(new GetFunctionCommand({ FunctionName: LAMBDA }))).Configuration.FunctionArn;
}

// 5. API Gateway: find or create the app's HTTP API, then point S2's routes at the S2 Lambda
async function createRoutes(lambdaArn) {
  const { Items: apis = [] } = await apigateway.send(new GetApisCommand({}));
  let api = apis.find((a) => a.Name === API);
  if (!api) {
    api = await apigateway.send(new CreateApiCommand({ Name: API, ProtocolType: 'HTTP' }));
    // $default = no extra word in the URL, auto-deploy = route changes go live at once
    await apigateway.send(new CreateStageCommand({ ApiId: api.ApiId, StageName: '$default', AutoDeploy: true }));
  }

  // One integration = "send the whole request to this Lambda and return what it answers"
  const { Items: integrations = [] } = await apigateway.send(new GetIntegrationsCommand({ ApiId: api.ApiId }));
  let integration = integrations.find((i) => i.IntegrationUri === lambdaArn);
  if (!integration) {
    integration = await apigateway.send(new CreateIntegrationCommand({
      ApiId: api.ApiId,
      IntegrationType: 'AWS_PROXY',
      PayloadFormatVersion: '2.0',
      IntegrationUri: lambdaArn,
    }));
  }

  // Add only the routes that are missing
  const { Items: routes = [] } = await apigateway.send(new GetRoutesCommand({ ApiId: api.ApiId }));
  for (const RouteKey of ROUTES) {
    if (routes.some((r) => r.RouteKey === RouteKey)) continue;
    await apigateway.send(new CreateRouteCommand({ ApiId: api.ApiId, RouteKey, Target: `integrations/${integration.IntegrationId}` }));
  }

  // Allow API Gateway to call the Lambda (already allowed is fine too)
  try {
    await lambda.send(new AddPermissionCommand({
      FunctionName: LAMBDA,
      StatementId: 'officeours-api-invoke-requests',
      Action: 'lambda:InvokeFunction',
      Principal: 'apigateway.amazonaws.com',
      SourceArn: `arn:aws:execute-api:${config.region}:${ACCOUNT}:${api.ApiId}/*`,
    }));
  } catch (err) {
    if (!/exist|conflict/i.test(err.name + err.message)) throw err;
  }

  const url = `http://${api.ApiId}.execute-api.localhost.floci.io:4566`;
  step(`API Gateway ${API}: ${ROUTES.length} S2 routes`, url);
  return url;
}

// Creates everything S2 needs, in order, and returns the values for server/.env
export async function setupS2() {
  console.log(`Setting up S2 (Requests, FAQ & Notifications) resources on ${config.endpoint}`);
  const topicArn = await createTopic();
  await createBucket();
  const roleArn = await createRole(topicArn);
  const lambdaArn = await createLambda(roleArn, topicArn);
  const apiUrl = await createRoutes(lambdaArn);
  console.log(`      Try it (expect 401 "Please log in first"): curl.exe "${apiUrl}/api/v1/faqs"`);
  return { topicArn, bucket: BUCKET, apiUrl };
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
