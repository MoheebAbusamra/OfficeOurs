// Keeps a copy of every ticket email in SES on Floci (the real delivery is done by Brevo)
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { awsConfig, awsEnabled } from './aws.js';

let client;
const ses = () => (client ||= new SESClient(awsConfig()));

// Returns { status: 'stored', messageId } or { status: 'skipped' } when Floci is not configured
export async function copyToSes({ to, subject, html, text }) {
  const sender = process.env.SES_SENDER_EMAIL;
  if (!awsEnabled() || !sender || sender === 'placeholder@example.com') return { status: 'skipped' };
  const out = await ses().send(new SendEmailCommand({
    Source: sender,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject },
      Body: { Html: { Data: html }, Text: { Data: text } },
    },
  }));
  return { status: 'stored', messageId: out.MessageId };
}
