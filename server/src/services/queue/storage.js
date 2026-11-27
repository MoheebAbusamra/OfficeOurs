// Stores QR code images in an S3 bucket on Floci (key: qr/<token>.png)
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { awsConfig, awsEnabled } from './aws.js';

let client;
const s3 = () => (client ||= new S3Client(awsConfig()));

// Returns { status: 'stored', key, url } or { status: 'skipped' } when Floci is not configured
export async function storeQrImage(token, png) {
  if (!awsEnabled() || !process.env.S3_BUCKET) return { status: 'skipped' };
  const key = `qr/${token}.png`;
  await s3().send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    Body: png,
    ContentType: 'image/png',
  }));
  return { status: 'stored', key, url: `${process.env.AWS_ENDPOINT_URL.replace(/\/+$/, '')}/${process.env.S3_BUCKET}/${key}` };
}
