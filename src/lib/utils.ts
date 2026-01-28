import { v4 as uuidv4 } from 'uuid';

/**
 * Get or create a browser fingerprint (stored in localStorage)
 */
export function getOrCreateFingerprint(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const storageKey = 'karaoke_fingerprint';
  let fingerprint = localStorage.getItem(storageKey);

  if (!fingerprint) {
    fingerprint = uuidv4();
    localStorage.setItem(storageKey, fingerprint);
  }

  return fingerprint;
}

/**
 * Generate QR code URL for room
 */
export function getQRCodeUrl(roomCode: string): string {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  return `${baseUrl}/room/${roomCode}`;
}

/**
 * Debounce function - delays execution until after wait time has passed
 * @param func Function to debounce
 * @param wait Wait time in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Device detection utilities
 * Used for conditional UI rendering based on device type
 */
export function isAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isIPad(): boolean {
  if (typeof window === 'undefined') return false;
  // iPad detection: check for iPad in user agent, or check for touch + large screen
  const ua = navigator.userAgent;
  const isIPadUA = /iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return isIPadUA;
}

export function isMobile(): boolean {
  return isAndroid() || isIOS();
}

export function isDesktop(): boolean {
  return !isMobile();
}
