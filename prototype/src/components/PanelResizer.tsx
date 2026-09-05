import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

interface Props {
  width: number;
  min: number;
  max: number;
  defaultWidth: number;
  onChange: (width: number) => void;
}

/** The map keeps at least this much of the row, whatever `max` says. */
const MIN_MAP_PX = 360;

/**
 * Drag handle between the map and the side panel, lg+ only (the stacked mobile layout has no width
 * to trade). The panel is the row's last child, so its width is the row's right edge minus the
 * pointer. Keyboard: ←/→ 16px (Shift 64), Home/End = narrowest/widest, Enter or double-click resets.
 */
export function PanelResizer({ width, min, max, defaultWidth, onChange }: Props) {
  const [dragging, setDragging] = useState(false);
  const rowRight = useRef(0);

  const rowRect = (el: HTMLElement) => (el.parentElement ?? el).getBoundingClientRect();
  const clamp = (w: number, rowWidth: number) =>
    Math.round(Math.min(max, rowWidth - MIN_MAP_PX, Math.max(min, w)));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    rowRight.current = rowRect(e.currentTarget).right;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    onChange(clamp(rowRight.current - e.clientX, rowRect(e.currentTarget).width));
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    let next: number;
    if (e.key === 'ArrowLeft') next = width + step;
    else if (e.key === 'ArrowRight') next = width - step;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    else if (e.key === 'Enter') next = defaultWidth;
    else return;
    e.preventDefault();
    onChange(clamp(next, rowRect(e.currentTarget).width));
  };

  // Dragging across the page would otherwise select text and flicker the cursor.
  useEffect(() => {
    if (!dragging) return;
    document.body.classList.add('select-none', 'cursor-col-resize');
    return () => document.body.classList.remove('select-none', 'cursor-col-resize');
  }, [dragging]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="패널 너비 조절"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="드래그해 패널 너비 조절 · 더블클릭하면 기본 너비"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={(e) => onChange(clamp(defaultWidth, rowRect(e.currentTarget).width))}
      onKeyDown={onKeyDown}
      className={`hidden w-1.5 flex-none cursor-col-resize touch-none transition-colors hover:bg-blue-400 focus-visible:bg-blue-500 focus-visible:outline-none lg:block ${
        dragging ? 'bg-blue-500' : 'bg-gray-200'
      }`}
    />
  );
}
