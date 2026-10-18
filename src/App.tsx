import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadOpenCV, type Filter } from './lib/cv';
import { buildPdf } from './lib/pdf';
import { localDate, moveItem, parseLocalDate, pdfFileName } from './lib/files';
import { pdfQualityParams, type PdfQuality } from './lib/settings';
import { useSettings } from './SettingsContext';
import type { EditState, Page, PdfResult, Screen } from './types';
import Home from './screens/Home';
import Camera from './screens/Camera';
import EditPage from './screens/EditPage';
import Review from './screens/Review';
import SaveSend from './screens/SaveSend';
import SettingsScreen from './screens/SettingsScreen';
import Search from './screens/Search';

let nextId = 1;
const newPage = (blob: Blob): Page => ({
  id: nextId++,
  blob,
  quad: null,
  filter: null,
  rotation: 0,
  out: null,
  thumb: null,
});

export type CvStatus = 'loading' | 'ready' | 'failed';

export default function App() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [screen, setScreen] = useState<Screen>('home');
  // תאריך המסמך (בשם הקובץ ובאינדקס) ואיכות ה-PDF. ניתנים לשינוי ברמה המתקדמת
  const [docDate, setDocDate] = useState(localDate);
  // null = לפי ההגדרות. שינוי במסמך הנוכחי לא משנה את ברירת המחדל
  const [qualityOverride, setQualityOverride] = useState<PdfQuality | null>(null);
  const quality = qualityOverride ?? settings.pdfQuality;
  const [pages, setPages] = useState<Page[]>([]);
  const [edit, setEdit] = useState<EditState>({ index: 0, seqEnd: 0, single: false });
  const [lastFilter, setLastFilter] = useState<Filter>('gray');
  const [title, setTitle] = useState('');
  const [pdf, setPdf] = useState<PdfResult | null>(null);
  const [cvStatus, setCvStatus] = useState<CvStatus>('loading');
  // מאיזה עמוד התחיל הצילום הנוכחי
  const camStart = useRef(0);
  // לאן חוזרים מההגדרות
  const beforeSettings = useRef<Screen>('home');

  const openSettings = () => {
    beforeSettings.current = screen;
    setScreen('settings');
    window.scrollTo(0, 0);
  };

  const startOpenCV = () => {
    setCvStatus('loading');
    loadOpenCV().then(
      () => setCvStatus('ready'),
      () => setCvStatus('failed'),
    );
  };
  // טוענים מיד בפתיחה, כדי שיהיה מוכן עד שמסיימים לצלם
  useEffect(startOpenCV, []);

  const reset = () => {
    setPages([]);
    setTitle('');
    setPdf(null);
    setDocDate(localDate());
    setQualityOverride(null);
    setScreen('home');
  };

  /** מוסיף עמודים לסוף המסמך ומתחיל לערוך אותם, אחד אחרי השני */
  const addAndEdit = (blobs: Blob[]) => {
    if (!blobs.length) return;
    const from = pages.length;
    const all = [...pages, ...blobs.map(newPage)];
    setPages(all);
    setEdit({ index: from, seqEnd: all.length, single: false });
    setScreen('edit');
  };

  const openCamera = () => {
    camStart.current = pages.length;
    setScreen('camera');
  };

  const onShot = (blob: Blob) => setPages((ps) => [...ps, newPage(blob)]);

  const onCameraDone = () => {
    const from = camStart.current;
    if (pages.length > from) {
      setEdit({ index: from, seqEnd: pages.length, single: false });
      setScreen('edit');
    } else {
      setScreen(pages.length ? 'review' : 'home');
    }
  };

  const onSavePage = (page: Page) => {
    setPages((ps) => ps.map((p) => (p.id === page.id ? page : p)));
    if (page.filter) setLastFilter(page.filter);
    setPdf(null);
    if (edit.single || edit.index + 1 >= edit.seqEnd) setScreen('review');
    else setEdit({ ...edit, index: edit.index + 1 });
  };

  const onDeletePage = () => {
    const rest = pages.filter((_, i) => i !== edit.index);
    setPages(rest);
    setPdf(null);
    if (!rest.length) {
      reset();
      return;
    }
    if (edit.single) {
      setScreen('review');
      return;
    }
    const seqEnd = edit.seqEnd - 1;
    if (edit.index >= seqEnd) setScreen('review');
    else setEdit({ ...edit, seqEnd });
  };

  const editSingle = (index: number) => {
    setEdit({ index, seqEnd: index + 1, single: true });
    setScreen('edit');
  };

  const createPdf = async () => {
    const canvases = pages.map((p) => p.out).filter((c): c is HTMLCanvasElement => !!c);
    const blob = await buildPdf(canvases, pdfQualityParams(quality));
    setPdf({ blob, name: pdfFileName(title, parseLocalDate(docDate)), pages: canvases.length });
    setScreen('done');
  };

  const movePage = (from: number, to: number) => {
    setPages((ps) => moveItem(ps, from, to));
    setPdf(null);
  };

  const page = pages[edit.index];

  return (
    <div className={`app screen-${screen}`}>
      {screen !== 'camera' && (
        <header className="top">
          {screen === 'search' ? (
            <button className="icon-button back" onClick={() => setScreen('home')} aria-label={t('search.back')}>
              →
            </button>
          ) : null}
          <h1>{screen === 'search' ? t('search.title') : t('app.title')}</h1>
          {screen !== 'settings' && screen !== 'edit' && (
            <button className="icon-button" onClick={openSettings} aria-label={t('settings.title')}>
              ⚙
            </button>
          )}
        </header>
      )}

      {screen === 'search' && <Search onSettings={openSettings} />}

      {screen === 'settings' && <SettingsScreen onBack={() => setScreen(beforeSettings.current)} />}

      {screen === 'home' && (
        <Home
          cvStatus={cvStatus}
          onRetry={startOpenCV}
          onCamera={openCamera}
          onFiles={addAndEdit}
          onSearch={() => setScreen('search')}
        />
      )}

      {screen === 'camera' && (
        <Camera
          shotCount={pages.length - camStart.current}
          onShot={onShot}
          onDone={onCameraDone}
          advanced={settings.advanced}
          startAuto={settings.advanced && settings.cameraStart === 'auto'}
        />
      )}

      {screen === 'edit' && page && (
        <EditPage
          key={page.id}
          page={page}
          index={edit.index}
          total={pages.length}
          single={edit.single}
          isLast={edit.index + 1 >= edit.seqEnd}
          defaultFilter={lastFilter}
          onSave={onSavePage}
          onDelete={onDeletePage}
        />
      )}

      {screen === 'review' && (
        <Review
          pages={pages}
          title={title}
          onTitle={setTitle}
          onEdit={editSingle}
          onCreate={createPdf}
          onMoreCamera={openCamera}
          onMoreFiles={addAndEdit}
          onDiscard={reset}
          advanced={settings.advanced}
          docDate={docDate}
          onDocDate={(d) => {
            setDocDate(d);
            setPdf(null);
          }}
          quality={quality}
          onQuality={(q) => {
            setQualityOverride(q);
            setPdf(null);
          }}
          onMove={movePage}
        />
      )}

      {screen === 'done' && pdf && (
        <SaveSend
          pdf={pdf}
          pages={pages}
          title={title}
          docDate={docDate}
          onEdit={() => setScreen('review')}
          onNew={reset}
          onSettings={openSettings}
        />
      )}
    </div>
  );
}
