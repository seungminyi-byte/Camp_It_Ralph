import { useEffect, useRef, type ReactNode } from 'react';
import {
  compareSummary,
  type CompareEntry,
  type PinnedSite,
} from '../compare/pins';
import { summarizeRestriction } from '../scoring/restriction';
import { areaLabel, fmtArea, fmtCount, fmtKrw } from '../lib/format';
import { CostReview } from './ReviewFacts';
import type { ScoreResult } from '../types';
export function CompareDialog({
  open,
  entries,
  onClose,
  onOpen,
  onRemove,
}: {
  open: boolean;
  entries: CompareEntry[];
  onClose: () => void;
  onOpen: (pin: PinnedSite) => void;
  onRemove: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const summary = compareSummary(entries);
  const row = (label: string, render: (r: ScoreResult) => ReactNode) => (
    <tr>
      <th scope="row">{label}</th>
      {entries.map(({ pin, result }) => (
        <td key={pin.id}>{render(result)}</td>
      ))}
    </tr>
  );
  return (
    <dialog
      className="compare-dialog"
      ref={dialog}
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="compare-title"
    >
      <header>
        <div>
          <span className="eyebrow">후보 부지</span>
          <h2 id="compare-title">
            후보지 비교 <small>{entries.length}곳</small>
          </h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="후보지 비교 닫기"
        >
          ×
        </button>
      </header>
      <p className="compare-caption">
        사업 유형·규모·설계·금리 가정은 공통입니다. 면적·비용·협의 기록은
        부지별로 보관합니다. 후보는 현재 세션 동안 유지됩니다.
      </p>
      {entries.length < 2 && (
        <p className="compare-caption">
          후보를 2곳 이상 담으면 비교할 수 있습니다.
        </p>
      )}
      {entries.length > 1 && (
        <p className="compare-caption">
          {summary
            ? `입력 사업비 차이: ${fmtKrw(summary.diffKrw)} (최대 − 최소). 동일한 비용 범위·가격 기준인지 확인하세요.`
            : '사업비 차액 계산 보류 — 모든 후보의 비용 입력이 완전하고 같은 방식·범위일 때 계산합니다.'}
        </p>
      )}
      {entries.length > 0 && (
        <div className="comparison-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">검토 항목</th>
                {entries.map(({ pin, result }) => (
                  <th scope="col" key={pin.id}>
                    {pin.selection.label ?? areaLabel(result)}
                    <small>
                      {pin.selection.lat.toFixed(4)},{' '}
                      {pin.selection.lng.toFixed(4)}
                    </small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {row('우선 검토', (r) => (
                <>
                  <strong>{r.review.label}</strong>
                  <ul>
                    {r.review.issues.slice(0, 3).map((i, n) => (
                      <li key={n}>{i.title}</li>
                    ))}
                  </ul>
                </>
              ))}
              {row(
                '사업조건',
                (r) =>
                  `${r.project.profile.label} · 수전 ${r.project.assumptions.targetMw ?? '미입력'}MW · ${r.project.assumptions.development === 'new' ? '신축' : '기존 건물 전환'}`,
              )}
              {row(
                '대지 / 필요 연면적',
                (r) =>
                  `${fmtArea(r.conditions.landAreaM2)} / ${fmtArea(r.area.requiredAreaM2)}`,
              )}
              {row('면적 검토', (r) => (
                <>
                  {r.area.label}
                  {r.area.status === 'shortfall' && (
                    <p>부족 {fmtArea(r.area.shortfallM2)}</p>
                  )}
                </>
              ))}
              {row(
                '전력 자료',
                (r) =>
                  `목록 ${fmtCount(r.power.listedCount, '곳')} · 최근접 OSM ${r.power.nearestSubstation ? `직선 ${r.power.nearestSubstation.distanceKm.toFixed(2)}km` : '미확인'} · 공급 용량 미확인`,
              )}
              {row(
                '주변 인구 / 가구',
                (r) =>
                  `${fmtCount(r.permit.popNearby, '명')} / ${fmtCount(r.permit.householdsNearby, '가구')}${r.permit.householdMissingCells ? ' (가구 일부 미확인)' : ''}`,
              )}
              {row('법정 보호·규제구역', (r) => (
                <span
                  className={
                    r.restriction.level === 'prohibited'
                      ? 'restriction-text'
                      : ''
                  }
                >
                  {summarizeRestriction(r.restriction)}
                </span>
              ))}
              {row('재해위험지구', (r) =>
                r.disaster.status === 'hit'
                  ? '해당 · 관할기관 검토 필요'
                  : r.disaster.status === 'none'
                    ? '조회 구역 해당 없음'
                    : '미확인',
              )}
              {row('비용 시나리오', (r) => (
                <CostReview result={r} compact />
              ))}
              {row('참고점수', (r) =>
                r.composite.score === null
                  ? `미산정${r.composite.grade === 'E' ? ' · 법적 입지 제한 E등급 상한' : ''}`
                  : `${r.composite.score}점 · ${r.composite.grade}등급`,
              )}
              <tr>
                <th scope="row">후보 관리</th>
                {entries.map(({ pin }) => (
                  <td key={pin.id}>
                    <button
                      className="text-button"
                      onClick={() => {
                        onOpen(pin);
                        onClose();
                      }}
                    >
                      조건 수정·지도 보기
                    </button>
                    <button
                      className="text-button"
                      onClick={() => onRemove(pin.id)}
                    >
                      후보에서 제거
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </dialog>
  );
}
