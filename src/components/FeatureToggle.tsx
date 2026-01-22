/**
 * FeatureToggle Component
 * 
 * Conditionally renders children based on feature availability
 * Used to show/hide features based on COMMERCIAL_MODE setting
 * 
 * Usage:
 * <FeatureToggle feature="youtubeSearch">
 *   <YouTubeSearchComponent />
 * </FeatureToggle>
 */

'use client';

import { ReactNode } from 'react';
import { appConfig, isFeatureEnabled } from '@/lib/config';

interface FeatureToggleProps {
  /**
   * Feature name to check
   */
  feature: keyof typeof appConfig.features;
  
  /**
   * Content to render if feature is enabled
   */
  children: ReactNode;
  
  /**
   * Optional: Content to render if feature is disabled
   */
  fallback?: ReactNode;
  
  /**
   * Optional: Invert the check (render if feature is disabled)
   */
  invert?: boolean;
}

/**
 * FeatureToggle Component
 * Shows children only if feature is enabled
 */
export function FeatureToggle({ 
  feature, 
  children, 
  fallback = null, 
  invert = false 
}: FeatureToggleProps) {
  const isEnabled = isFeatureEnabled(feature);
  const shouldRender = invert ? !isEnabled : isEnabled;

  return <>{shouldRender ? children : fallback}</>;
}

/**
 * CommercialOnly Component
 * Shows children only in commercial mode (YouTube)
 */
export function CommercialOnly({ children }: { children: ReactNode }) {
  return appConfig.commercialMode ? <>{children}</> : null;
}

/**
 * PrivateOnly Component
 * Shows children only in private mode (Database)
 */
export function PrivateOnly({ children }: { children: ReactNode }) {
  return !appConfig.commercialMode ? <>{children}</> : null;
}

/**
 * Hook: useFeature
 * Check if a feature is enabled in a component
 */
export function useFeature(feature: keyof typeof appConfig.features): boolean {
  return isFeatureEnabled(feature);
}

/**
 * Hook: useAppMode
 * Get current app mode information
 */
export function useAppMode() {
  return {
    isCommercial: appConfig.commercialMode,
    isPrivate: !appConfig.commercialMode,
    playerType: appConfig.player.type,
    features: appConfig.features,
  };
}
