/**
 * v4.0 Feature Toggle Configuration
 * 
 * Controls whether the app operates in:
 * - COMMERCIAL_MODE=true: YouTube-only (safe for public/commercial use)
 * - COMMERCIAL_MODE=false: Database mode (private use only, copyright risk)
 * 
 * IMPORTANT: 
 * - Public deployments MUST use COMMERCIAL_MODE=true
 * - Database mode is for private/testing only
 */

// Read from environment variable
const isCommercialMode = process.env.NEXT_PUBLIC_COMMERCIAL_MODE === 'true';

export const appConfig = {
  /**
   * Commercial mode flag
   * true = YouTube only (public safe)
   * false = Database mode (private only)
   */
  commercialMode: isCommercialMode,

  /**
   * Feature availability based on mode
   */
  features: {
    // Database features (only in private mode)
    databaseSearch: !isCommercialMode,
    localVideoPlayback: !isCommercialMode,
    
    // YouTube features (only in commercial mode)
    youtubeSearch: isCommercialMode,
    youtubePlayback: isCommercialMode,
    hostApproval: isCommercialMode,
    pwaShare: isCommercialMode,
    
    // Always available
    queueManagement: true,
    roundRobin: true,
    tvDisplay: true,
  },

  /**
   * Player configuration
   */
  player: {
    // 'video' = HTML5 video (database mode)
    // 'youtube' = YouTube iframe (commercial mode)
    type: isCommercialMode ? 'youtube' : 'video',
  },

  /**
   * Polling intervals (same as v3.5)
   */
  polling: {
    intervalMs: 2500,  // 2.5 seconds
  },

  /**
   * Room configuration
   */
  room: {
    expiryHours: 24,  // Rooms expire after 24 hours
    maxUsers: 50,     // Maximum users per room
    maxQueue: 100,    // Maximum songs in queue
  },

  /**
   * Approval configuration (commercial mode only)
   */
  approval: {
    expiryMinutes: 15,  // Pending approvals expire after 15 minutes
  },

  /**
   * PWA configuration
   */
  pwa: {
    enabled: isCommercialMode,  // PWA only in commercial mode
    name: 'Kara',
    shortName: 'Kara',
    description: 'Karaoke Queue Manager',
  },
} as const;

/**
 * Type-safe feature check
 */
export function isFeatureEnabled(feature: keyof typeof appConfig.features): boolean {
  return appConfig.features[feature];
}

/**
 * Get player type
 */
export function getPlayerType(): 'video' | 'youtube' {
  return appConfig.player.type;
}

/**
 * Check if running in commercial mode
 */
export function isCommercial(): boolean {
  return appConfig.commercialMode;
}

/**
 * Get app mode display name
 */
export function getAppMode(): string {
  return isCommercialMode ? 'Commercial (YouTube)' : 'Private (Database)';
}

/**
 * Validate configuration on startup
 */
export function validateConfig(): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Check if in production and not in commercial mode
  if (process.env.NODE_ENV === 'production' && !isCommercialMode) {
    warnings.push(
      '⚠️ WARNING: Running in production without COMMERCIAL_MODE! ' +
      'Database mode should only be used privately (copyright risk)'
    );
  }

  // Check if environment variable is set
  if (process.env.NEXT_PUBLIC_COMMERCIAL_MODE === undefined) {
    warnings.push(
      '⚠️ WARNING: NEXT_PUBLIC_COMMERCIAL_MODE not set! ' +
      'Defaulting to database mode. Set to "true" for YouTube mode.'
    );
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

// Log configuration on startup (server-side only)
if (typeof window === 'undefined') {
  console.log('='.repeat(60));
  console.log('🎤 Karaoke App Configuration');
  console.log('='.repeat(60));
  console.log(`Mode: ${getAppMode()}`);
  console.log(`Commercial Mode: ${appConfig.commercialMode}`);
  console.log(`Player Type: ${appConfig.player.type}`);
  console.log(`Database Search: ${appConfig.features.databaseSearch}`);
  console.log(`YouTube Search: ${appConfig.features.youtubeSearch}`);
  console.log(`Host Approval: ${appConfig.features.hostApproval}`);
  console.log(`PWA Enabled: ${appConfig.pwa.enabled}`);
  
  const validation = validateConfig();
  if (!validation.valid) {
    console.log('\n⚠️ Configuration Warnings:');
    validation.warnings.forEach(warning => console.log(warning));
  }
  
  console.log('='.repeat(60));
}
