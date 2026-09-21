/** Browsers name the PDF after the document title, so set it just for the print dialog. */
export function reportFileTitle(areaLabel: string | null, at: Date): string {
  const stamp =
    `${at.getFullYear()}` +
    `${String(at.getMonth() + 1).padStart(2, '0')}` +
    `${String(at.getDate()).padStart(2, '0')}`;
  const area = (areaLabel ?? '부지').replace(/[\s/\\:*?"<>|]/g, '');
  return `실사체크리스트_${area}_${stamp}`;
}

export function printWithTitle(title: string): void {
  const previous = document.title;
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const restore = () => {
    document.title = previous;
    focused?.focus();
    window.removeEventListener('afterprint', restore);
  };
  // Safari can return from print() before the dialog closes, so restore on the event, not inline.
  window.addEventListener('afterprint', restore);
  document.title = title;
  try { window.print(); } catch (error) { restore(); throw error; }
}
