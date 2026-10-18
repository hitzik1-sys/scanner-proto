// שליחת מייל עם קובץ מצורף דרך ה-Gmail של המשתמש (הרשאת gmail.send: שליחה בלבד).
// המייל נשלח בשם המשתמש ומופיע אצלו בדואר היוצא.

import { googleFetch } from './auth';
import { buildMimeMessage, type MailInput } from '../lib/mime';

// נקודת ההעלאה מקבלת הודעות עד 35MB, הרבה מעבר ל-PDF של סריקה
const SEND_URL = 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media';

export async function sendMail(input: MailInput): Promise<void> {
  const mime = await buildMimeMessage(input);
  await googleFetch(SEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'message/rfc822' },
    body: mime,
  });
}
