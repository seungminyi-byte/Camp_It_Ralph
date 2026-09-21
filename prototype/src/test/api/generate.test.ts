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
    expect(await response.text()).toBe('완료');
    expect(cancel).toHaveBeenCalled();
  });
  const request = () =>
    new Request('https://example.test/api/generate', {
      method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '검토 의견' }),
    });
  const setup = (model: string) => {
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
  it('keeps automatic alternatives free and does not mislabel the chosen model', async () => {
    const fetch = setup('google/gemma-4-31b-it:free');
    const response = await handler(request());
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.models).toHaveLength(3);
    expect(
      payload.models.every((model: string) => model.endsWith(':free')),
    ).toBe(true);
    expect(await response.text()).toBe('검토 결과');
    expect(response.headers.get('X-LLM-Model')).toBe('OpenRouter');
  });
  it('honors an explicitly configured free router without adding alternatives', async () => {
    const fetch = setup('openrouter/free');
    const response = await handler(request());
    expect(JSON.parse(fetch.mock.calls[0][1].body).models).toEqual([
      'openrouter/free',
    ]);
    expect(await response.text()).toBe('검토 결과');
    expect(response.headers.get('X-LLM-Model')).toBe('openrouter/free');
  });
});
