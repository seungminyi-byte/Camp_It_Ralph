import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../../../api/generate.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('report model routing', () => {
  it('finishes on the SSE completion marker even if the provider keeps the connection open', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    const cancel = vi.fn();
    const upstream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"완료"}}]}\n\ndata: [DONE]\n\n',
          ),
        );
      },
      cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(upstream, { headers: { 'Content-Type': 'text/event-stream' } })));
    const response = await handler(
      new Request('https://example.test/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'test' }),
      }),
    );
    expect(await response.text()).toBe('\n완료');
    expect(cancel).toHaveBeenCalled();
  });
  const request = () =>
    new Request('https://example.test/api/generate', {
      method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '검토 의견' }),
    });
  const setup = (model: string | undefined) => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.stubEnv('LLM_MODEL', model);
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          'data: {"model":"alternate-model","choices":[{"delta":{"content":"검토 결과"}}]}\n\ndata: [DONE]\n\n',
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
      );
    vi.stubGlobal('fetch', fetch);
    return fetch;
  };
  it.each([undefined, '', 'google/gemma-4-31b-it:free'])('keeps ordered free alternatives for default configuration %s', async (model) => {
    const fetch = setup(model);
    const response = await handler(request());
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload).toMatchObject({ stream: true, max_tokens: 4000, reasoning: { enabled: false } });
    expect(payload.models).toEqual([
      'nvidia/nemotron-3.5-lightning:free', 'google/gemma-4-31b-it:free',
      'google/gemma-4-26b-a4b-it:free',
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe('\n검토 결과');
    expect(response.headers.get('X-LLM-Model')).toBe('OpenRouter');
  });
  it.each(['openrouter/free', 'nvidia/nemotron-3.5-lightning:free', 'google/gemma-4-26b-a4b-it:free'])('honors explicit %s without adding alternatives', async (model) => {
    const fetch = setup(model);
    const response = await handler(request());
    expect(JSON.parse(fetch.mock.calls[0][1].body).models).toEqual([
      model,
    ]);
    expect(await response.text()).toBe('\n검토 결과');
    expect(response.headers.get('X-LLM-Model')).toBe(model);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['paid/model', 'openrouter/free\n', 'unknown:free'])('rejects unapproved configuration before fetch: %s', async (model) => {
    const fetch = setup(model);
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('SERVER_UNAVAILABLE');
    expect(fetch).not.toHaveBeenCalled();
  });
});
