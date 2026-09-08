import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateMemo } from './llmClient';

afterEach(() => vi.unstubAllGlobals());

describe('offline opinion evidence', () => {
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
