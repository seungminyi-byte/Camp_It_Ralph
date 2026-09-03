import type { AppData } from '../types';

export function CompareStrip({ data }: { data: AppData }) {
  const s = data.constants.stats;
  const items = [
    { label: '전력 기술검토 신청 (24.8~26.3)', value: `${s.techReviewTotal.value}건` },
    { label: '수도권 쏠림', value: `${Math.round((s.capitalShare.value ?? 0) * 100)}%` },
    { label: '수도권 본심사 탈락률', value: `${((s.capitalMainReviewFailRate.value ?? 0) * 100).toFixed(1)}%` },
    { label: '수도권 최종 승인률', value: `${((s.capitalFinalApprovalRate.value ?? 0) * 100).toFixed(1)}%` },
    { label: '비수도권 통과율', value: `${((s.nonCapitalPassRate.value ?? 0) * 100).toFixed(1)}%` },
    { label: '서울 통과', value: `${s.seoulPassCount.value}건` },
    { label: '수도권 허가 후 지연·차질', value: `${((s.capitalPermitDelayed.value ?? 0) * 100).toFixed(0)}%` },
  ];
  return (
    <div className="flex gap-4 overflow-x-auto border-b border-gray-200 bg-slate-800 px-4 py-1.5 text-white">
      {items.map((it) => (
        <div key={it.label} className="flex flex-none items-baseline gap-1.5">
          <span className="text-[11px] text-slate-300">{it.label}</span>
          <span className="text-sm font-bold">{it.value}</span>
        </div>
      ))}
    </div>
  );
}
