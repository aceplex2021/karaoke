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
