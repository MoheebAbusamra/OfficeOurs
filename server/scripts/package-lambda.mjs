// [S3] Bundles the S3 queue worker (src/services/queue/lambda.js + its libraries) into one file and zips it for Lambda
import { build } from 'esbuild';
import AdmZip from 'adm-zip';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist', 'lambda');

export async function packageLambda() {
  mkdirSync(outDir, { recursive: true });
  await build({
    entryPoints: [join(root, 'src/services/queue/lambda.js')],
    outfile: join(outDir, 'index.js'),
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs', // Lambda handler "index.handler"
    minify: true,
    logLevel: 'warning',
  });
  const zip = new AdmZip();
  zip.addFile('index.js', readFileSync(join(outDir, 'index.js')));
  const zipPath = join(outDir, 'queue-worker.zip');
  zip.writeZip(zipPath);
  return zipPath;
}

// Run directly: node scripts/package-lambda.mjs
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const path = await packageLambda();
  console.log(`Lambda package ready: ${path}`);
}
