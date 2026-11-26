// [S3] Brevo client: emails the QR code to the student (#12)
// Brevo transactional email API: https://developers.brevo.com/reference/sendtransacemail (free plan, 300 emails/day)
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

const configured = () => {
  const key = process.env.BREVO_API_KEY;
  return Boolean(key && key !== 'placeholder' && process.env.BREVO_SENDER_EMAIL);
};

// Returns { status: 'sent', messageId } | { status: 'skipped' }; throws if Brevo rejects the email
export async function sendWithBrevo({ to, toName, subject, html, text, png }) {
  if (!configured()) return { status: 'skipped' };

  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'OfficeOurs' },
      to: [{ email: to, name: toName }],
      subject,
      htmlContent: html,
      textContent: text,
      attachment: [{ name: 'officeours-ticket.png', content: png.toString('base64') }],
    }),
    signal: AbortSignal.timeout(10000),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${body.message || 'email was not accepted'}`);
  return { status: 'sent', messageId: body.messageId };
}
