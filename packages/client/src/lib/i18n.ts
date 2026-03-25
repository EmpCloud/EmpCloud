import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '@/locales/en.json';
import hi from '@/locales/hi.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';
import de from '@/locales/de.json';
import ar from '@/locales/ar.json';
import pt from '@/locales/pt.json';
import ja from '@/locales/ja.json';
import zh from '@/locales/zh.json';

const RTL_LANGUAGES = ['ar'];

const resources = {
  en: { translation: en },
  hi: { translation: hi },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  ar: { translation: ar },
  pt: { translation: pt },
  ja: { translation: ja },
  zh: { translation: zh },
};

const savedLanguage = localStorage.getItem('empcloud-language') || 'en';

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes
    },
  });

// Apply RTL direction on init and language change
function applyDirection(lng: string) {
  const dir = RTL_LANGUAGES.includes(lng) ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', lng);
}

applyDirection(savedLanguage);

i18n.on('languageChanged', (lng: string) => {
  localStorage.setItem('empcloud-language', lng);
  applyDirection(lng);
});

export default i18n;
