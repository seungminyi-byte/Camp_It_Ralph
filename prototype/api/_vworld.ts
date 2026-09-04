// Shared VWorld plumbing for the wms / zoning / geocode routes.
// Files under api/ whose name starts with "_" are not deployed as functions by Vercel.
//
// Two VWorld quirks are handled here:
//  - non-browser calls must carry the registered service URL in the `domain` parameter
//  - key and domain errors come back as HTTP 200 with an XML/HTML body, so callers must check
//    the content type rather than the status code.

declare const process: { env: Record<string, string | undefined> };

export const UPSTREAM_TIMEOUT_MS = 12_000;

export function registeredDomain(env: Record<string, string | undefined>): string {
  if (env.VWORLD_DOMAIN) return env.VWORLD_DOMAIN;
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'http://localhost';
}

export function vworldEnv(): { key: string | undefined; domain: string } {
  const env = process.env;
  return { key: env.VWORLD_API_KEY, domain: registeredDomain(env) };
}

/** GET an already-built VWorld URL with the key, domain and a hard timeout applied. */
export async function fetchVworld(
  url: URL,
  key: string,
  domain: string,
  timeoutMs: number = UPSTREAM_TIMEOUT_MS,
): Promise<Response> {
  url.searchParams.set('key', key);
  url.searchParams.set('domain', domain);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: { Referer: domain }, signal: abort.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function jsonResponse(body: unknown, cacheControl: string): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cacheControl },
  });
}

/** Parse a VWorld JSON response, rejecting the HTML/XML error bodies it returns with status 200. */
export async function vworldJson(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.includes('json')) {
    const detail = (await res.text()).replace(/\s+/g, ' ').slice(0, 300);
    throw new Error(`vworld ${res.status} ${contentType}: ${detail}`);
  }
  return (await res.json()) as Record<string, unknown>;
}
