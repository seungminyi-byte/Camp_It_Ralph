import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateMemo } from './llmClient';

afterEach(() => vi.unstubAllGlobals());

describe('offline opinion evidence', () => {
  it.each(['', '   \n'])(
    'rejects an empty successful response: %j',
    async (body) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(body, { status: 200 })),
      );
      const opts = {
        signal: new AbortController().signal,
        onText: vi.fn(),
        onMode: vi.fn(),
        fallbackAt: null,
      };
      await expect(generateMemo('prompt', opts)).rejects.toThrow(
        'AI 응답 본문 없음',
      );
      expect(opts.onMode).toHaveBeenCalledTimes(1);
    },
  );
  const options = () => ({
    signal: new AbortController().signal,
    onText: vi.fn(),
    onMode: vi.fn(),
    fallbackAt: { lat: 36.5, lng: 127.3, contextKey: 'current-evidence' },
  });
  it.each([
    { version: 3, contextKey: 'current-evidence' },
    { version: 4, contextKey: 'old-evidence' },
  ])(
    'rejects outdated or mismatched opinions even at the same point',
    async ({ version, contextKey }) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(new Response('', { status: 503 }))
          .mockResolvedValueOnce(
            Response.json({
              version,
              memos: {
                saved: { lat: 36.5, lng: 127.3, contextKey, text: 'outdated' },
              },
            }),
          ),
      );
      const opts = options();
      await expect(generateMemo('prompt', opts)).rejects.toThrow(
        '검토 의견 생성 실패',
      );
      expect(opts.onText).not.toHaveBeenCalled();
    },
  );
  it('uses a v4 opinion only when its full context matches', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('', { status: 503 }))
        .mockResolvedValueOnce(
          Response.json({
            version: 4,
            memos: {
              saved: {
                lat: 36.5,
                lng: 127.3,
                contextKey: 'current-evidence',
                text: 'verified',
              },
            },
          }),
        ),
    );
    const opts = options();
    await generateMemo('prompt', opts);
    expect(opts.onText).toHaveBeenCalledWith('verified');
    expect(opts.onMode).toHaveBeenLastCalledWith('fallback', {
      precomputedId: 'saved',
      distanceKm: 0,
    });
  });
});
