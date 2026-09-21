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
    onReplace: vi.fn(),
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
    onReplace: vi.fn(),
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
    expect(opts.onReplace).toHaveBeenCalledWith('verified');
    expect(opts.onText).not.toHaveBeenCalled();
    expect(opts.onMode).toHaveBeenLastCalledWith('fallback', {
      precomputedId: 'saved',
      distanceKm: 0,
    });
  });
});

describe('one bounded stream lifecycle', () => {
  const opts = () => ({ signal: new AbortController().signal, onText: vi.fn(), onReplace: vi.fn(), onMode: vi.fn(), fallbackAt: null });
  const plain = (body: BodyInit | null, extra: HeadersInit = {}) => new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', ...extra } });
  afterEach(() => vi.useRealTimers());
  it('bounds stalled headers and cancels a late body', async () => {
    vi.useFakeTimers();
    let resolve!: (response: Response) => void;
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; })));
    const pending = generateMemo('prompt', opts());
    const assertion = expect(pending).rejects.toThrow('65초');
    await vi.advanceTimersByTimeAsync(65000); await assertion;
    resolve(plain(new ReadableStream({ cancel })));
    await Promise.resolve(); expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps the same deadline after late headers and cancels a stalled body', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => { await new Promise(resolve => setTimeout(resolve, 60000)); return plain(new ReadableStream({ cancel })); }));
    const pending = generateMemo('prompt', opts()); const assertion = expect(pending).rejects.toThrow('65초');
    await vi.advanceTimersByTimeAsync(65000); await assertion;
    expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('has no new deadline for a stalled fallback body', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn());
    const options = { ...opts(), fallbackAt: { lat: 36, lng: 127, contextKey: 'exact' } };
    // Use a hanging JSON stream after the proxy failure.
    vi.mocked(fetch).mockImplementationOnce(async () => { await new Promise(resolve => setTimeout(resolve, 60000)); return new Response('', { status: 503 }); })
      .mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'application/json' } }));
    const pending = generateMemo('prompt', options); const assertion = expect(pending).rejects.toThrow('65초');
    await vi.advanceTimersByTimeAsync(65000); await assertion; expect(cancel).toHaveBeenCalledOnce(); expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });
  it('distinguishes abort from empty/error and does not attempt fallback on stop', async () => {
    vi.useFakeTimers(); const controller = new AbortController(); const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(plain(new ReadableStream({ cancel }))));
    const pending = generateMemo('prompt', { ...opts(), signal: controller.signal, fallbackAt: { lat: 36, lng: 127, contextKey: 'exact' } });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve(); controller.abort(); await assertion;
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1); expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not fetch when already aborted, and cleans up listeners', async () => {
    const controller = new AbortController(); controller.abort(); vi.stubGlobal('fetch', vi.fn());
    await expect(generateMemo('prompt', { ...opts(), signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    ['marker', '## ITEM power.gate\n확인\n## ERROR\nUPSTREAM_INCOMPLETE', '완료하지'],
    ['oversize', '가'.repeat(45000), '크기'],
    ['empty', ' \n ', '본문 없음'],
  ])('rejects %s and releases the reader', async (_, body, message) => {
    vi.useFakeTimers(); const response = plain(body); const options = opts();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(generateMemo('prompt', options)).rejects.toThrow(message);
    expect(response.body?.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
  it('replaces a disconnected proxy draft with only the exact fallback text', async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(plain(body)).mockResolvedValueOnce(Response.json({ version: 4, memos: { saved: { lat: 36, lng: 127, contextKey: 'exact', text: '정확한 사전 의견' } } })));
    let output = ''; const options = { ...opts(), fallbackAt: { lat: 36, lng: 127, contextKey: 'exact' }, onText: (text: string) => { output += text; }, onReplace: (text: string) => { output = text; } };
    const pending = generateMemo('prompt', options); stream.enqueue(new TextEncoder().encode('실패 초안'));
    await new Promise(resolve => setTimeout(resolve, 0)); expect(output).toBe('실패 초안'); stream.error(new Error('disconnect'));
    await pending; expect(output).toBe('정확한 사전 의견'); expect(fetch).toHaveBeenCalledTimes(2); expect(body.locked).toBe(false);
  });
  it('preflights oversized input without a network call', async () => {
    vi.stubGlobal('fetch', vi.fn()); await expect(generateMemo('가'.repeat(20001), opts())).rejects.toThrow('요청 자료'); expect(fetch).not.toHaveBeenCalled();
  });
});
