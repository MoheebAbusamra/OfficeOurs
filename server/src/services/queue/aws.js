// Shared AWS SDK settings for the queue service's clients (SQS, S3, SES, Lambda) pointing at Floci (http://localhost:4566)
// Without AWS_ENDPOINT_URL the cloud steps are skipped and the app still works (local dev without Docker).
export const awsEnabled = () => Boolean(process.env.AWS_ENDPOINT_URL);

export function awsConfig() {
  return {
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.AWS_ENDPOINT_URL,
    forcePathStyle: true, // Floci serves buckets as http://host:4566/<bucket>/<key>
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
    },
  };
}
