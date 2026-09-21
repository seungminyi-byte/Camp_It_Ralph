import type { ReportProps } from '../components/ChecklistReport';
export type ReportSnapshot = Omit<ReportProps, 'variant'> & { capturedAt: string; snapshotId: string; sourceRevision: string };
let sequence = 0;
function freezeTree<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freezeTree);
  }
  return value;
}
/** Only data consumed by the report is copied; nationwide geometries are not part of a report. */
export function captureReport(props: Omit<ReportProps, 'variant'>, sourceRevision: string, now = new Date()): ReportSnapshot {
  return freezeTree(structuredClone({ ...props, data: { constants: props.data.constants }, sourceRevision,
    capturedAt: now.toISOString(), snapshotId: `R-${now.toISOString().replace(/\D/g, '').slice(0, 14)}-${++sequence}`,
  }));
}
