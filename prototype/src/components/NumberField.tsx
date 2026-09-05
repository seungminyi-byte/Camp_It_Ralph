import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { clampRound, formatNumber, parseAmount } from '../lib/numberInput';

export interface Preset {
  label: string;
  value: number;
}

interface Props {
  /** aria-label for the input */
  label: string;
  /** current value in display units (억원, %) */
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  unit: string;
  presets?: Preset[];
  /** accept "1.5조" / "3000억" (result in 억) */
  koreanUnits?: boolean;
  caption?: ReactNode;
  onChange: (value: number) => void;
}

/**
 * Number input with −/+ buttons, ↑/↓ keys (Shift ×10) and preset chips. The field shows the
 * formatted value until focused, then edits the raw text; blur or Enter commits (clamped, rounded),
 * Escape or unparseable text reverts to the current value.
 */
export function NumberField({
  label,
  value,
  min,
  max,
  step,
  decimals = 0,
  unit,
  presets = [],
  koreanUnits = false,
  caption,
  onChange,
}: Props) {
  // null = not editing: the input shows the formatted prop value.
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectOnEdit = useRef(false);

  useEffect(() => {
    if (draft !== null && selectOnEdit.current) {
      selectOnEdit.current = false;
      inputRef.current?.select();
    }
  }, [draft]);

  const commit = (v: number) => onChange(clampRound(v, min, max, decimals));
  const commitDraft = () => {
    if (draft === null) return;
    const parsed = parseAmount(draft, { koreanUnits });
    if (parsed !== null) commit(parsed);
    setDraft(null);
  };
  const nudge = (dir: 1 | -1, big = false) => {
    const base = (draft !== null ? parseAmount(draft, { koreanUnits }) : null) ?? value;
    setDraft(null);
    commit(base + dir * step * (big ? 10 : 1));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitDraft();
      e.currentTarget.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      nudge(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
    } else if (e.key === 'Escape') {
      setDraft(null);
    }
  };
  const isActive = (p: Preset) => Math.abs(p.value - value) < step / 2;
  const stepBtn =
    'w-7 flex-none rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-100';

  return (
    <div>
      <div className="flex items-stretch gap-1">
        <button type="button" aria-label={`${label} 줄이기`} onClick={() => nudge(-1)} className={stepBtn}>
          −
        </button>
        <div className="flex min-w-0 flex-1 items-center rounded border border-gray-300 bg-white focus-within:border-blue-500">
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            aria-label={label}
            value={draft ?? formatNumber(value, decimals)}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => {
              selectOnEdit.current = true;
              setDraft(String(value));
            }}
            onBlur={commitDraft}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 bg-transparent px-2 py-1 text-right text-sm tabular-nums outline-none"
          />
          <span className="flex-none pr-2 text-xs text-gray-500">{unit}</span>
        </div>
        <button type="button" aria-label={`${label} 늘리기`} onClick={() => nudge(1)} className={stepBtn}>
          +
        </button>
      </div>
      {presets.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={isActive(p)}
              onClick={() => commit(p.value)}
              className={`rounded border px-1.5 py-0.5 text-[11px] ${
                isActive(p)
                  ? 'border-blue-500 bg-blue-50 font-semibold text-blue-800'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      {caption && <div className="mt-1 text-[11px] leading-snug text-gray-500">{caption}</div>}
    </div>
  );
}
