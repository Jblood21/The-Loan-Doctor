import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { applyTheme, getStoredTheme } from './lib/theme';
import { applyHoliday, currentHoliday, isBorrowerFacingPath, readPreviewFromUrl } from './lib/holidayTheme';

// Keep <html> in sync with the saved choice (the index.html inline script covers
// the pre-paint case; this handles 'system' resets and runtime consistency).
applyTheme(getStoredTheme());

// The seasonal look is applied before the first render so the page never flashes the
// normal colors first (borrower-facing pages are left alone).
readPreviewFromUrl();
applyHoliday(isBorrowerFacingPath(window.location.pathname) ? null : currentHoliday());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the service worker so the app is installable as a desktop app.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* installability is a progressive enhancement — ignore failures */
    });
  });
}
