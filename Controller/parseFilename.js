import removeAccents from 'remove-accents';
import { IGNORE_TOKENS, VERSION_TOKENS } from './rules.js';

function stripDecorations(raw) {
  return raw
    .replace(/\([^)]*\)/g, '')   // remove (Dm / Re Thu)
    .replace(/\[[^\]]*\]/g, '')  // remove [anything]
    .replace(/[-_.]/g, ' ');
}

function tokenize(raw) {
  return removeAccents(raw)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Build a version label that respects meaning:
 * - tone (nam/nu) = voice gender
 * - tram = low pitch/register (independent from gender)
 * - bolero/ballad/remix/live/acoustic/original/song_ca = style/type (independent)
 *
 * Rules:
 * - Only produce nam_tram / nu_tram if BOTH tone and tram detected.
 * - If tone is missing, keep 'tram' as pitch-only label.
 * - If tone is missing, keep 'bolero' etc as style-only label.
 * - If nothing detected, label 'original'.
 */
function buildLabel({ tone, isTram, style, version }) {
  const resolvedStyle = style || version || null;

  const parts = [];
  if (tone) parts.push(tone);
  if (resolvedStyle) parts.push(resolvedStyle);
  if (isTram) parts.push('tram');

  return parts.length ? parts.join('_') : 'original';
}

function detectKeyFromTokens(tokens) {
  const re = /^([a-g])(#)?(m)?$/i;
  for (const t of tokens) {
    const m = t.match(re);
    if (!m) continue;

    const letter = m[1].toUpperCase();
    const sharp = m[2] ? '#' : '';
    const minor = m[3] ? 'm' : '';

    if (!sharp && !minor && letter.length === 1) continue;

    return `${letter}${sharp}${minor}`;
  }
  return null;
}

export function parseFilename(filename) {
  const original = filename;

  const base = filename.replace(/\.mp4$/i, '');

  const title_display = (base.split('|')[0] || base).trim();

  const cleaned = stripDecorations(base);
  const tokens = tokenize(cleaned);

  let tone = null;
  let version = null;
  let mixer = null;

  let isTram = false;
  let style = null;
  const titleTokens = [];

  const joined = ` ${tokens.join(' ')} `;

  const isSongCa = /\bsong\s+ca\b/i.test(joined) || /\bduet\b/i.test(joined);
  if (isSongCa) style = 'song_ca';

  for (const t of tokens) {
    if (['nam', 'male'].includes(t)) {
      tone = 'nam';
      continue;
    }
    if (['nu', 'female'].includes(t)) {
      tone = 'nu';
      continue;
    }

    if (t === 'tram') {
      isTram = true;
      continue;
    }

    if (t === 'bolero') {
      style = style || 'bolero';
      continue;
    }
    if (t === 'ballad') {
      style = style || 'ballad';
      continue;
    }
    if (t === 'remix') {
      style = style || 'remix';
      continue;
    }
    if (t === 'live') {
      style = style || 'live';
      continue;
    }
    if (t === 'acoustic') {
      style = style || 'acoustic';
      continue;
    }
    if (t === 'original') {
      style = style || 'original';
      continue;
    }

    if (VERSION_TOKENS.includes(t)) {
      version = t;
      continue;
    }

    if (IGNORE_TOKENS.includes(t)) {
      continue;
    }

    titleTokens.push(t);
  }

  const key = detectKeyFromTokens(tokens);

  const title = titleTokens.join(' ').trim();
  const normalized_title = title;

  const label = buildLabel({ tone, isTram, style, version });

  return {
    original,
    title_display,
    title_clean: title,
    normalized_title,
    tone,
    version,
    label,
    key,
    mixer,
    is_tram: isTram,
    style
  };
}
