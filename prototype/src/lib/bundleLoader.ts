export const BUNDLE_DEADLINE_MS = 15_000;
/** Current largest files are 3.26 MB and 2.62 MB; limits leave room without being unbounded. */
export const BUNDLE_LIMITS: Record<string, number> = {
  'emd_power.json': 1024 * 1024, 'emd_centroids.json': 1024 * 1024,
  'substations_osm.json': 512 * 1024, 'schools.json': 2 * 1024 * 1024,
  'pop_grid.json': 3 * 1024 * 1024, 'dc_stats.json': 128 * 1024,
  'data_centers.json': 256 * 1024, 'constants.json': 256 * 1024,
  'cases.csv': 256 * 1024, 'regulations.csv': 256 * 1024,
  'permit_delay.json': 1024 * 1024, 'news_signal.json': 2 * 1024 * 1024,
  'terrain_grid.json': 2 * 1024 * 1024, 'protected_zones.json': 5 * 1024 * 1024,
  'households_grid.json': 4 * 1024 * 1024,
};
export async function fetchBundleText(path: string, maxBytes: number, parent: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const abort = () => controller.abort(parent.reason);
  parent.addEventListener('abort', abort, { once: true });
  if (parent.aborted) abort();
  const timer = setTimeout(() => controller.abort(new Error('자료를 불러오는 제한시간을 초과했습니다.')), BUNDLE_DEADLINE_MS);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const wait = async <T>(pending: Promise<T>) => {
    if (controller.signal.aborted) throw controller.signal.reason;
    let listener = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      listener = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', listener, { once: true });
    });
    try { return await Promise.race([pending, cancelled]); }
    finally { controller.signal.removeEventListener('abort', listener); }
  };
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const pending = fetch(path, { signal: controller.signal, redirect: 'error' });
    void pending.then(response => { if (controller.signal.aborted && !response.body?.locked) void response.body?.cancel().catch(() => {}); }, () => {});
    const response = await wait(pending);
    const length = response.headers.get('content-length');
    if (!response.ok || !response.body || length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
      void response.body?.cancel().catch(() => {}); throw Error('자료 응답을 확인할 수 없습니다.');
    }
    const media = response.headers.get('content-type')?.split(';')[0];
    if (media === 'text/html') { void response.body.cancel().catch(() => {}); throw Error('자료 대신 웹페이지가 반환되었습니다.'); }
    reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let lengthRead = 0;
    while (true) {
      const part = await wait(reader.read());
      if (part.done) break;
      lengthRead += part.value.byteLength;
      if (lengthRead > maxBytes) throw Error('자료 크기가 허용 범위를 초과했습니다.');
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(lengthRead); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } finally {
    if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
    controller.abort(); clearTimeout(timer); parent.removeEventListener('abort', abort);
  }
}
interface Entry<T> { controller: AbortController; promise: Promise<T>; leases: number; settled: boolean }
/** Parsed successes outlive consumers. Failed promises never enter the successful cache. */
export class BundleLoader {
  private successes = new Map<string, unknown>();
  private inflight = new Map<string, Entry<unknown>>();
  acquire<T>(name: string, parse: (text: string) => T): { promise: Promise<T>; release: () => void } {
    if (this.successes.has(name)) return { promise: Promise.resolve(this.successes.get(name) as T), release: () => {} };
    let entry = this.inflight.get(name) as Entry<T> | undefined;
    if (!entry) {
      const controller = new AbortController();
      const limit = BUNDLE_LIMITS[name];
      if (!limit) throw Error('Unknown bundle');
      const created: Entry<T> = { controller, leases: 0, settled: false, promise: Promise.resolve(null as T) };
      created.promise = fetchBundleText(`/data/${name}`, limit, controller.signal).then(text => {
        if (controller.signal.aborted) throw controller.signal.reason;
        const value = parse(text);
        if (controller.signal.aborted) throw controller.signal.reason;
        this.successes.set(name, value); return value;
      }).finally(() => { created.settled = true; if (this.inflight.get(name) === created) this.inflight.delete(name); });
      this.inflight.set(name, created); entry = created;
    }
    entry.leases++;
    const subscribed = entry; let active = true;
    return { promise: subscribed.promise, release: () => {
      if (!active) return;
      active = false; subscribed.leases--;
      // StrictMode cleanup/remount can reclaim the same lease in this task.
      queueMicrotask(() => {
        if (subscribed.leases === 0 && !subscribed.settled) {
          if (this.inflight.get(name) === subscribed) this.inflight.delete(name);
          subscribed.controller.abort(new DOMException('Cancelled bundle', 'AbortError'));
        }
      });
    } };
  }
}
export const bundleLoader = new BundleLoader();
