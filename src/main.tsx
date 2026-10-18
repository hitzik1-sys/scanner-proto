import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './i18n';
import './styles.css';
import App from './App';

// מתקין את ה-service worker: האפליקציה ניתנת להתקנה למסך הבית ועובדת גם בלי אינטרנט.
// עדכון חדש נטען אוטומטית בפתיחה הבאה.
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
