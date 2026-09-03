export const config = { runtime: 'edge' };

// Provider is chosen by which key is configured on the server (first match wins):
// GEMINI_API_KEY (free tier) -> OPENROUTER_API_KEY (:free models) -> ANTHROPIC_API_KEY.
// Optional model override: LLM_MODEL.
// Every provider is called with fetch + SSE parsing: the Edge runtime cannot bundle
// @anthropic-ai/sdk (it references node:fs / node:path).

function sseToText(
  res: Response,
  extract: (json: unknown) => string | undefined,
): ReadableStream<Uint8Array> {
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
            const t = extract(JSON.parse(payload));
            if (t) controller.enqueue(enc.encode(t));
          } catch {
            // skip partial line
          }
        }
      }
      controller.close();
    },
  });
}

async function gemini(prompt: string, key: string, model: string) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
    `:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
  });
  if (!res.ok || !res.body) return new Response(`gemini ${res.status}`, { status: 502 });
  return sseToText(res, (j) => {
    const c = j as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return c.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  });
}

async function openrouter(prompt: string, key: string, model: string) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'X-Title': 'The Grand Site DC',
    },
    body: JSON.stringify({ model, stream: true, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok || !res.body) return new Response(`openrouter ${res.status}`, { status: 502 });
  return sseToText(
    res,
    (j) => (j as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content,
  );
}

async function anthropic(prompt: string, key: string, model: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok || !res.body) return new Response(`anthropic ${res.status}`, { status: 502 });
  return sseToText(res, (j) => {
    const e = j as { type?: string; delta?: { type?: string; text?: string } };
    return e.type === 'content_block_delta' && e.delta?.type === 'text_delta'
      ? e.delta.text
      : undefined;
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const { prompt } = (await req.json()) as { prompt?: string };
  if (!prompt || prompt.length > 20000) return new Response('bad prompt', { status: 400 });

  const env = process.env;
  let body: ReadableStream<Uint8Array> | Response;
  if (env.GEMINI_API_KEY) {
    body = await gemini(prompt, env.GEMINI_API_KEY, env.LLM_MODEL || 'gemini-2.5-flash');
  } else if (env.OPENROUTER_API_KEY) {
    body = await openrouter(
      prompt,
      env.OPENROUTER_API_KEY,
      env.LLM_MODEL || 'deepseek/deepseek-chat-v3-0324:free',
    );
  } else if (env.ANTHROPIC_API_KEY) {
    body = await anthropic(prompt, env.ANTHROPIC_API_KEY, env.LLM_MODEL || 'claude-opus-5');
  } else {
    return new Response('no LLM key configured on server', { status: 503 });
  }
  if (body instanceof Response) return body;
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
