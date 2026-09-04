import { compareSummary, type CompareEntry, type PinnedSite } from '../compare/pins';
import { GRADE_COLOR, areaLabel, fmtKrw } from '../lib/format';
import { LAND_USE_LABEL } from '../scoring/engine';

interface Props {
  entries: CompareEntry[];
  currentId: string | null;
  isPinned: boolean;
  canPin: boolean;
  pinHint: string;
  capexKrw: number;
  annualRate: number;
  onPinCurrent: () => void;
  onOpen: (pin: PinnedSite) => void;
  onRemove: (id: string) => void;
}

/**
 * Side-by-side comparison of pinned sites under the same project assumptions. Every number here is
 * a scoreSite() output; the spread is a plain difference of two of them.
 */
export function CompareTray(props: Props) {
  const { entries, currentId, isPinned, canPin, pinHint, capexKrw, annualRate } = props;
  const summary = compareSummary(entries);

  return (
    <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-1.5 text-xs">
      <button
        type="button"
        onClick={props.onPinCurrent}
        disabled={!canPin}
        title={pinHint}
        className="flex-none rounded border border-gray-300 px-2 py-1 font-semibold hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isPinned ? '담김 · 해제' : '현재 지점 담기'}
      </button>

      {entries.length === 0 ? (
        <span className="min-w-0 flex-1 truncate text-gray-400">
          {pinHint || '지점을 고르고 ‘현재 지점 담기’를 누르면 같은 사업 가정으로 위치별 지연 금융비용을 나란히 비교합니다.'}
        </span>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          {entries.map(({ pin, result }) => (
            <div
              key={pin.id}
              className={`flex flex-none items-center gap-1.5 rounded border px-2 py-1 ${
                pin.id === currentId ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              }`}
            >
              <button
                type="button"
                onClick={() => props.onOpen(pin)}
                title={`용도지역: ${LAND_USE_LABEL[pin.landUse]} · 클릭하면 이 지점으로 이동`}
                className="flex items-center gap-1.5"
              >
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-black text-white ${GRADE_COLOR[result.composite.grade]}`}
                >
                  {result.composite.grade}
                </span>
                <span className="font-semibold">{areaLabel(result, pin.selection.label ?? '선택 지점')}</span>
                <span className="text-gray-500">
                  {result.delay.pointMonths}개월 · {fmtKrw(result.finance.delayCostKrw)}
                </span>
              </button>
              <button
                type="button"
                aria-label="비교에서 제거"
                onClick={() => props.onRemove(pin.id)}
                className="px-0.5 text-gray-400 hover:text-red-600"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-none flex-col items-end text-right">
        {summary && (
          <span className="font-semibold text-amber-900">
            {summary.diffKrw > 0 ? (
              <>
                최대 차이 약 {fmtKrw(summary.diffKrw)} — {areaLabel(summary.cheapest.result, '?')}{' '}
                {summary.cheapest.result.composite.grade} {summary.cheapest.result.delay.pointMonths}개월 ↔{' '}
                {areaLabel(summary.costliest.result, '?')} {summary.costliest.result.composite.grade}{' '}
                {summary.costliest.result.delay.pointMonths}개월
              </>
            ) : (
              <>지연 금융비용 동일 ({fmtKrw(summary.costliest.result.finance.delayCostKrw)})</>
            )}
          </span>
        )}
        <span className="text-[10px] text-gray-400">
          총사업비 {(capexKrw / 1e8).toLocaleString()}억원 · 연 {(annualRate * 100).toFixed(1)}% 공통 적용 · 스크리닝 참고용
        </span>
      </div>
    </div>
  );
}
