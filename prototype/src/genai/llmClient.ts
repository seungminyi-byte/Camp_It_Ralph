import Anthropic from '@anthropic-ai/sdk';

export type Provider = 'anthropic' | 'gemini' | 'openrouter';
export type LlmMode = 'proxy' | 'direct' | 'fallback';

export interface LlmSettings {
  provider: Provider;
  apiKey: string;
  model: string;
}

export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-opus-5',
  gemini: 'gemini-2.5-flash',
  openrouter: 'deepseek/deepseek-chat-v3-0324:free',
};

export const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: 'Anthropic (유료)',
  gemini: 'Google Gemini (무료 티어)',
  openrouter: 'OpenRouter (:free 모델)',
};

const SETTINGS_KEY = 'dc-screener-llm';

export function loadSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<LlmSettings>;
      const provider: Provider = s.provider ?? 'gemini';
      return { provider, apiKey: s.apiKey ?? '', model: s.model || DEFAULT_MODELS[provider] };
    }
  } catch {
    // storage unavailable
  }
  return { provider: 'gemini', apiKey: '', model: DEFAULT_MODELS.gemini };
}

export function saveSettings(s: LlmSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // storage unavailable — direct mode simply stays unavailable
  }
}

async function readSse(
  res: Response,
  extract: (json: unknown) => string | undefined,
  onText: (t: string) => void,
): Promise<void> {
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
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
        if (t) onText(t);
      } catch {
        // partial or non-JSON line — skip
      }
    }
  }
}

async function streamViaProxy(prompt: string, onText: (t: string) => void): Promise<void> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok || !res.body) throw new Error(`proxy ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onText(dec.decode(value, { stream: true }));
  }
}

async function streamAnthropic(prompt: string, s: LlmSettings, onText: (t: string) => void) {
  const client = new Anthropic({ apiKey: s.apiKey, dangerouslyAllowBrowser: true });
  const stream = client.messages.stream({
    model: s.model,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });
  stream.on('text', onText);
  await stream.finalMessage();
}

async function streamGemini(prompt: string, s: LlmSettings, onText: (t: string) => void) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.model)}` +
    `:streamGenerateContent?alt=sse&key=${encodeURIComponent(s.apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
  });
  await readSse(
    res,
    (j) => {
      const c = j as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return c.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
    },
    onText,
  );
}

async function streamOpenRouter(prompt: string, s: LlmSettings, onText: (t: string) => void) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${s.apiKey}`,
      'HTTP-Referer': location.origin,
      'X-Title': 'The Grand Site DC',
    },
    body: JSON.stringify({
      model: s.model,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  await readSse(
    res,
    (j) => (j as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content,
    onText,
  );
}

async function streamDirect(prompt: string, s: LlmSettings, onText: (t: string) => void) {
  if (s.provider === 'anthropic') return streamAnthropic(prompt, s, onText);
  if (s.provider === 'gemini') return streamGemini(prompt, s, onText);
  return streamOpenRouter(prompt, s, onText);
}

async function loadPrecomputed(scenarioId: string | null): Promise<string | null> {
  if (!scenarioId) return null;
  try {
    const res = await fetch('data/precomputed_memos.json');
    if (!res.ok) return null;
    const memos = (await res.json()) as Record<string, string>;
    return memos[scenarioId] ?? null;
  } catch {
    return null;
  }
}

export async function generateMemo(
  prompt: string,
  scenarioId: string | null,
  onText: (t: string) => void,
  onMode: (m: LlmMode) => void,
): Promise<void> {
  const errors: string[] = [];
  try {
    onMode('proxy');
    await streamViaProxy(prompt, onText);
    return;
  } catch (e) {
    errors.push(`proxy: ${e instanceof Error ? e.message : String(e)}`);
  }
  const settings = loadSettings();
  if (settings.apiKey) {
    try {
      onMode('direct');
      await streamDirect(prompt, settings, onText);
      return;
    } catch (e) {
      errors.push(`${settings.provider}: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    errors.push('API 키 미설정');
  }
  onMode('fallback');
  const pre = await loadPrecomputed(scenarioId);
  if (pre) {
    for (const chunk of pre.match(/[\s\S]{1,40}/g) ?? []) {
      onText(chunk);
      await new Promise((r) => setTimeout(r, 25));
    }
    return;
  }
  throw new Error(
    `GenAI 호출 불가 (${errors.join(' / ')}). 설정에서 무료 Gemini 키 등을 입력하거나 데모 시나리오를 선택하세요.`,
  );
}
