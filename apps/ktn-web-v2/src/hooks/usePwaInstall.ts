import { useCallback, useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

export type PwaPlatformHint = 'windows' | 'macos' | 'mobile' | 'desktop';

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const standaloneMedia =
      typeof window.matchMedia === 'function' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: window-controls-overlay)').matches);
    const iosStandalone = Boolean((window.navigator as { standalone?: boolean } | undefined)?.standalone);
    return Boolean(standaloneMedia || iosStandalone);
  } catch {
    return false;
  }
}

function detectPlatformHint(): PwaPlatformHint {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = String(navigator.userAgent || '').toLowerCase();
  if (/iphone|ipad|ipod|android/.test(ua)) return 'mobile';
  if (/mac os x|macintosh/.test(ua)) return 'macos';
  if (/windows/.test(ua)) return 'windows';
  return 'desktop';
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => detectStandalone());
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
  const [installing, setInstalling] = useState<boolean>(false);
  const platformHint = detectPlatformHint();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsInstalled(detectStandalone());

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowGuideModal(false);
    };

    const mql =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;
    const handleDisplayModeChange = () => {
      setIsInstalled(detectStandalone());
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    if (mql && typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handleDisplayModeChange);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (mql && typeof mql.removeEventListener === 'function') {
        mql.removeEventListener('change', handleDisplayModeChange);
      }
    };
  }, []);

  const triggerInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'guide'> => {
    if (isInstalled) return 'accepted';
    if (!deferredPrompt) {
      setShowGuideModal(true);
      return 'guide';
    }
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice?.outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        setShowGuideModal(false);
        return 'accepted';
      }
      setDeferredPrompt(null);
      setShowGuideModal(true);
      return 'dismissed';
    } catch {
      setShowGuideModal(true);
      return 'guide';
    } finally {
      setInstalling(false);
    }
  }, [deferredPrompt, isInstalled]);

  return {
    canNativeInstall: Boolean(deferredPrompt),
    isInstalled,
    installing,
    platformHint,
    showGuideModal,
    setShowGuideModal,
    triggerInstall
  };
}
