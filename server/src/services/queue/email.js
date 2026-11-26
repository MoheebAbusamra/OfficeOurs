// [S3] Builds the "your QR ticket" email (subject, HTML, plain text) sent by Brevo and copied to SES
import { checkInUrl } from './qr.js';

const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ticket = { studentName, instructorName, title, slotDate, startTime, location, position, token }
export function buildTicketEmail(ticket) {
  const link = checkInUrl(ticket.token);
  const subject = `Your OfficeOurs ticket: ${ticket.title}`;
  const text = [
    `Hi ${ticket.studentName},`,
    '',
    `${ticket.instructorName} confirmed your meeting "${ticket.title}".`,
    `Date: ${ticket.slotDate}, around ${ticket.startTime}`,
    `Place: ${ticket.location}`,
    `Queue position: #${ticket.position}`,
    '',
    `Your QR code is attached. Scan it at the door, or open: ${link}`,
    'The ticket works once, on the meeting day only.',
  ].join('\n');

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#2B0710">
    <h2 style="color:#590A1C">Your meeting is confirmed</h2>
    <p>Hi ${escape(ticket.studentName)},</p>
    <p><b>${escape(ticket.instructorName)}</b> confirmed <b>"${escape(ticket.title)}"</b>.</p>
    <table style="border-collapse:collapse;background:#FFF6D1;border:2px solid #2B0710">
      <tr><td style="padding:6px 12px">Date</td><td style="padding:6px 12px"><b>${escape(ticket.slotDate)}</b>, around ${escape(ticket.startTime)}</td></tr>
      <tr><td style="padding:6px 12px">Place</td><td style="padding:6px 12px">${escape(ticket.location)}</td></tr>
      <tr><td style="padding:6px 12px">Queue</td><td style="padding:6px 12px">#${escape(ticket.position)}</td></tr>
    </table>
    <p>Your QR code is attached (<i>officeours-ticket.png</i>). Scan it at the door, or use the button:</p>
    <p><a href="${escape(link)}" style="display:inline-block;background:#590A1C;color:#FCEA9C;padding:10px 18px;text-decoration:none;font-weight:bold">Open my ticket</a></p>
    <p style="color:#6B4A52;font-size:13px">The ticket works once, on the meeting day only.</p>
  </div>`;

  return { subject, text, html };
}
