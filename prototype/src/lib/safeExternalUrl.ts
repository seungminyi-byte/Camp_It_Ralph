/** Only explicit web URLs are navigable; rejected source text remains readable. */
export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string' || [...value].some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) >= 127 && character.charCodeAt(0) <= 159) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)) return null;
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
