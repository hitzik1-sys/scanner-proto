export interface Point {
  x: number;
  y: number;
}

/** ארבע פינות: שמאל-עליון, ימין-עליון, ימין-תחתון, שמאל-תחתון */
export type Quad = [Point, Point, Point, Point];

/**
 * מסדר 4 נקודות לפי זווית סביב המרכז, החל מהשמאלית-העליונה ועם כיוון השעון.
 * עובד גם כשהדף מסובב בזווית.
 */
export function orderPoints(pts: Point[]): Quad {
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const sorted = [...pts].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  let start = 0;
  sorted.forEach((p, i) => {
    if (p.x + p.y < sorted[start].x + sorted[start].y) start = i;
  });
  return [0, 1, 2, 3].map((i) => ({ ...sorted[(start + i) % 4] })) as Quad;
}

/** מלבן התמונה כולה, עם שוליים פנימיים כאחוז מהגודל */
export function fullQuad(w: number, h: number, inset = 0): Quad {
  const dx = w * inset;
  const dy = h * inset;
  return [
    { x: dx, y: dy },
    { x: w - dx, y: dy },
    { x: w - dx, y: h - dy },
    { x: dx, y: h - dy },
  ];
}

/** התזוזה הגדולה ביותר של פינה בין שני זיהויים */
export function maxShift(a: Quad, b: Quad): number {
  return Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));
}

export function copyQuad(q: Quad): Quad {
  return q.map((p) => ({ ...p })) as Quad;
}
