// [Shared, added by S2 for the Floci deployment] Deploys one service's Express API as a Lambda
// behind the app's one API Gateway "officeours-api". Used by S2's setupS2() and by floci-api.mjs (S1, S3).
//
// For each service it does, in order (all safe to run again):
//   1. IAM role     what this Lambda may do (least privilege: only what the service needs)
//   2. Lambda       esbuild joins the service and everything it imports into one index.js, zipped
//   3. API Gateway  the service's routes on "officeours-api", all sent to this Lambda
import { build } from 'esbuild';
import AdmZip from 'adm-zip';
import { IAMClient, CreateRoleCommand, GetRoleCommand, PutRolePolicyCommand } from '@aws-sdk/client-iam';
import {
  LambdaClient, CreateFunctionCommand, GetFunctionCommand, UpdateFunctionCodeCommand, UpdateFunctionConfigurationCommand,
  AddPermissionCommand, waitUntilFunctionActiveV2, waitUntilFunctionUpdatedV2,
} from '@aws-sdk/client-lambda';
import {
  ApiGatewayV2Client, CreateApiCommand, GetApisCommand, CreateStageCommand,
  CreateIntegrationCommand, GetIntegrationsCommand, CreateRouteCommand, GetRoutesCommand,
} from '@aws-sdk/client-apigatewayv2';

export const API_NAME = 'officeours-api';
const ACCOUNT = '000000000000'; // Floci's fake account number

export const flociConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
};
const iam = new IAMClient(flociConfig);
const lambda = new LambdaClient(flociConfig);
const apigateway = new ApiGatewayV2Client(flociConfig);
const step = (label, value = '') => console.log(`  ok  ${label}${value ? `: ${value}` : ''}`);

// Settings every service Lambda needs. Each service adds its own on top.
export function baseLambdaEnv() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || '',
    // Inside Docker, Floci is reached by its service name "floci", not "localhost"
    AWS_ENDPOINT_URL: process.env.LAMBDA_AWS_ENDPOINT_URL || 'http://floci:4566',
    APP_TIMEZONE: process.env.APP_TIMEZONE || 'Africa/Cairo',
    // Frontends allowed to call the API (CORS), comma-separated
    CLIENT_URL: process.env.LAMBDA_CLIENT_URL || process.env.CLIENT_URL || 'http://localhost:5173',
  };
}

// The address of the app's API on Floci
export const apiUrlOf = (apiId) => `http://${apiId}.execute-api.localhost.floci.io:4566`;

// 1. IAM role: trust policy = Lambda may wear it, permissions = the statements given by the service
async function ensureRole(roleName, permissions) {
  let arn;
  try {
    arn = (await iam.send(new GetRoleCommand({ RoleName: roleName }))).Role.Arn;
  } catch {
    const trust = {
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }],
    };
    arn = (await iam.send(new CreateRoleCommand({ RoleName: roleName, AssumeRolePolicyDocument: JSON.stringify(trust) }))).Role.Arn;
  }
  const logs = { Effect: 'Allow', Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], Resource: '*' };
  await iam.send(new PutRolePolicyCommand({
    RoleName: roleName,
    PolicyName: `${roleName}-access`,
    PolicyDocument: JSON.stringify({ Version: '2012-10-17', Statement: [...permissions, logs] }),
  }));
  return arn;
}

// 2a. One zip with index.js inside (format cjs so Lambda finds "index.handler")
async function bundle(entry) {
  const result = await build({
    entryPoints: [entry], bundle: true, platform: 'node', target: 'node22', format: 'cjs',
    minify: true, write: false, logLevel: 'warning',
  });
  const zip = new AdmZip();
  zip.addFile('index.js', Buffer.from(result.outputFiles[0].text));
  return zip.toBuffer();
}

