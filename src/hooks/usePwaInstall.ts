import { useState, useEffect } from 'react';

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(
    typeof window !== 'undefined' ? (window as any).deferredPwaPrompt || null : null
  );
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [showIosModal, setShowIosModal] = useState<boolean>(false);

  const ua = typeof window !== 'undefined' ? window.navigator.userAgent.toLowerCase() : '';
  const isIos = /iphone|ipad|ipod/.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/.test(ua);
  const isWindows = /windows/.test(ua);

  const platformLabel = isAndroid
    ? 'Install MVP ESPORTS'
    : isIos
    ? 'Add MVP ESPORTS to Home Screen'
    : isWindows
    ? 'Install MVP ESPORTS App'
    : 'Install MVP ESPORTS App';

  useEffect(() => {
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as any).standalone === true ||
        document.referrer.includes('android-app://');
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();

    const dismissed = sessionStorage.getItem('mvp_pwa_dismissed') === 'true';
    setIsDismissed(dismissed);

    // Pick up early captured prompt if available
    if ((window as any).deferredPwaPrompt) {
      setDeferredPrompt((window as any).deferredPwaPrompt);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).deferredPwaPrompt = e;
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
      (window as any).deferredPwaPrompt = null;
      setShowIosModal(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = async () => {
    // 1. If on iOS (Safari), show step-by-step Add to Home Screen instructions
    if (isIos) {
      setShowIosModal(true);
      return;
    }

    // 2. On Android/Chrome/Edge/Desktop: Use native browser prompt directly
    const promptEvent = deferredPrompt || (window as any).deferredPwaPrompt;
    if (promptEvent && typeof promptEvent.prompt === 'function') {
      try {
        await promptEvent.prompt();
        const choiceResult = await promptEvent.userChoice;
        if (choiceResult && choiceResult.outcome === 'accepted') {
          setIsStandalone(true);
        }
        setDeferredPrompt(null);
        (window as any).deferredPwaPrompt = null;
        setShowIosModal(false);
      } catch (err) {
        console.warn('Native PWA install prompt error:', err);
      }
      return;
    }

    // 3. Only show fallback instruction if native prompt is not available
    setShowIosModal(true);
  };

  const dismissPrompt = () => {
    setIsDismissed(true);
    sessionStorage.setItem('mvp_pwa_dismissed', 'true');
  };

  return {
    isStandalone,
    isDismissed,
    canInstall: !isStandalone,
    platformLabel,
    isIos,
    isAndroid,
    isWindows,
    showIosModal,
    setShowIosModal,
    triggerInstall,
    dismissPrompt
  };
}

