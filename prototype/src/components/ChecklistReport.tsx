import type {
  AppData,
  LandUseSource,
  ScoreInput,
  ScoreResult,
  SiteSelection,
} from '../types';
import { LAND_USE_LABEL } from '../scoring/engine';
import { VERDICT_LABEL, type ChecklistRow } from '../report/checklist';
import type { ParsedMemo } from '../genai/memoFormat';
import { fmtArea, fmtKrw } from '../lib/format';
import {
  AreaReview,
  ConsultationReview,
  CostReview,
  EvidenceList,
} from './ReviewFacts';
export interface ReportProps {
  data: AppData;
  input: ScoreInput;
  result: ScoreResult;
  rows: ChecklistRow[];
  site: SiteSelection;
  landUseSource: LandUseSource;
  zoningName: string | null;
  memo: ParsedMemo | null;
  generatedBy: string | null;
  generatedAt: Date | null;
  variant: 'screen' | 'print';
}
export function ChecklistReport({
  data,
  input,
  result: r,
  rows,
  site,
  landUseSource,
  zoningName,
  memo,
  generatedBy,
  generatedAt,
  variant,
}: ReportProps) {
  const p = r.project.assumptions;
  return (
    <article className={`business-report report-${variant}`}>
      <section className="report-first-page">
        <header className="business-report-title">
          <span>데이터센터팀 · 후보 부지 1차 사업검토</span>
          <h1>후보 부지 검토 보고서</h1>
          <p>
            {site.label ??
              `${r.emd?.sigungu ?? ''} ${r.emd?.emd ?? '선택 지점'}`}{' '}
            · {site.lat.toFixed(5)}, {site.lng.toFixed(5)}
            <br />
            {new Date().toLocaleDateString('ko-KR')} · 현재 입력 및 조회 자료
            기준
          </p>
        </header>
        <div className={`report-decision tone-${r.review.tone}`}>
          <strong>{r.review.label}</strong>
          <p>현재 기록된 제약과 미확인 항목을 먼저 확인하세요.</p>
          {r.restriction.level === 'prohibited' && (
            <p className="restriction-alert">
              법정 보호·규제구역 해당으로 E등급으로 제한
            </p>
          )}
        </div>
        <h2>사업조건</h2>
        <p>
          {r.project.profile.label} · 목표 수전용량 {p.targetMw ?? '미입력'}MW ·{' '}
          {p.development === 'new' ? '신축' : '기존 건물 전환'} ·{' '}
          {p.areaMethod === 'manual'
            ? '계획 연면적 직접 입력'
            : '상세 설계조건으로 면적 계산'}
        </p>
        <p>
          대지 {fmtArea(r.conditions.landAreaM2)} ·{' '}
          {p.areaMethod === 'manual' ? '계획 연면적' : '산정 필요 연면적'}{' '}
          {fmtArea(r.area.requiredAreaM2)}
          {p.development === 'new'
            ? ` · 용적률 ${r.conditions.farPct ?? '미입력'}% · 건폐율 ${r.conditions.coveragePct ?? '미입력'}% · 지상 ${r.conditions.floors ?? '미입력'}층`
            : ` · 확보 건물 ${fmtArea(r.conditions.existingAreaM2)}`}
        </p>
        <h2>주요 제약·부족한 조건</h2>
        <ul className="report-priorities">
          {r.review.issues.slice(0, 3).map((i, n) => (
            <li key={n}>
              <b>{i.title}</b> — {i.detail}
            </li>
          ))}
        </ul>
        <h2>면적 검토</h2>
        <AreaReview result={r} />
        <h2>비용 시나리오</h2>
        <CostReview result={r} compact />
        <h2>우선 확인사항</h2>
        <p>{r.review.actions.slice(-2).join(' / ')}</p>
        <p>
          전력 공급·용수·통신 협의, 비용 누락 및 전체 확인사항은 다음 장에
          이어집니다.
        </p>
        <footer>
          스크리닝 참고용, 한전 공식 검토·법률 판단 대체 불가. 공공자료·사용자
          입력·계산 가정을 구분하여 후속 실사에 사용하세요.
        </footer>
      </section>
      <section className="report-detail-page">
        <h2>입력 조건과 협의 기록</h2>
        <p>
          용도지역: {LAND_USE_LABEL[input.landUse]} ·{' '}
          {landUseSource === 'manual'
            ? '사용자 선택'
            : (zoningName ?? '조회 미확인')}
        </p>
        <p>
          IT부하 {p.itMw ?? '미입력'}MW · 랙당 전력 {p.rackKw ?? '미입력'}kW ·
          통로 포함 랙당 면적 {p.rackAreaM2 ?? '미입력'}㎡ · 전산실 비중{' '}
          {p.whiteSpacePct ?? '미입력'}%
        </p>
        <ConsultationReview result={r} />
        <h2>사업비 상세</h2>
        <CostReview result={r} />
        <p>
          참고점수:{' '}
          {r.composite.score === null
            ? '미산정'
            : `${r.composite.score}점 · ${r.composite.grade}등급`}
          . 전력 {r.power.score ?? '미산정'}, 인허가{' '}
          {r.permit.score ?? '미산정'}. 점수만으로 사업 적합·부적합을 결정하지
          않습니다.
        </p>
        <p>
          평균 차입잔액은 총사업비와 구분합니다. 현재 입력:{' '}
          {fmtKrw(r.finance.debtKrw)}.
        </p>
        <h2>전체 추가 확인사항</h2>
        <ol>
          {r.review.actions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ol>
        <h2>항목별 근거</h2>
        <table className="business-checklist">
          <thead>
            <tr>
              <th>항목</th>
              <th>자료 상태와 근거</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th>
                  {row.group}
                  <br />
                  {row.title}
                </th>
                <td>
                  <b>{VERDICT_LABEL[row.verdict]}</b>
                  <p>{row.evidence}</p>
                  {row.sources.map((s, i) => (
                    <a key={i} href={s} target="_blank" rel="noreferrer">
                      출처 {i + 1}{' '}
                    </a>
                  ))}
                  {memo?.items[row.key] && (
                    <p className="ai-opinion">AI 의견: {memo.items[row.key]}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>자료 출처·기준일·공간 단위·한계</h2>
        <EvidenceList result={r} />
        {memo && (
          <section className="report-ai">
            <h2>추가 AI 검토 의견</h2>
            <p>
              {generatedBy} · {generatedAt?.toLocaleString('ko-KR')}
              {!memo.complete && ' · 일부만 생성됨'}
            </p>
            <p>{memo.overall}</p>
            <ul>
              {memo.actions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
            {memo.caveats.map((a, i) => (
              <p key={i}>{a}</p>
            ))}
          </section>
        )}
        <footer>
          {data.constants.disclaimer.main}
          <br />
          {data.constants.disclaimer.review}
        </footer>
      </section>
    </article>
  );
}
