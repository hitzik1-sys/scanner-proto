// שליחת מייל עם קובץ מצורף דרך ה-Gmail של המשתמש (הרשאת gmail.send: שליחה בלבד).
// המייל נשלח בשם המשתמש ומופיע אצלו בדואר היוצא.
//
// חשוב: לא להשתמש בנקודת ההעלאה (upload/gmail/v1/.../send?uploadType=media).
// היא שולחת את המייל, אבל התשובה חוזרת בלי כותרות CORS, ולכן הדפדפן מדווח
// "Failed to fetch" על מייל שבפועל נשלח, והמשתמש עלול לשלוח שוב.
// הכתובת הרגילה מחזירה CORS תקין, ומקבלת את ההודעה כ-base64url בשדה raw.

import { googleFetch } from './auth';
import { buildMimeMessage, toBase64Url, type MailInput } from '../lib/mime';

const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

// Gmail לא מקבל קבצים מצורפים מעל 25MB
const MAX_ATTACHMENT = 25 * 1024 * 1024;

export async function sendMail(input: MailInput): Promise<void> {
  if (input.attachment.blob.size > MAX_ATTACHMENT) {
    throw new Error('הקובץ גדול מ-25MB, ו-Gmail לא מקבל קובץ מצורף בגודל כזה. אפשר לשתף אותו ידנית.');
  }
  const mime = await buildMimeMessage(input);
  await googleFetch(SEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: toBase64Url(mime) }),
  });
}
