import { useRef, useState, type KeyboardEvent } from 'react';
import type { AppData } from '../types';

/**
 * Full source limitations are available on explicit activation only.
 */
export function DisclaimerFooter({ data }: { data: AppData }) {
  const d = data.constants.disclaimer;
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const details = [
    d.review,
    d.power,
    d.substation,
    d.stats,
    d.terrain,
    d.restriction,
    d.disaster,
    data.permitDelay ? d.permits : '',
    data.newsSignal ? d.news : '',
  ].filter(Boolean);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape') return;
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <footer
      className="source-disclaimer"
      onKeyDown={onKeyDown}
    >
      <div className="relative">
        <div
          id="disclaimer-detail"
          className="source-disclaimer-detail"
          hidden={!open}
          role="region"
          aria-label="자료별 유의사항 전문"
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
          ref={trigger}
          aria-expanded={open}
          aria-controls="disclaimer-detail"
          onClick={() => setOpen((v) => !v)}
          className="source-disclaimer-trigger"
        >
          <span aria-hidden className="flex-none text-[11px]">
            ⓘ
          </span>
          <span>자료별 유의사항 {open ? '닫기' : '보기'}</span>
        </button>
      </div>
    </footer>
  );
}
