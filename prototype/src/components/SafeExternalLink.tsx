import type { ReactNode } from 'react';
import { safeExternalUrl } from '../lib/safeExternalUrl';
export function SafeExternalLink({ href, children, className }: { href: unknown; children: ReactNode; className?: string }) {
  const safe = safeExternalUrl(href);
  return safe ? <a href={safe} target="_blank" rel="noopener noreferrer" className={className}>{children}</a> : <span className={className}>{children}</span>;
}
