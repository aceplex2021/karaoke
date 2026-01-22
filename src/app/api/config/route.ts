/**
 * API: Get App Configuration
 * GET /api/config
 * 
 * Returns app configuration (features, mode, etc.)
 */

import { NextResponse } from 'next/server';
import { appConfig, getAppMode } from '@/lib/config';

export async function GET() {
  return NextResponse.json({
    mode: getAppMode(),
    commercialMode: appConfig.commercialMode,
    features: appConfig.features,
    player: appConfig.player,
    pwa: appConfig.pwa,
    room: appConfig.room,
    approval: appConfig.approval,
  });
}
