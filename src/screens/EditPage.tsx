import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CropCanvas from '../components/CropCanvas';
import { detectOrFull, enhance, loadOpenCV, rotate90, warpQuad, type Filter } from '../lib/cv';
import { copyQuad, fullQuad, type Quad } from '../lib/geometry';
import { decodeImage, makeThumb } from '../lib/files';
import type { Page } from '../types';

interface Props {
  page: Page;
  index: number;
  total: number;
  single: boolean;
  isLast: boolean;
  defaultFilter: Filter;
  onSave: (page: Page) => void;
  onDelete: () => void;
}

const FILTERS: Filter[] = ['gray', 'color', 'bw'];

/** עריכת עמוד: חיתוך (פינות לגרירה), ואז יישור, פילטר וסיבוב */
export default function EditPage({ page, index, total, single, isLast, defaultFilter, onSave, onDelete }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'crop' | 'result'>('crop');
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quadRef = useRef<Quad>(fullQuad(1, 1));
  const [quadVersion, setQuadVersion] = useState(0);
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);
  const [filter, setFilter] = useState<Filter>(page.filter ?? defaultFilter);
  const [rotation, setRotation] = useState(page.rotation);
  const [out, setOut] = useState<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // פענוח התמונה וזיהוי הפינות (או הפינות שנבחרו קודם, בעריכה חוזרת)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadOpenCV();
        const canvas = await decodeImage(page.blob);
        if (cancelled) return;
        if (page.quad) {
          quadRef.current = copyQuad(page.quad);
        } else {
          const r = detectOrFull(canvas);
          quadRef.current = r.quad;
          setNotFound(!r.found);
        }
        setSource(canvas);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page]);

  // פילטר וסיבוב על התמונה המיושרת
  useEffect(() => {
    if (!base) return;
    setOut(rotate90(enhance(base, filter), rotation));
  }, [base, filter, rotation]);

  useEffect(() => {
    if (out && previewRef.current) previewRef.current.replaceChildren(out);
  }, [out, step]);

  const redetect = () => {
    if (!source) return;
    const r = detectOrFull(source);
    quadRef.current = r.quad;
    setNotFound(!r.found);
    setQuadVersion((v) => v + 1);
  };

  const useFull = () => {
    if (!source) return;
    quadRef.current = fullQuad(source.width, source.height);
    setNotFound(false);
    setQuadVersion((v) => v + 1);
  };

  const applyCrop = () => {
    if (!source) return;
    setBase(warpQuad(source, quadRef.current));
    setStep('result');
  };

  const save = () => {
    if (!out) return;
    onSave({ ...page, quad: copyQuad(quadRef.current), filter, rotation, out, thumb: makeThumb(out) });
  };

  const remove = () => {
    if (confirm(t('edit.confirmDelete', { n: index + 1 }))) onDelete();
  };

  const label = single
    ? t('edit.editPage', { n: index + 1, total })
    : t('edit.pageOf', { n: index + 1, total });
  const nextLabel = single ? t('edit.save') : isLast ? t('edit.finish') : t('edit.next');

  if (error) {
    return (
      <main className="page">
        <p className="status error">{t('error.generic', { message: error })}</p>
        <div className="buttons">
          <button onClick={remove}>{t('edit.delete')}</button>
        </div>
      </main>
    );
  }

  return (
    <main className="page edit">
      <p className="page-of">{label}</p>

      {step === 'crop' && (
        <>
          <p className={notFound ? 'hint warn' : 'hint'}>{notFound ? t('edit.notFound') : t('edit.cropHint')}</p>
          {source ? (
            <CropCanvas source={source} quadRef={quadRef} version={quadVersion} />
          ) : (
            <p className="status">{t('edit.loading')}</p>
          )}
          <div className="buttons">
            <button className="primary" onClick={applyCrop} disabled={!source}>
              {t('edit.ok')}
            </button>
            <button onClick={redetect} disabled={!source}>
              {t('edit.redetect')}
            </button>
            <button onClick={useFull} disabled={!source}>
              {t('edit.full')}
            </button>
            <button onClick={remove}>{t('edit.delete')}</button>
          </div>
        </>
      )}

      {step === 'result' && (
        <>
          <div className="row">
            <div className="segmented" role="radiogroup" aria-label={t('edit.filter')}>
              {FILTERS.map((f) => (
                <button
                  key={f}
                  role="radio"
                  aria-checked={filter === f}
                  className={filter === f ? 'on' : ''}
                  onClick={() => setFilter(f)}
                >
                  {t(`filter.${f}`)}
                </button>
              ))}
            </div>
            <button onClick={() => setRotation((r) => r + 1)}>{t('edit.rotate')} ↻</button>
          </div>
          <div className="preview" ref={previewRef} />
          <div className="buttons">
            <button className="primary" onClick={save} disabled={!out}>
              {nextLabel}
            </button>
            <button onClick={() => setStep('crop')}>{t('edit.backToCrop')}</button>
            <button onClick={remove}>{t('edit.delete')}</button>
          </div>
        </>
      )}
    </main>
  );
}
