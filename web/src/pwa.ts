// Service worker + the browser's install prompt. The service worker is only registered in a secure context: https on
// the phone (once the Pilotage certificate is installed) or localhost on the PC. Plain-http phones skip it.
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/** Chrome's "Install app" prompt when it's available (secure context, installable, not installed yet). */
export const installPrompt = () => deferred;
export function onInstallPromptChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
/** Opened from the home-screen icon (installed app), not a browser tab. */
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

if (window.isSecureContext && 'serviceWorker' in navigator) {
  const register = () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

// Not preventDefault(): Chrome may still show its own install banner; Settings › Phone offers the same prompt.
window.addEventListener('beforeinstallprompt', (e) => {
  deferred = e as InstallPromptEvent;
  notify();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  notify();
});
