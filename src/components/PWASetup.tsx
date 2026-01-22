/**
 * PWA Setup Component
 * 
 * Registers service worker and handles PWA installation
 * Only active in commercial mode (YouTube)
 */

'use client';

import { useEffect } from 'react';
import { appConfig } from '@/lib/config';

export function PWASetup() {
  useEffect(() => {
    // Allow PWA in development mode (localhost) even if commercial mode is disabled
    const isDev = process.env.NODE_ENV === 'development';
    const isLocalhost = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || 
       window.location.hostname === '127.0.0.1' ||
       window.location.hostname.startsWith('192.168.') ||
       window.location.hostname.startsWith('10.0.'));
    
    // Enable PWA if: commercial mode OR (development AND localhost)
    if (!appConfig.pwa.enabled && !(isDev && isLocalhost)) {
      console.log('[PWA] Skipped - PWA disabled in private mode');
      return;
    }
    
    if (isDev && isLocalhost) {
      console.log('[PWA] Dev mode - PWA enabled for local testing');
    }

    // Check if service workers are supported
    if ('serviceWorker' in navigator) {
      // Register service worker on page load
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('[PWA] Service Worker registered:', registration.scope);

            // Check for updates every 60 seconds
            setInterval(() => {
              registration.update();
            }, 60000);

            // Listen for updates
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('[PWA] New version available - auto-updating');
                    
                    // Tell the new service worker to skip waiting
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                    
                    // Reload the page to activate new version
                    // No prompt - auto-update as per requirements
                    window.location.reload();
                  }
                });
              }
            });
          })
          .catch((error) => {
            console.error('[PWA] Service Worker registration failed:', error);
          });
      });

      // Listen for controller change (new SW activated)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[PWA] New Service Worker activated');
      });
    } else {
      console.warn('[PWA] Service Workers not supported');
    }
  }, []);

  // Check if app can be installed
  useEffect(() => {
    if (!appConfig.pwa.enabled) return;

    let deferredPrompt: any = null;

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      
      // Stash the event so it can be triggered later
      deferredPrompt = e;
      
      console.log('[PWA] App can be installed');
      
      // For future: Could show custom install button
      // Currently auto-install prompt is handled by browser
    };

    const handleAppInstalled = () => {
      console.log('[PWA] App installed successfully');
      deferredPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Log PWA status
  useEffect(() => {
    if (!appConfig.pwa.enabled) return;

    // Check if running as PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isIOSStandalone = (window.navigator as any).standalone === true;

    if (isStandalone || isIOSStandalone) {
      console.log('[PWA] Running in standalone mode');
    } else {
      console.log('[PWA] Running in browser mode');
    }

    if (isIOS) {
      console.log('[PWA] iOS detected - Add to Home Screen available');
    }
  }, []);

  // This component doesn't render anything
  return null;
}
