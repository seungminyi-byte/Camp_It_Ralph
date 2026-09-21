export const routes = ['/', '/project', '/team', '/review'] as const;
export type Route = typeof routes[number];
export function canonicalPath(path: string): string {
  const clean = path.replace(/\/+$/, '') || '/';
  return routes.includes(clean as Route) ? clean : path;
}
export function shouldNavigate(event: { button: number; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; defaultPrevented: boolean }, anchor: HTMLAnchorElement): boolean {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && !anchor.hasAttribute('download') && (!anchor.target || anchor.target === '_self') && anchor.origin === window.location.origin && !anchor.hash;
}
