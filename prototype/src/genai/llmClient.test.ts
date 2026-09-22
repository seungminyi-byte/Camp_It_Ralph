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
    const assertion = expect(pending).rejects.toThrow('195초');
    await vi.advanceTimersByTimeAsync(195000); await assertion;
    resolve(plain(new ReadableStream({ cancel })));
    await Promise.resolve(); expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps the same deadline after late headers and cancels a stalled body', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => { await new Promise(resolve => setTimeout(resolve, 190000)); return plain(new ReadableStream({ cancel })); }));
    const pending = generateMemo('prompt', opts()); const assertion = expect(pending).rejects.toThrow('195초');
    await vi.advanceTimersByTimeAsync(195000); await assertion;
    expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('has no new deadline for a stalled fallback body', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn());
    const options = { ...opts(), fallbackAt: { lat: 36, lng: 127, contextKey: 'exact' } };
    // Use a hanging JSON stream after the proxy failure.
    vi.mocked(fetch).mockImplementationOnce(async () => { await new Promise(resolve => setTimeout(resolve, 190000)); return new Response('', { status: 503 }); })
      .mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'application/json' } }));
    const pending = generateMemo('prompt', options); const assertion = expect(pending).rejects.toThrow('195초');
    await vi.advanceTimersByTimeAsync(195000); await assertion; expect(cancel).toHaveBeenCalledOnce(); expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
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

describe('safe generation failure messages', () => {
  const opts = () => ({ signal: new AbortController().signal, onText: vi.fn(), onReplace: vi.fn(), onMode: vi.fn(), fallbackAt: null });
  const cases = [
    ['UPSTREAM_AUTH_FAILED', '인증이 거절'],
    ['UPSTREAM_RATE_LIMITED', '요청 제한'],
    ['UPSTREAM_PROVIDER_TIMEOUT', '제공자가 응답 시간초과'],
    ['UPSTREAM_TIMEOUT', '응답 대기 제한시간'],
    ['UPSTREAM_UNAVAILABLE', '완료하지 못'],
  ];
  it.each(cases)('classifies bounded plain HTTP error %s without forwarding its body', async (code, message) => {
    const options = opts(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(code, { status: 502, headers: { 'content-type': 'text/plain' } })));
    await expect(generateMemo('prompt', options)).rejects.toThrow(message); expect(options.onText).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(cases)('preserves %s across every single-byte marker and code split', async (code, message) => {
    const cancel = vi.fn(); const bytes = new TextEncoder().encode(`\n부분 의견\n## ERROR\n${code}\n`);
    const body = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); }, cancel });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-type': 'text/plain' } })));
    await expect(generateMemo('prompt', opts())).rejects.toThrow(message); expect(cancel).toHaveBeenCalledOnce(); expect(body.locked).toBe(false); expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(['constructor', 'UPSTREAM_AUTH_FAILED_EXTRA', 'PRIVATE_PROVIDER_MESSAGE', 'x'.repeat(513)])('does not expose or reinterpret an unknown HTTP body: %s', async body => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 502, headers: { 'content-type': 'text/plain' } })));
    const options = opts(); await expect(generateMemo('prompt', options)).rejects.toThrow('완료하지 못'); expect(options.onText).not.toHaveBeenCalled();
  });
  it('does not classify a partial recognized code before its line ends', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(c) { controller = c; } }), { headers: { 'content-type': 'text/plain' } })));
    const pending = generateMemo('prompt', opts()); const rejection = expect(pending).rejects.toThrow('완료하지 못');
    controller.enqueue(new TextEncoder().encode('## ERROR\nUPSTREAM_AUTH_FAILED')); await new Promise(resolve => setTimeout(resolve, 0));
    controller.enqueue(new TextEncoder().encode('_EXTRA\n')); await rejection;
  });
  it('rejects a final ERROR marker with no code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('\n## ERROR\n', { headers: { 'content-type': 'text/plain' } })));
    await expect(generateMemo('prompt', opts())).rejects.toThrow('완료하지 못');
  });
  it('accepts progress beyond the old deadline within the same new client budget', async () => {
    vi.useFakeTimers();
    try {
      let stream!: ReadableStreamDefaultController<Uint8Array>; const cancel = vi.fn();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(c) { stream = c; }, cancel }), { headers: { 'content-type': 'text/plain' } })));
      const options = opts(), pending = generateMemo('prompt', options);
      await vi.advanceTimersByTimeAsync(150_000); stream.enqueue(new TextEncoder().encode('긴 정상 의견')); stream.close();
      await pending; expect(options.onText).toHaveBeenCalledWith('긴 정상 의견'); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
