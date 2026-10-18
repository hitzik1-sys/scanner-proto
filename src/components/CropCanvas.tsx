import { useEffect, useRef, type MutableRefObject } from 'react';
import type { Point, Quad } from '../lib/geometry';

interface Props {
  source: HTMLCanvasElement;
  /** הפינות בקואורדינטות התמונה. הרכיב משנה אותן בגרירה */
  quadRef: MutableRefObject<Quad>;
  /** מספר שמשתנה כשההורה מחליף את הפינות (זיהוי מחדש, כל התמונה) */
  version: number;
}

const GRAB_RADIUS = 40; // רדיוס תפיסה של פינה, בפיקסלי מסך

/** התמונה עם 4 פינות לגרירה. בזמן גרירה מופיעה זכוכית מגדלת בצד הנגדי לאצבע */
export default function CropCanvas({ source, quadRef, version }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<number | null>(null);
  const viewRef = useRef({ k: 1, dpr: 1 });

  const draw = () => {
    const c = canvasRef.current;
    const wrap = wrapRef.current;
    if (!c || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const maxW = wrap.clientWidth;
    const maxH = window.innerHeight * 0.58;
    const s = Math.min(maxW / source.width, maxH / source.height);
    const cssW = Math.round(source.width * s);
    const cssH = Math.round(source.height * s);
    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;
    c.width = cssW * dpr;
    c.height = cssH * dpr;
    const k = s * dpr;
    viewRef.current = { k, dpr };
    const q = quadRef.current;
    const x = c.getContext('2d')!;
    x.drawImage(source, 0, 0, c.width, c.height);

    const path = () => q.forEach((p, i) => (i ? x.lineTo(p.x * k, p.y * k) : x.moveTo(p.x * k, p.y * k)));
    // החשכה מחוץ לדף
    x.beginPath();
    x.rect(0, 0, c.width, c.height);
    path();
    x.closePath();
    x.fillStyle = 'rgba(0,0,0,.45)';
    x.fill('evenodd');

    x.beginPath();
    path();
    x.closePath();
    x.lineWidth = 2.5 * dpr;
    x.strokeStyle = '#5b9bff';
    x.stroke();

    q.forEach((p, i) => {
      x.beginPath();
      x.arc(p.x * k, p.y * k, (i === dragRef.current ? 16 : 12) * dpr, 0, Math.PI * 2);
      x.fillStyle = 'rgba(255,255,255,.85)';
      x.fill();
      x.lineWidth = 3 * dpr;
      x.strokeStyle = '#1f5fbf';
      x.stroke();
    });

    if (dragRef.current !== null) drawLoupe(x, q[dragRef.current]);
  };

  const drawLoupe = (x: CanvasRenderingContext2D, p: Point) => {
    const c = x.canvas;
    const { k, dpr } = viewRef.current;
    const r = 60 * dpr;
    const zoom = 2.5;
    const onLeft = p.x * k > c.width / 2;
    const cx = onLeft ? r + 10 * dpr : c.width - r - 10 * dpr;
    const cy = r + 10 * dpr;
    const srcR = r / (k * zoom);
    x.save();
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.clip();
    x.fillStyle = '#000';
    x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    x.drawImage(source, p.x - srcR, p.y - srcR, srcR * 2, srcR * 2, cx - r, cy - r, 2 * r, 2 * r);
    x.strokeStyle = '#ff3b30';
    x.lineWidth = 1.5 * dpr;
    x.beginPath();
    x.moveTo(cx - 12 * dpr, cy);
    x.lineTo(cx + 12 * dpr, cy);
    x.moveTo(cx, cy - 12 * dpr);
    x.lineTo(cx, cy + 12 * dpr);
    x.stroke();
    x.restore();
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.lineWidth = 3 * dpr;
    x.strokeStyle = '#fff';
    x.stroke();
  };

  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    draw();
  });

  useEffect(() => {
    const ro = new ResizeObserver(() => drawRef.current());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const toSource = (e: React.PointerEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.min(source.width, Math.max(0, ((e.clientX - r.left) / r.width) * source.width)),
      y: Math.min(source.height, Math.max(0, ((e.clientY - r.top) / r.height) * source.height)),
    };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toSource(e);
    const cssScale = viewRef.current.k / viewRef.current.dpr;
    let best: number | null = null;
    let bestD = GRAB_RADIUS;
    quadRef.current.forEach((q, i) => {
      const d = Math.hypot(q.x - p.x, q.y - p.y) * cssScale;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best === null) return;
    dragRef.current = best;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    draw();
  };

  const onMove = (e: React.PointerEvent) => {
    if (dragRef.current === null) return;
    quadRef.current[dragRef.current] = toSource(e);
    draw();
  };

  const onUp = () => {
    if (dragRef.current === null) return;
    dragRef.current = null;
    draw();
  };

  return (
    <div className="crop-wrap" ref={wrapRef} data-version={version}>
      <canvas
        ref={canvasRef}
        className="crop-canvas"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
    </div>
  );
}
