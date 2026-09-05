import { useState, type KeyboardEvent } from 'react';
import type { AppData } from '../types';

/**
 * The 참고용 notice stays on one always-visible line; the full text sits in a popover that opens on
 * hover or keyboard focus and toggles on tap, since touch has no hover.
 */
export function DisclaimerFooter({ data }: { data: AppData }) {
  const d = data.constants.disclaimer;
  const [open, setOpen] = useState(false);
  const details = [
    d.power,
    d.substation,
    d.stats,
    d.terrain,
    d.restriction,
    data.permitDelay ? d.permits : '',
    data.newsSignal ? d.news : '',
  ].filter(Boolean);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape') return;
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <footer
      className="group sticky bottom-0 z-10 mt-auto border-t border-gray-200 bg-gray-50/95 px-3 py-1.5 text-[10px] text-gray-500 backdrop-blur"
      onKeyDown={onKeyDown}
    >
      <div className="relative">
        <div
          id="disclaimer-detail"
          className={`absolute inset-x-0 bottom-full mb-1 max-h-[60vh] overflow-y-auto rounded border border-gray-300 bg-white p-3 leading-relaxed text-gray-600 shadow-lg ${
            open ? 'block' : 'hidden group-hover:block group-focus-within:block'
          }`}
        >
          <p className="font-semibold text-gray-800">{d.main}</p>
          {details.map((p, i) => (
            <p key={i} className="mt-1">
              {p}
            </p>
          ))}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="disclaimer-detail"
          onClick={(e) => {
            // Closing must also drop focus, or focus-within keeps the popover open.
            if (open) e.currentTarget.blur();
            setOpen((v) => !v);
          }}
          className="flex w-full items-center gap-1.5 text-left"
        >
          <span aria-hidden className="flex-none text-[11px]">
            ⓘ
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold">
            스크리닝 참고용 · 한전 공식 검토·법률 판단 대체 불가
          </span>
          <span className="flex-none underline">{open ? '닫기' : '자세히'}</span>
        </button>
      </div>
    </footer>
  );
}
