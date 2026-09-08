export const config = { runtime: 'edge' };

// Single provider: OpenRouter, with the model or router selected by LLM_MODEL.
// The key never reaches the browser — there is no in-app LLM settings UI.
// SSE is parsed by hand because the Edge runtime cannot bundle provider SDKs (they pull node:fs).

declare const process: { env: Record<string, string | undefined> };

const DEFAULT_MODEL = 'openrouter/free';
const UPSTREAM_TIMEOUT_MS = 55_000;

function sseToText(res: Response): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let buf = '';
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = res.body!.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const j = JSON.parse(payload) as {
              choices?: { delta?: { content?: string } }[];
              error?: { message?: string };
            };
            // OpenRouter reports mid-stream failures as a data frame; surface it as a section
            // the client parser understands instead of ending the memo silently.
            if (j.error) {
              controller.enqueue(enc.encode(`\n## ERROR\n${j.error.message ?? 'upstream error'}\n`));
              controller.close();
              return;
            }
            const t = j.choices?.[0]?.delta?.content;
            if (t) controller.enqueue(enc.encode(t));
          } catch {
            // partial or non-JSON line — skip
          }
        }
      }
      controller.close();
    },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return new Response('no OPENROUTER_API_KEY configured on server', { status: 503 });

  const { prompt } = (await req.json()) as { prompt?: string };
  if (!prompt || prompt.length > 20000) return new Response('bad prompt', { status: 400 });

  const model = process.env.LLM_MODEL || DEFAULT_MODEL;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), UPSTREAM_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: abort.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': new URL(req.url).origin,
        'X-Title': 'The Grand Site DC',
      },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.3,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    return new Response(`openrouter unreachable: ${e instanceof Error ? e.message : String(e)}`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  clearTimeout(timer);

  if (!res.ok || !res.body) {
    const detail = (await res.text()).replace(/\s+/g, ' ').slice(0, 300);
    return new Response(`openrouter ${res.status}: ${detail}`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  return new Response(sseToText(res), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-LLM-Model': model,
    },
  });
}
