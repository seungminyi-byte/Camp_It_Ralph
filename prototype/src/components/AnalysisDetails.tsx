import type { AppData, ScoreResult } from '../types';
import { ScoreCard } from './ScoreCard';
import { fmtKrw } from '../lib/format';
import { summarizeRestriction } from '../scoring/restriction';
import { summarizeDisaster } from '../lib/disasterSummary';

export function AnalysisDetails({ result: r, data, onFlyTo }: { result: ScoreResult; data: AppData; onFlyTo: (lat: number, lng: number) => void }) {
  return <section className="analysis-details" aria-label="분야별 상세 분석">
    <div className="section-heading"><h3>상세 분석</h3><span>항목을 눌러 근거 확인</span></div>
    <details className="detail-row"><summary><span className="category-icon">ϟ</span><span>전력여건</span><b>{r.site.eligible ? `${r.power.score}점` : '판독불가'}</b></summary><div className="detail-body"><p>공급가능 변전소 {r.gate.substationCount}곳 · {r.power.capacityBand}</p><p>최근접 변전소: {r.power.nearestSubstation ? `${r.power.nearestSubstation.name} · ${r.power.nearestSubstation.distanceKm.toFixed(1)}km` : '미확인'}</p><p>사업 규모별 전력 적합성 감점 −{r.project.powerDeduction}점</p></div></details>
    <details className="detail-row"><summary><span className="category-icon">▤</span><span>인허가·부지</span><b>{r.site.eligible ? `${r.permit.score}점` : '판독불가'}</b></summary><div className="detail-body"><p>주거 인접 · 용도지역 · 지역 규제 · 갈등 사례를 종합합니다.</p>{r.permit.deductions.map((d, i) => <div className="deduction-item" key={i}><strong>{d.label}<span>−{d.points}</span></strong><p>{d.evidence}</p></div>)}</div></details>
    <details className="detail-row"><summary><span className="category-icon">△</span><span>지형</span><b>{r.terrain ? r.terrain.band : '미확인'}</b></summary><div className="detail-body"><p>{r.site.label} · {r.site.detail}</p>{r.terrain && <><p>중앙값 경사 {r.terrain.sample.slopeP50Deg}° · 표고 약 {r.terrain.sample.elevM}m</p><p>인허가 점수에 반영된 지형 감점 −{r.terrain.deduction}점</p><p>지형은 독립 점수 없이 기존 감점 기준을 표시합니다.</p></>}</div></details>
    <details className="detail-row"><summary><span className="category-icon">◇</span><span>재해위험지구</span><b>{r.disaster.status === 'hit' ? `검토 필요 · −${r.disaster.deduction}점` : r.disaster.status === 'none' ? '해당 없음' : '미확인'}</b></summary><div className="detail-body"><p>{summarizeDisaster(r.disaster)}</p>{r.disaster.status === 'hit' && <p>{data.constants.scoring.disaster.reviewNote}</p>}<p>지정구역 해당 시 인허가 점수에 {data.constants.scoring.disaster.deduction}점이 감점됩니다. 해당 없음은 전체 재해 안전을 보장하지 않습니다.</p></div></details>
    <details className="detail-row"><summary><span className="category-icon">◇</span><span>법정 보호·규제구역</span><b>{r.restriction.level === 'prohibited' ? '입지 제한 · E등급 상한' : r.restriction.level === 'conditional' ? '검토 필요' : r.restriction.checked.vworld !== 'ok' ? '일부 미확인' : '해당 없음'}</b></summary><div className="detail-body"><p>{summarizeRestriction(r.restriction)}</p></div></details>
    {r.site.eligible && <details className="detail-row"><summary><span className="category-icon">₩</span><span>사업 지연 영향</span><b>{fmtKrw(r.finance.delayCostKrw)}</b></summary><div className="detail-body"><p>예상 인허가 지연 {r.delay.minMonths}–{r.delay.maxMonths}개월</p><p>월 {fmtKrw(r.finance.monthlyCostKrw)} × 대표값 {r.delay.pointMonths}개월</p><p>참조 사례: {r.delay.anchor}</p></div></details>}
    <details className="detail-row full-evidence"><summary><span className="category-icon">≡</span><span>전체 평가 근거</span></summary><ScoreCard result={r} data={data} onFlyTo={onFlyTo} /></details>
  </section>;
}
