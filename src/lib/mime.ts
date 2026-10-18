// בניית הודעת מייל (MIME) עם טקסט בעברית וקובץ PDF מצורף.
// כותרות בעברית מקודדות לפי RFC 2047, ושם הקובץ לפי RFC 2231, כדי שיוצגו נכון בכל תוכנת מייל.

export interface MailInput {
  to: string[];
  subject: string;
  body: string;
  attachment: { name: string; blob: Blob };
}

function utf8ToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** שורות של 76 תווים לכל היותר, כמו שתקן המייל דורש */
export function wrap76(b64: string): string {
  return b64.replace(/.{1,76}/g, '$&\r\n').trimEnd();
}

/** כותרת: ASCII נשאר כמו שהוא, כל השאר מקודד ב-=?UTF-8?B?...?= */
export function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${utf8ToBase64(value)}?=`;
}

/** שם קובץ לא-ASCII בצורה ש-Gmail ותוכנות אחרות מבינות (RFC 2231) */
export function encodeFilenameParam(name: string): string {
  const pct = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `filename*=UTF-8''${pct}`;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(email.trim());
}

export async function buildMimeMessage({ to, subject, body, attachment }: MailInput): Promise<string> {
  const recipients = to.map((t) => t.trim()).filter(Boolean);
  if (!recipients.length) throw new Error('אין נמענים');
  const bad = recipients.find((r) => !isValidEmail(r));
  if (bad) throw new Error(`כתובת מייל לא תקינה: ${bad}`);

  const boundary = `----scanner-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const fileB64 = bytesToBase64(new Uint8Array(await attachment.blob.arrayBuffer()));
  const type = attachment.blob.type || 'application/octet-stream';

  return [
    `To: ${recipients.join(', ')}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(utf8ToBase64(body)),
    '',
    `--${boundary}`,
    `Content-Type: ${type}; name="${encodeHeader(attachment.name)}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; ${encodeFilenameParam(attachment.name)}`,
    '',
    wrap76(fileB64),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');
}
