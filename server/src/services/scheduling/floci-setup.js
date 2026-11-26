// [S1] Creates S1's AWS resources on Floci (safe to run again): DynamoDB table, IAM roles, Lambda, EventBridge schedule, API Gateway
// Run it from the server folder:  node src/services/scheduling/floci-setup.js
// (scripts/floci-setup.mjs also calls setupS1(), so the whole group's setup is one command)
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import AdmZip from 'adm-zip';
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { IAMClient, CreateRoleCommand, GetRoleCommand, PutRolePolicyCommand } from '@aws-sdk/client-iam';
import { LambdaClient, CreateFunctionCommand, GetFunctionCommand, UpdateFunctionCodeCommand, UpdateFunctionConfigurationCommand, AddPermissionCommand, waitUntilFunctionActiveV2, waitUntilFunctionUpdatedV2 } from '@aws-sdk/client-lambda';
import { SchedulerClient, CreateScheduleCommand, GetScheduleCommand } from '@aws-sdk/client-scheduler';
import { ApiGatewayV2Client, CreateApiCommand, GetApisCommand, CreateIntegrationCommand, CreateRouteCommand, CreateStageCommand } from '@aws-sdk/client-apigatewayv2';
import { HOLIDAYS_TABLE } from './dynamo.js';
 
// Names of S1's resources on Floci
const LAMBDA = 'officeours-holidays';
const LAMBDA_ROLE = 'officeours-holidays-lambda-role';
const SCHEDULER_ROLE = 'officeours-holidays-scheduler-role';
const SCHEDULE = 'officeours-holidays-daily';
const API = 'officeours-s1-api';
const ACCOUNT = '000000000000'; // Floci's fake account number
 
// Same settings as dynamo.js. If AWS_ENDPOINT_URL is empty we still go to Floci on this laptop.
const config = {
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
};
const dynamodb = new DynamoDBClient(config);
const iam = new IAMClient(config);
const lambda = new LambdaClient(config);
const scheduler = new SchedulerClient(config);
const apigateway = new ApiGatewayV2Client(config);
 
// 1. DynamoDB table for the holidays cache.
//    Key = year + date, so one year's holidays can be read in one query, sorted by date.
async function createHolidaysTable() {
  try {
    await dynamodb.send(new DescribeTableCommand({ TableName: HOLIDAYS_TABLE }));
    console.log(`  ok  DynamoDB table already exists: ${HOLIDAYS_TABLE}`);
    return;
  } catch {
    // DescribeTable fails when the table is not there yet, so we create it below
  }
 
  await dynamodb.send(new CreateTableCommand({
    TableName: HOLIDAYS_TABLE,
    AttributeDefinitions: [
      { AttributeName: 'year', AttributeType: 'N' }, // N = number
      { AttributeName: 'date', AttributeType: 'S' }, // S = string, like "2026-01-07"
    ],
    KeySchema: [
      { AttributeName: 'year', KeyType: 'HASH' },  // partition key: groups the items by year
      { AttributeName: 'date', KeyType: 'RANGE' }, // sort key: sorts them by date inside the year
    ],
    BillingMode: 'PAY_PER_REQUEST', // no capacity to set up
  }));
  console.log(`  ok  DynamoDB table created: ${HOLIDAYS_TABLE}`);
}
 
// 2. IAM role = a "badge" that a service wears. Two parts, like Lab 6:
//    trust policy = WHO may wear the badge, permissions policy = WHICH doors it opens.
async function createRole(roleName, service, permissions) {
  let arn;
  try {
    const role = await iam.send(new GetRoleCommand({ RoleName: roleName }));
    arn = role.Role.Arn;
  } catch {
    const trustPolicy = {
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Principal: { Service: service }, Action: 'sts:AssumeRole' }],
    };
    const role = await iam.send(new CreateRoleCommand({ RoleName: roleName, AssumeRolePolicyDocument: JSON.stringify(trustPolicy) }));
    arn = role.Role.Arn;
  }
 
  // Write (or rewrite) the permissions of the role
  await iam.send(new PutRolePolicyCommand({
    RoleName: roleName,
    PolicyName: `${roleName}-access`,
    PolicyDocument: JSON.stringify({ Version: '2012-10-17', Statement: permissions }),
  }));
  console.log(`  ok  IAM role ready: ${roleName}`);
  return arn;
}
 
async function createRoles() {
  // The Lambda may only read and write the holidays table, and write its logs. Nothing else (no delete).
  const lambdaRoleArn = await createRole(LAMBDA_ROLE, 'lambda.amazonaws.com', [
    {
      Effect: 'Allow',
      Action: ['dynamodb:Query', 'dynamodb:PutItem'],
      Resource: `arn:aws:dynamodb:${config.region}:${ACCOUNT}:table/${HOLIDAYS_TABLE}`,
    },
    {
      Effect: 'Allow',
      Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      Resource: '*',
    },
  ]);
 
  // The daily schedule may only start our one Lambda
  const schedulerRoleArn = await createRole(SCHEDULER_ROLE, 'scheduler.amazonaws.com', [
    {
      Effect: 'Allow',
      Action: 'lambda:InvokeFunction',
      Resource: `arn:aws:lambda:${config.region}:${ACCOUNT}:function:${LAMBDA}`,
    },
  ]);
 
  return { lambdaRoleArn, schedulerRoleArn };
}
 
