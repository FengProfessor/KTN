import type shakaNamespace from 'shaka-player';

export type ShakaStatic = typeof shakaNamespace;

const SHAKA_LOCAL_VENDOR_URL = '/vendor/shaka-player.compiled-es2021.js';
const SHAKA_CDN_PRIMARY_URL =
  'https://cdn.jsdelivr.net/npm/shaka-player@5.3.5/dist/shaka-player.compiled-es2021.js';
const SHAKA_CDN_FALLBACK_URL =
  'https://unpkg.com/shaka-player@5.3.5/dist/shaka-player.compiled-es2021.js';
const SHAKA_ES2021_SRI =
  'sha384-zUMy/d2506u1NDFzFJ979I+aO5vHrSA7JFe6X89G4NOH3eL1Llsk4VLwJvjcHkq8';

let shakaLoadPromise: Promise<ShakaStatic> | null = null;
let polyfillsInstalled = false;

function getWindowShaka(): ShakaStatic | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as { shaka?: ShakaStatic }).shaka;
  if (candidate && typeof candidate.Player === 'function') {
    return candidate;
  }
  return null;
}

function loadScript(src: string, integrity?: string): Promise<ShakaStatic> {
  return new Promise<ShakaStatic>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Shaka Player requires a browser DOM'));
      return;
    }
    const existing = getWindowShaka();
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    if (integrity) {
      script.crossOrigin = 'anonymous';
      script.integrity = integrity;
    }
    script.onload = () => {
      const loaded = getWindowShaka();
      if (loaded) {
        resolve(loaded);
      } else {
        reject(new Error(`window.shaka unavailable after loading ${src}`));
      }
    };
    script.onerror = () => {
      reject(new Error(`Failed to load Shaka Player script from ${src}`));
    };
    document.head.appendChild(script);
  });
}

function isLocalhostHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

export async function loadShakaPlayer(): Promise<ShakaStatic> {
  const existing = getWindowShaka();
  if (existing) {
    if (!polyfillsInstalled) {
      existing.polyfill?.installAll?.();
      polyfillsInstalled = true;
    }
    return existing;
  }

  if (shakaLoadPromise) {
    return shakaLoadPromise;
  }

  shakaLoadPromise = (async () => {
    const candidates: Array<{ src: string; integrity?: string }> = isLocalhostHost()
      ? [
          { src: SHAKA_LOCAL_VENDOR_URL },
          { src: SHAKA_CDN_PRIMARY_URL, integrity: SHAKA_ES2021_SRI },
          { src: SHAKA_CDN_FALLBACK_URL, integrity: SHAKA_ES2021_SRI },
        ]
      : [
          { src: SHAKA_CDN_PRIMARY_URL, integrity: SHAKA_ES2021_SRI },
          { src: SHAKA_CDN_FALLBACK_URL, integrity: SHAKA_ES2021_SRI },
        ];

    let lastErr: unknown = null;
    for (const item of candidates) {
      try {
        const shaka = await loadScript(item.src, item.integrity);
        if (!polyfillsInstalled) {
          shaka.polyfill?.installAll?.();
          polyfillsInstalled = true;
        }
        return shaka;
      } catch (err) {
        lastErr = err;
      }
    }
    shakaLoadPromise = null;
    throw lastErr instanceof Error
      ? lastErr
      : new Error('Không tải được trình phát Shaka DRM.');
  })();

  return shakaLoadPromise;
}

export function resetShakaLoaderCacheForTest(): void {
  shakaLoadPromise = null;
  polyfillsInstalled = false;
}
