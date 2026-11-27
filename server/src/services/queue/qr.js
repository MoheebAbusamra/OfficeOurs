// Generates the QR code containing the check-in link/token (#12)
import QRCode from 'qrcode';

// Public frontend URL the QR opens, e.g. https://officeours.vercel.app/check-in/<token>
export function checkInUrl(token) {
  const base = (process.env.CHECKIN_BASE_URL || process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/check-in/${token}`;
}

// PNG image of the QR code as a Buffer (stored in S3 and attached to the email)
export function makeQrPng(token) {
  return QRCode.toBuffer(checkInUrl(token), {
    type: 'png',
    width: 360,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#2B0710', light: '#FFFFFF' },
  });
}
