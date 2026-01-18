import removeAccents from 'remove-accents';

export function normalize(text) {
  return removeAccents(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