// 3. Lambda "officeours-holidays" (code in lambda.js).
//    esbuild joins lambda.js and everything it imports into one file, then we zip it, because Lambda needs a zip.
async function createHolidaysLambda(roleArn) {
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL('./lambda.js', import.meta.url))],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs', // so Lambda can find "index.handler"
    write: false,  // keep the result in memory, no file on disk
    logLevel: 'warning',
  });
  const zip = new AdmZip();
  zip.addFile('index.js', Buffer.from(bundled.outputFiles[0].text));
  const ZipFile = zip.toBuffer();
 
  // The Lambda runs in its own Docker container, so it gets its own copy of the settings it needs
  const Environment = {
    Variables: {
      CALENDARIFIC_API_KEY: process.env.CALENDARIFIC_API_KEY || '',
      SUPABASE_URL: process.env.SUPABASE_URL || '',
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || '',
      AWS_ENDPOINT_URL: 'http://floci:4566', // inside Docker, Floci's name is "floci", not "localhost"
    },
  };
 
  // Already there? Update its code and settings. Otherwise create it.
  let exists = true;
  try {
    await lambda.send(new GetFunctionCommand({ FunctionName: LAMBDA }));
  } catch {
    exists = false;
  }
 
  if (exists) {
    await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: LAMBDA, ZipFile }));
    await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 60 }, { FunctionName: LAMBDA });
    await lambda.send(new UpdateFunctionConfigurationCommand({ FunctionName: LAMBDA, Role: roleArn, Environment, Timeout: 30 }));
    await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 60 }, { FunctionName: LAMBDA });
    console.log(`  ok  Lambda updated: ${LAMBDA}`);
  } else {
    await lambda.send(new CreateFunctionCommand({
      FunctionName: LAMBDA,
      Runtime: 'nodejs22.x',
      Handler: 'index.handler', // file index.js, function "handler"
      Role: roleArn,
      Code: { ZipFile },
      Timeout: 30,
      MemorySize: 256,
      Environment,
    }));
    await waitUntilFunctionActiveV2({ client: lambda, maxWaitTime: 60 }, { FunctionName: LAMBDA });
    console.log(`  ok  Lambda created: ${LAMBDA}`);
  }
 
  const fn = await lambda.send(new GetFunctionCommand({ FunctionName: LAMBDA }));
  return fn.Configuration.FunctionArn;
}
 
// 4. EventBridge Scheduler: runs the Lambda once a day (that is part B in lambda.js)
async function createDailySchedule(lambdaArn, roleArn) {
  try {
    await scheduler.send(new GetScheduleCommand({ Name: SCHEDULE }));
    console.log(`  ok  EventBridge schedule already exists: ${SCHEDULE}`);
    return;
  } catch {
    // not there yet, create it below
  }
 
  await scheduler.send(new CreateScheduleCommand({
    Name: SCHEDULE,
    ScheduleExpression: 'rate(1 day)',
    FlexibleTimeWindow: { Mode: 'OFF' }, // run exactly on time
    Target: {
      Arn: lambdaArn,
      RoleArn: roleArn,
      Input: JSON.stringify({ source: 'daily-schedule' }),
    },
  }));
  console.log(`  ok  EventBridge schedule created: ${SCHEDULE} (every day)`);
}
 
// 5. API Gateway (HTTP API, like Lab 7): the route GET /holidays calls the Lambda (that is part A in lambda.js)
async function createApi(lambdaArn) {
  const apis = await apigateway.send(new GetApisCommand({}));
  let api = apis.Items?.find(a => a.Name === API);
 
  if (!api) {
    // Step 1: the API, and the integration = where its routes send requests (our Lambda)
    api = await apigateway.send(new CreateApiCommand({ Name: API, ProtocolType: 'HTTP' }));
    const integration = await apigateway.send(new CreateIntegrationCommand({
      ApiId: api.ApiId,
      IntegrationType: 'AWS_PROXY', // send the whole request to the Lambda, return what it answers
      PayloadFormatVersion: '2.0',
      IntegrationUri: lambdaArn,
    }));
 
    // Step 2: the only allowed route. Any other path gets 404 from API Gateway itself.
    await apigateway.send(new CreateRouteCommand({
      ApiId: api.ApiId,
      RouteKey: 'GET /holidays',
      Target: `integrations/${integration.IntegrationId}`,
    }));
 
    // Step 3: publish it. $default = no extra word in the URL, auto-deploy = changes go live at once
    await apigateway.send(new CreateStageCommand({ ApiId: api.ApiId, StageName: '$default', AutoDeploy: true }));
 
    // Step 4: allow API Gateway to call the Lambda (if it is already allowed, that is fine too)
    try {
      await lambda.send(new AddPermissionCommand({
        FunctionName: LAMBDA,
        StatementId: 'api-gateway-get-holidays',
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
      }));
    } catch (err) {
      if (!err.message.includes('already exists')) throw err;
    }
    console.log(`  ok  API Gateway created: ${API}`);
  } else {
    console.log(`  ok  API Gateway already exists: ${API}`);
  }
 
  // On Floci we build the address ourselves (same as Lab 7)
  console.log(`      Try it: curl "http://${api.ApiId}.execute-api.localhost.floci.io:4566/holidays?year=2026"`);
}
 
// Creates everything S1 needs, in order
export async function setupS1() {
  console.log(`Setting up S1 (Scheduling) resources on ${config.endpoint}`);
  await createHolidaysTable();
  const { lambdaRoleArn, schedulerRoleArn } = await createRoles();
  const lambdaArn = await createHolidaysLambda(lambdaRoleArn);
  await createDailySchedule(lambdaArn, schedulerRoleArn);
  await createApi(lambdaArn);
}
 
// Run by itself when you start this file directly with "node ... floci-setup.js"
if (process.argv[1].endsWith('floci-setup.js')) {
  try {
    await setupS1();
    console.log('Done.');
  } catch (err) {
    console.error(`S1 Floci setup failed: ${err.message}`);
    console.error('Is Floci running? Start it with: docker compose up -d');
    process.exit(1);
  }
}
 