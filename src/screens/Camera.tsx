import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { detectQuad } from '../lib/cv';
import { maxShift, type Quad } from '../lib/geometry';
import { canvasToBlob } from '../lib/files';

interface Props {
  /** כמה עמודים צולמו מאז שהמצלמה נפתחה */
  shotCount: number;
  onShot: (blob: Blob) => void;
  onDone: () => void;
  /** לפתוח במצב אוטומטי (הגדרה ברמה המתקדמת) */
  startAuto?: boolean;
  /** רמה מתקדמת: כפתור פלאש, כשהטלפון תומך */
  advanced?: boolean;
}

const STABLE_MS = 1500;
const TICK_MS = 150;

/**
 * מסך מצלמה מלא. מצב ידני (ברירת מחדל): לוחצים "צלם".
 * מצב אוטומטי: זיהוי חי של הדף וצילום כשהוא יציב.
 * המצלמה נשארת פתוחה אחרי כל צילום, כדי לצלם את כל העמודים ברצף.
 */
export default function Camera({ shotCount, onShot, onDone, startAuto = false, advanced = false }: Props) {
  const { t } = useTranslation();
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capturingRef = useRef(false);
  const onShotRef = useRef(onShot);
  onShotRef.current = onShot;

  const [error, setError] = useState(false);
  const [auto, setAuto] = useState(startAuto);
  // פלאש: רק בדפדפנים שמאפשרים להדליק אותו (Chrome באנדרואיד כן, אייפון לא)
  const [torchSupported, setTorchSupported] = useState(false);
  const [torch, setTorch] = useState(false);
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const [status, setStatus] = useState('');
  const [flash, setFlash] = useState(0);
  // מצב אוטומטי: אחרי צילום מחכים שהדף יוחלף, כדי לא לצלם אותו פעמיים
  const track = useRef({ lastQuad: null as Quad | null, stableSince: 0, armed: true, shotQuad: null as Quad | null });

  // הווידאו בגודל המקסימלי שנכנס במקום הפנוי, בלי לעוות ובלי לחתוך
  const fitVideo = () => {
    const v = videoRef.current;
    const stage = stageRef.current;
    if (!v || !stage || !v.videoWidth) return;
    const k = Math.min(stage.clientWidth / v.videoWidth, stage.clientHeight / v.videoHeight);
    v.style.width = `${Math.floor(v.videoWidth * k)}px`;
    v.style.height = `${Math.floor(v.videoHeight * k)}px`;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = s;
        const v = videoRef.current!;
        v.srcObject = s;
        await v.play();
        fitVideo();
        const caps = s.getVideoTracks()[0].getCapabilities?.() as { torch?: boolean } | undefined;
        setTorchSupported(!!caps?.torch);
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    // סיבוב הטלפון משנה את המקום הפנוי ואת מידות הווידאו
    const ro = new ResizeObserver(fitVideo);
    if (stageRef.current) ro.observe(stageRef.current);
    const v = videoRef.current;
    v?.addEventListener('resize', fitVideo);

    return () => {
      cancelled = true;
      ro.disconnect();
      v?.removeEventListener('resize', fitVideo);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    };
  }, []);

  const capture = async () => {
    const s = streamRef.current;
    const v = videoRef.current;
    if (capturingRef.current || !s || !v || !v.videoWidth) return;
    capturingRef.current = true;
    try {
      let blob: Blob | null = null;
      try {
        // צילום מלא באיכות המצלמה (גבוהה מהווידאו), כשהדפדפן תומך
        if ('ImageCapture' in window) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          blob = await new (window as any).ImageCapture(s.getVideoTracks()[0]).takePhoto();
        }
      } catch {
        blob = null;
      }
      if (!blob) {
        const c = document.createElement('canvas');
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        c.getContext('2d')!.drawImage(v, 0, 0);
        blob = await canvasToBlob(c, 'image/jpeg', 0.92);
      }
      onShotRef.current(blob);
      const tr = track.current;
      tr.shotQuad = tr.lastQuad;
      tr.armed = !autoRef.current;
      tr.stableSince = 0;
      setFlash((f) => f + 1);
      setStatus(autoRef.current ? t('camera.swap') : t('camera.shotNext'));
    } finally {
      capturingRef.current = false;
    }
  };
  const captureRef = useRef(capture);
  captureRef.current = capture;

  // מצב אוטומטי: זיהוי חי וציור מסגרת סביב הדף
  useEffect(() => {
    const ov = overlayRef.current!;
    ov.getContext('2d')!.clearRect(0, 0, ov.width, ov.height);
    track.current = { lastQuad: null, stableSince: 0, armed: true, shotQuad: null };
    if (!auto) return;

    let timer = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v && v.videoWidth && !capturingRef.current && window.cv?.Mat) {
        const q = detectQuad(v, 480);
        const dpr = window.devicePixelRatio || 1;
        ov.width = v.clientWidth * dpr;
        ov.height = v.clientHeight * dpr;
        const s = ov.width / v.videoWidth;
        const x = ov.getContext('2d')!;
        x.clearRect(0, 0, ov.width, ov.height);

        const diag = Math.hypot(v.videoWidth, v.videoHeight);
        const tr = track.current;
        const stable = !!(q && tr.lastQuad && maxShift(q, tr.lastQuad) < 0.02 * diag);
        if (q) {
          x.beginPath();
          q.forEach((p, i) => (i ? x.lineTo(p.x * s, p.y * s) : x.moveTo(p.x * s, p.y * s)));
          x.closePath();
          x.fillStyle = stable ? 'rgba(46,160,67,.25)' : 'rgba(31,95,191,.2)';
          x.fill();
          x.lineWidth = 3 * dpr;
          x.strokeStyle = stable ? '#2ea043' : '#5b9bff';
          x.stroke();
        }

        // אחרי צילום, לא מצלמים שוב עד שהדף זז או הוחלף
        if (!tr.armed && (!q || !tr.shotQuad || maxShift(q, tr.shotQuad) > 0.15 * diag)) tr.armed = true;
        const now = performance.now();
        if (stable && tr.armed) {
          if (!tr.stableSince) tr.stableSince = now;
        } else tr.stableSince = 0;
        tr.lastQuad = q;

        const left = tr.stableSince ? Math.max(0, STABLE_MS - (now - tr.stableSince)) : null;
        const what = !tr.armed ? t('camera.swap') : q ? (stable ? t('camera.stable') : t('camera.found')) : t('camera.hintAuto');
        setStatus(left !== null ? `${what} · ${t('camera.shotIn', { seconds: (left / 1000).toFixed(1) })}` : what);
        if (tr.stableSince && now - tr.stableSince > STABLE_MS) void captureRef.current();
      } else if (!window.cv?.Mat) {
        setStatus(t('home.loading'));
      }
      timer = window.setTimeout(tick, TICK_MS);
    };
    tick();
    return () => clearTimeout(timer);
  }, [auto, t]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorchSupported(false);
    }
  };

  const toggleAuto = () => {
    setStatus('');
    setAuto((a) => !a);
  };

  const hint = status || (auto ? t('camera.hintAuto') : t('camera.hintManual'));

  return (
    <div className="camera">
      <div className="cam-stage" ref={stageRef}>
        <div className="video-wrap">
          <video ref={videoRef} playsInline muted />
          <canvas ref={overlayRef} />
        </div>
        {flash > 0 && <div key={flash} className="flash" />}
        {error && <p className="cam-error">{t('camera.noAccess')}</p>}
      </div>
      <div className="cam-controls">
        <p className="status" aria-live="polite">
          {shotCount > 0 && `${t('camera.count', { count: shotCount })} · `}
          {hint}
        </p>
        <div className="buttons">
          <button className="primary big capture" onClick={() => void capture()} disabled={error}>
            {t('camera.capture')}
          </button>
          <button onClick={toggleAuto} disabled={error}>
            {auto ? t('camera.manual') : t('camera.auto')}
          </button>
          {advanced && torchSupported && (
            <button onClick={() => void toggleTorch()} aria-pressed={torch} className={torch ? 'on' : ''}>
              {torch ? t('camera.flashOff') : t('camera.flashOn')}
            </button>
          )}
          <button onClick={onDone}>{shotCount > 0 ? t('camera.done', { count: shotCount }) : t('camera.cancel')}</button>
        </div>
      </div>
    </div>
  );
}
