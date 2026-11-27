// Puts the frontend on Floci:
//   1. find the app's API Gateway address
//   2. build the React app against it (mocks off, # links, relative file paths)
//   3. create the S3 web bucket, allow public reads of its files (bucket policy)
//   4. replace the old files with the new build (each file with the right Content-Type)
// Run alone from the server folder: npm run deploy:web   (deploy-floci.mjs also calls it)
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  S3Client, CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand,
  ListObjectsV2Command, DeleteObjectsCommand, PutObjectCommand,
} from '@aws-sdk/client-s3';
import { ensureApi, apiUrlOf, flociConfig, WEB_BUCKET, WEB_URL } from './floci-http-lambda.mjs';

const CLIENT_DIR = fileURLToPath(new URL('../../client', import.meta.url));
const DIST_DIR = join(CLIENT_DIR, 'dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const s3 = new S3Client(flociConfig);
const step = (label, value = '') => console.log(`  ok  ${label}${value ? `: ${value}` : ''}`);

// Every file under a folder, as absolute paths
function filesIn(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}

// 2. Vite reads these VITE_* values from the environment; they win over the values in client/.env
function buildFrontend(apiBase) {
  console.log(`  ..  building the frontend against ${apiBase}`);
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: CLIENT_DIR,
    stdio: 'inherit',
    shell: true, // needed on Windows to run npm
    env: { ...process.env, VITE_API_URL: apiBase, VITE_USE_MOCKS: 'false', VITE_ROUTER: 'hash', VITE_BASE: './' },
  });
  if (result.status !== 0) throw new Error('the frontend build failed (see the lines above)');
  step('Frontend built', 'client/dist');
}

// 3. The bucket, readable by anyone (it only holds the public website files)
async function webBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: WEB_BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: WEB_BUCKET }));
  }
  try {
    await s3.send(new PutBucketPolicyCommand({
      Bucket: WEB_BUCKET,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{ Sid: 'PublicReadWebsite', Effect: 'Allow', Principal: '*', Action: 's3:GetObject', Resource: `arn:aws:s3:::${WEB_BUCKET}/*` }],
      }),
    }));
  } catch (err) {
    console.warn(`  !!  bucket policy not set (${err.message}); Floci serves the files anyway`);
  }
  step('S3 web bucket (public read)', WEB_BUCKET);
}

// 4. Old build files have other names (hashes), so delete them first, then upload the new build
async function upload() {
  const { Contents = [] } = await s3.send(new ListObjectsV2Command({ Bucket: WEB_BUCKET }));
  if (Contents.length > 0) {
    await s3.send(new DeleteObjectsCommand({ Bucket: WEB_BUCKET, Delete: { Objects: Contents.map(({ Key }) => ({ Key })) } }));
  }
  const files = filesIn(DIST_DIR);
  for (const path of files) {
    const Key = relative(DIST_DIR, path).split(sep).join('/'); // Windows "assets\x.js" -> "assets/x.js"
    await s3.send(new PutObjectCommand({
      Bucket: WEB_BUCKET,
      Key,
      Body: readFileSync(path),
      ContentType: TYPES[extname(path).toLowerCase()] || 'application/octet-stream',
      // index.html must never be cached (it names the current build's files); the hashed files can be
      CacheControl: Key === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    }));
  }
  step(`Uploaded ${files.length} files`, `s3://${WEB_BUCKET}`);
}

export async function deployWeb() {
  console.log('Deploying the frontend to S3');
  const api = await ensureApi(); // 1. the app's API Gateway (created by the Lambda setup)
  buildFrontend(`${apiUrlOf(api.ApiId)}/api/v1`);
  await webBucket();
  await upload();
  return WEB_URL;
}

// Run by itself: npm run deploy:web
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const url = await deployWeb();
    console.log(`\nWebsite on Floci: ${url}`);
  } catch (err) {
    console.error(`Frontend deploy failed: ${err.message}`);
    console.error('Is Floci running (docker compose up -d) and was "npm run floci:setup" run first?');
    process.exit(1);
  }
}
