import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The report is rendered into a body-level node, not inside #root: the app shell uses
 * height:100% with scrolling panes, which clips printed output to a single page.
 * It stays mounted (hidden on screen) so window.print() never races a state update.
 */
export function PrintPortal({ children }: { children: ReactNode }) {
  return createPortal(
    <div id="print-root" className="hidden print:block">
      {children}
    </div>,
    document.body,
  );
}
