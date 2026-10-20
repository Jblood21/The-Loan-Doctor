import { useSyncExternalStore } from 'react';

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

// The browser fires `beforeinstallprompt` once per page load, usually before any component
// that wants it has mounted. Capture it here at module level so every consumer (sidebar,
// agent header, Settings) sees the same event no matter when it mounts.
let deferred: BeforeInstallPromptEvent | null = null;
let installed = isStandalone();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep the event so our own button can trigger it
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/**
 * Exposes the browser's "install this app" capability.
 * - `installed`: already running as an installed app.
 * - `canInstall`: the browser offered an install prompt we can trigger (Chrome/Edge/Brave).
 * - `promptInstall()`: shows the native install dialog; resolves with the outcome.
 * Browsers without the prompt (Safari, Firefox) return `canInstall: false` — the UI
 * falls back to per-browser instructions.
 */
export function useInstallPrompt() {
  const event = useSyncExternalStore(subscribe, () => deferred);
  const isInstalled = useSyncExternalStore(subscribe, () => installed);

  const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferred) return 'unavailable';
    const e = deferred;
    await e.prompt();
    const { outcome } = await e.userChoice;
    deferred = null; // a prompt event can only be used once
    if (outcome === 'accepted') installed = true;
    notify();
    return outcome;
  };

  return { canInstall: !!event, installed: isInstalled, promptInstall };
}
