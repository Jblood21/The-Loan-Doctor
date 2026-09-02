import { useEffect, useState } from 'react';

// The (non-standard, Chromium-only) event fired when the app is installable.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** True when the app is already running as an installed standalone window. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari's legacy flag
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Exposes the browser's "install this app" capability.
 * - `installed`: already running as an installed app.
 * - `canInstall`: the browser offered an install prompt we can trigger (Chrome/Edge/Brave).
 * - `promptInstall()`: shows the native install dialog; resolves with the outcome.
 * Browsers without the prompt (Safari, Firefox) return `canInstall: false` — the UI
 * falls back to per-browser instructions.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // keep the event so we can trigger it from our own button
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferred) return 'unavailable';
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'accepted') setInstalled(true);
    return outcome;
  };

  return { canInstall: !!deferred, installed, promptInstall };
}
