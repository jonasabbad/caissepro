import { ref } from 'vue';

/**
 * CaissePro Scanner as an installable app (PWA). While the scanner page is open it links the scanner manifest and
 * the iPhone home-screen tags, registers the scanner service worker (scope /scanner only), and offers to install:
 * Android / desktop Chrome through the browser's install prompt, iPhone through Share → Add to Home Screen.
 * The rest of CaissePro keeps no manifest, so installing from another page does not make a scanner app.
 */
const DISMISS_KEY = 'caissepro_scanner_install_dismissed';

// The browser fires this once, possibly before the scanner page is loaded (see main.js).
let deferredPrompt = null;
const canInstall = ref(false);
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    canInstall.value = !dismissed() && !standalone();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    canInstall.value = false;
  });
}

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function dismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

const HEAD = [
  ['link', { rel: 'manifest', href: '/scanner.webmanifest' }],
  ['link', { rel: 'apple-touch-icon', href: '/scanner-apple-touch-icon.png' }],
  ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
  ['meta', { name: 'mobile-web-app-capable', content: 'yes' }],
  ['meta', { name: 'apple-mobile-web-app-title', content: 'CaissePro Scanner' }],
  ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }],
];

export function useScannerApp() {
  const iosHint = ref(false);
  let added = [];
  let themeBefore = null;

  function attach() {
    added = HEAD.map(([tag, attrs]) => {
      const el = document.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      el.dataset.scannerApp = '';
      document.head.appendChild(el);
      return el;
    });
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) (themeBefore = theme.content), (theme.content = '#2554eb');
    document.title = 'CaissePro Scanner';
    navigator.serviceWorker?.register('/scanner-sw.js', { scope: '/scanner' }).catch(() => undefined);
    canInstall.value = !!deferredPrompt && !dismissed() && !standalone();
    iosHint.value = isIos() && !standalone() && !dismissed();
  }
  function detach() {
    added.forEach((el) => el.remove());
    added = [];
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme && themeBefore) theme.content = themeBefore;
  }
  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    canInstall.value = false;
    return choice?.outcome;
  }
  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* shown again next time */
    }
    canInstall.value = false;
    iosHint.value = false;
  }
  return { canInstall, iosHint, attach, detach, install, dismiss };
}
