import { useEffect, useRef, type ReactNode } from 'react';
import {
  compareSummary,
  type CompareEntry,
  type PinnedSite,
} from '../compare/pins';
import { summarizeRestriction } from '../scoring/restriction';
import { areaLabel, fmtArea, fmtCount, fmtKrw, fmtPopulation } from '../lib/format';
import { CostReview } from './ReviewFacts';
import { currentComparisonMessage, reviewGroups } from '../report/presentation';
import type { ScoreResult } from '../types';
export function CompareDialog({
  open,
  entries,
  currentPinId = null,
  onClose,
  onOpen,
  onRemove,
}: {
  open: boolean;
  entries: CompareEntry[];
  currentPinId?: string | null;
  onClose: () => void;
  onOpen: (pin: PinnedSite) => void;
  onRemove: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; dialog.current?.showModal(); }
    else if (dialog.current?.open) { dialog.current.close(); opener.current?.focus(); }
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
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const stops = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(element => element.getClientRects().length > 0);
        const first = stops[0], last = stops.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
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
        설계·금리 가정은 공통입니다. 면적·비용·협의 기록은
        부지별로 보관합니다. 후보는 현재 세션 동안 유지됩니다.
      </p>
      <p className="compare-caption">{currentComparisonMessage(entries, currentPinId)}</p>
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
      <div className="comparison-cards">{entries.map(({ pin, result }, index) => {
        const groups = reviewGroups(result);
        return <article key={pin.id}><h3>{index + 1}. {pin.selection.label ?? areaLabel(result)}{pin.id === currentPinId && ' · 현재 후보'}</h3><p>{pin.selection.lat.toFixed(5)}, {pin.selection.lng.toFixed(5)}</p>
          <h4>주요 제약</h4><p>{groups.constraints.map(issue => issue.title).join(' · ') || '현재 확인한 주요 제약 없음 · 미확인 자료 별도 확인'}</p>
          <h4>중요 미확인</h4><p>{groups.unknowns.map(issue => issue.title).join(' · ') || '추가 기록 없음'}</p>
          <p><b>면적:</b> {result.area.label}{result.area.shortfallM2 !== null && ` · 부족 ${fmtArea(result.area.shortfallM2)}`} · 최소 대지 {fmtArea(result.area.minimumLandM2)}</p>
          <p><b>{result.businessCost.label}:</b> {fmtKrw(result.businessCost.amountKrw)}{!result.businessCost.complete && ` · 미완료: ${result.businessCost.missing.join(' · ')}`}</p>
          <button className="text-button" onClick={() => { onOpen(pin); onClose(); }}>이 후보 조건 수정·지도 보기</button><button className="text-button" onClick={() => onRemove(pin.id)}>이 후보 제거</button>
        </article>;
      })}</div>
      {entries.length > 0 && (
        <div className="comparison-scroll" tabIndex={0} role="region" aria-label="항목별 후보 비교표 · 가로로 이동 가능">
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
              {row('주요 제약·미확인', (r) => (
                <>
                  <strong>{r.review.label}</strong>
                  <ul>
                    {r.review.issues.map((i, n) => (
                      <li key={n}>{i.title}</li>
                    ))}
                  </ul>
                </>
              ))}
              {row('다음 확인사항', (r) => <ol>{r.review.actions.map((action, index) => <li key={index}>{action}</li>)}</ol>)}
              {row(
                '사업조건',
                (r) =>
                  `수전 ${r.project.assumptions.targetMw ?? '미입력'}MW · ${r.project.assumptions.development === 'new' ? '신축' : '기존 건물 전환'}`,
              )}
              {row(
                '대지 / 필요 연면적',
                (r) =>
                  `${fmtArea(r.conditions.landAreaM2)} / ${fmtArea(r.area.requiredAreaM2)}`,
              )}
              {row('이론상 최소 대지', r => fmtArea(r.area.minimumLandM2))}
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
                  `${fmtPopulation(r.permit.popNearby)} / ${fmtCount(r.permit.householdsNearby, '가구')}${r.permit.householdMissingCells ? ' (가구 일부 미확인)' : ''}`,
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
              {row('자료 상태·기준', r => <ul>{r.evidence.map(e => <li key={e.key}>{e.title}: {e.status === 'available' ? '자료 확인' : e.status === 'partial' ? '일부 미확인' : '미확인'} · {e.period}</li>)}</ul>)}
              {row('참고점수', (r) =>
                r.composite.score === null
                  ? `미산정${r.composite.grade === 'E' ? ' · 법적 입지 제한 E등급 상한' : ''} · ${r.composite.unavailableReasons.join(' · ')}`
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
