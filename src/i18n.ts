import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import he from './locales/he.json';

// עברית כברירת מחדל. שפה נוספת = קובץ נוסף בתיקייה locales ושורה ב-resources.
void i18n.use(initReactI18next).init({
  resources: { he: { translation: he } },
  lng: 'he',
  fallbackLng: 'he',
  interpolation: { escapeValue: false }, // React כבר מגן מפני הזרקת HTML
});

export default i18n;
