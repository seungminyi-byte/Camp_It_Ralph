import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The report is rendered into a body-level node, not inside #root: the app shell uses
 * height:100% with scrolling panes, which clips printed output to a single page.
 * It stays mounted while the workspace is active so print never races a state update.
 * Hidden workspaces must remove this body-level portal entirely.
 */
export function PrintPortal({ active, children }: { active: boolean; children: ReactNode }) {
  if (!active) return null;
  return createPortal(
    <div id="print-root" className="hidden print:block">
      {children}
    </div>,
    document.body,
  );
}
