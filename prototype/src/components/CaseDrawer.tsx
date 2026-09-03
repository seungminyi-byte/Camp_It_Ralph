import type { AppData, CaseRow } from '../types';

export function CaseDrawer({
  data,
  open,
  onFly,
}: {
  data: AppData;
  open: boolean;
  onFly: (c: CaseRow) => void;
}) {
  if (!open) return null;
  return (
    <div className="absolute left-3 top-3 z-[1000] max-h-[80%] w-80 overflow-y-auto rounded bg-white/95 p-3 shadow-lg">
      <h3 className="mb-2 text-sm font-bold">데이터센터 갈등·지연 사례 (언론보도 기반)</h3>
      <ul className="flex flex-col gap-2">
        {data.cases.map((c) => (
          <li key={c.id} className="rounded border border-gray-200 p-2 text-xs">
            <button className="text-left font-semibold text-blue-700 hover:underline" onClick={() => onFly(c)}>
              {c.name}
            </button>
            <span className="ml-1 rounded bg-gray-100 px-1 text-[10px]">{c.status}</span>
            <div className="mt-0.5 text-gray-600">
              {c.cause} · 지연 {c.delay_months}
              {c.delay_estimated === 'Y' ? '개월(추정)' : '개월'}
            </div>
            <a className="text-[10px] text-gray-400 underline" href={c.source_url} target="_blank" rel="noreferrer">
              출처
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
