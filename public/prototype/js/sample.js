// מסמכי דוגמה לבדיקה בלי מצלמה. כל הפרטים בדויים.

const FONT = 'Arial, "Noto Sans Hebrew", "Segoe UI", sans-serif';

const LINES = [
  'שם הלקוח: ישראל ישראלי',
  'כתובת: רחוב הרצל 12, תל אביב',
  'מספר חשבון: 1234567',
  'תקופת החיוב: 01/09/2026 עד 30/09/2026',
  'צריכה בתקופה: 412 קוט"ש',
  'סכום לתשלום: 345.20 ש"ח',
  'מועד אחרון לתשלום: 25/10/2026',
];

const PARAGRAPH = [
  'לתשומת לבך, החשבון כולל חיוב קבוע וחיוב לפי צריכה.',
  'ניתן לשלם בהוראת קבע, בכרטיס אשראי או בסניפי הדואר.',
  'לבירורים יש לפנות למוקד שירות הלקוחות בימים א׳ עד ה׳.',
];

export function makeSamplePage() {
  const c = document.createElement('canvas');
  c.width = 1240; c.height = 1754;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#111';
  x.direction = 'rtl';
  x.textAlign = 'right';

  x.font = `bold 60px ${FONT}`;
  x.fillText('חשבון תקופתי – מסמך לבדיקה', 1140, 180);
  x.fillRect(100, 220, 1040, 4);

  x.font = `40px ${FONT}`;
  let y = 320;
  for (const line of LINES) { x.fillText(line, 1140, y); y += 76; }

  x.strokeStyle = '#111';
  x.lineWidth = 3;
  x.strokeRect(100, y, 1040, 260);
  x.font = `bold 44px ${FONT}`;
  x.fillText('סה"כ לתשלום: 345.20 ש"ח', 1100, y + 100);
  x.font = `34px ${FONT}`;
  x.fillText('כולל מע"מ כחוק', 1100, y + 170);
  y += 360;

  x.font = `34px ${FONT}`;
  for (const line of PARAGRAPH) { x.fillText(line, 1140, y); y += 60; }
  return c;
}

// "צילום" של הדף: מסובב, על רקע כהה, עם צל בצד אחד
export function makeSamplePhoto() {
  const page = makeSamplePage();
  const c = document.createElement('canvas');
  c.width = 1600; c.height = 2000;
  const x = c.getContext('2d');

  const g = x.createLinearGradient(0, 0, 1600, 2000);
  g.addColorStop(0, '#5b4636');
  g.addColorStop(1, '#3a2c22');
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 4000; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
    x.fillRect(Math.random() * 1600, Math.random() * 2000, 2 + Math.random() * 30, 1 + Math.random() * 2);
  }

  x.save();
  x.translate(800, 1000);
  x.rotate(-0.12);
  x.shadowColor = 'rgba(0,0,0,.5)';
  x.shadowBlur = 40;
  const s = 0.95;
  x.drawImage(page, -620 * s, -877 * s, 1240 * s, 1754 * s);
  x.restore();

  const shade = x.createLinearGradient(0, 0, 1600, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.28)');
  shade.addColorStop(0.6, 'rgba(0,0,0,0)');
  x.fillStyle = shade;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}