// 2b. Create the Lambda, or update its code and settings if it already exists
async function ensureFunction(name, entry, roleArn, environment) {
  const ZipFile = await bundle(entry);
  const Environment = { Variables: environment };

  let exists = true;
  try {
    await lambda.send(new GetFunctionCommand({ FunctionName: name }));
  } catch {
    exists = false;
  }

  if (exists) {
    await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: name, ZipFile }));
    await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 60 }, { FunctionName: name });
    await lambda.send(new UpdateFunctionConfigurationCommand({ FunctionName: name, Role: roleArn, Environment, Timeout: 30, MemorySize: 512 }));
    await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 60 }, { FunctionName: name });
  } else {
    await lambda.send(new CreateFunctionCommand({
      FunctionName: name,
      Runtime: 'nodejs22.x', // supabase-js needs Node 22+
      Handler: 'index.handler',
      Role: roleArn,
      Code: { ZipFile },
      Timeout: 30,
      MemorySize: 512,
      Environment,
    }));
    await waitUntilFunctionActiveV2({ client: lambda, maxWaitTime: 60 }, { FunctionName: name });
  }
  const arn = (await lambda.send(new GetFunctionCommand({ FunctionName: name }))).Configuration.FunctionArn;
  return { arn, created: !exists };
}

// 3a. Find or create the app's HTTP API ($default stage = no extra word in the URL, auto-deploy = live at once)
export async function ensureApi() {
  const { Items: apis = [] } = await apigateway.send(new GetApisCommand({}));
  let api = apis.find((a) => a.Name === API_NAME);
  if (!api) {
    api = await apigateway.send(new CreateApiCommand({ Name: API_NAME, ProtocolType: 'HTTP' }));
    await apigateway.send(new CreateStageCommand({ ApiId: api.ApiId, StageName: '$default', AutoDeploy: true }));
  }
  return api;
}

// 3b. Point the service's routes at its Lambda and allow API Gateway to call it
async function addRoutes(name, functionArn, routes) {
  const api = await ensureApi();

  // One integration = "send the whole request to this Lambda and return what it answers"
  const { Items: integrations = [] } = await apigateway.send(new GetIntegrationsCommand({ ApiId: api.ApiId }));
  let integration = integrations.find((i) => i.IntegrationUri === functionArn);
  if (!integration) {
    integration = await apigateway.send(new CreateIntegrationCommand({
      ApiId: api.ApiId, IntegrationType: 'AWS_PROXY', PayloadFormatVersion: '2.0', IntegrationUri: functionArn,
    }));
  }

  // Add only the routes that are missing
  const { Items: existing = [] } = await apigateway.send(new GetRoutesCommand({ ApiId: api.ApiId }));
  for (const RouteKey of routes) {
    if (existing.some((r) => r.RouteKey === RouteKey)) continue;
    await apigateway.send(new CreateRouteCommand({ ApiId: api.ApiId, RouteKey, Target: `integrations/${integration.IntegrationId}` }));
  }

  try {
    await lambda.send(new AddPermissionCommand({
      FunctionName: name,
      StatementId: `${API_NAME}-invoke-${name}`,
      Action: 'lambda:InvokeFunction',
      Principal: 'apigateway.amazonaws.com',
      SourceArn: `arn:aws:execute-api:${flociConfig.region}:${ACCOUNT}:${api.ApiId}/*`,
    }));
  } catch (err) {
    if (!/exist|conflict/i.test(err.name + err.message)) throw err; // already allowed is fine
  }
  return apiUrlOf(api.ApiId);
}

// Deploys one service: { name, entry (absolute path of its lambda file), roleName, permissions, environment, routes }
export async function deployHttpLambda({ name, entry, roleName, permissions, environment, routes }) {
  const roleArn = await ensureRole(roleName, permissions);
  step('IAM role', roleName);
  const fn = await ensureFunction(name, entry, roleArn, environment);
  step(`Lambda ${fn.created ? 'created' : 'updated'}`, name);
  const url = await addRoutes(name, fn.arn, routes);
  step(`API Gateway ${API_NAME}: ${routes.length} routes`, url);
  return { url, functionArn: fn.arn };
}
