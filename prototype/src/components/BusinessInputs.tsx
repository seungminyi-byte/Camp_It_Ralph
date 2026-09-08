import { useState } from 'react';
import type {
  AppData,
  CostItem,
  ProjectAssumptions,
  SiteConditions,
} from '../types';
import {
  CONSULTATION_LABELS,
  CONSULTATION_STATUS,
  COST_LABELS,
  convertArea,
} from '../lib/reviewInputs';

type Props = {
  data: AppData;
  project: ProjectAssumptions;
  conditions: SiteConditions;
  hasSite: boolean;
  onProject: (value: ProjectAssumptions) => void;
  onConditions: (value: SiteConditions) => void;
};
function NumberField({
  label,
  value,
  onChange,
  suffix,
  min = 0,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  suffix?: string;
  min?: number;
}) {
  return (
    <label className="review-field">
      <span>
        {label}
        {suffix && <small> ({suffix})</small>}
      </span>
      <input
        type="number"
        step="any"
        min={min}
        value={value !== null && Number.isFinite(value) ? value : ''}
        placeholder="미입력"
        onChange={(e) =>
          onChange(e.target.value === '' ? null : Number(e.target.value))
        }
      />
    </label>
  );
}
export function BusinessInputs({
  data,
  project: p,
  conditions: c,
  hasSite,
  onProject,
  onConditions,
}: Props) {
  const [unit, setUnit] = useState<'m2' | 'pyeong'>('m2');
  const factor = data.constants.scoring.review.m2PerPyeong;
  const project = (patch: Partial<ProjectAssumptions>) =>
    onProject({ ...p, ...patch });
  const conditions = (patch: Partial<SiteConditions>) =>
    onConditions({ ...c, ...patch });
  const area = (
    label: string,
    key: 'landAreaM2' | 'plannedAreaM2' | 'existingAreaM2',
  ) => (
    <NumberField
      label={label}
      suffix={unit === 'm2' ? '㎡' : '평'}
      value={
        c[key] === null
          ? null
          : Number(convertArea(c[key], 'm2', unit, factor).toFixed(6))
      }
      onChange={(v) =>
        conditions({
          [key]: v === null ? null : convertArea(v, unit, 'm2', factor),
        })
      }
    />
  );
  return (
    <details className="business-inputs" aria-label="사업조건 입력">
      <summary className="business-inputs-summary">
        <span>
          <strong>사업·설계 조건</strong>
          <small>선택 입력</small>
        </span>
        <em>입력하면 면적·비용 검토가 정교해집니다</em>
      </summary>
      <div className="business-inputs-body">
      <div className="review-fields">
        <label className="review-field">
          <span>사업 유형</span>
          <select
            value={p.type}
            onChange={(e) =>
              project({ type: e.target.value as ProjectAssumptions['type'] })
            }
          >
            {(['standard', 'small', 'hyperscale'] as const).map((t) => (
              <option key={t} value={t}>
                {data.constants.scoring.projectProfiles[t].label}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="목표 수전용량"
          suffix="MW"
          value={p.targetMw}
          onChange={(targetMw) => project({ targetMw })}
        />
        <label className="review-field">
          <span>개발 방식</span>
          <select
            value={p.development}
            onChange={(e) =>
              project({
                development: e.target
                  .value as ProjectAssumptions['development'],
              })
            }
          >
            <option value="new">신축</option>
            <option value="conversion">기존 건물 전환</option>
          </select>
        </label>
        <label className="review-field">
          <span>필요 면적 산정</span>
          <select
            value={p.areaMethod}
            onChange={(e) =>
              project({
                areaMethod: e.target.value as ProjectAssumptions['areaMethod'],
              })
            }
          >
            <option value="manual">계획 연면적 직접 입력</option>
            <option value="racks">상세 설계조건으로 계산</option>
          </select>
        </label>
      </div>
      <details
        className="input-details"
        open={p.areaMethod === 'racks' || undefined}
      >
        <summary>
          상세 설계조건 <span>선택 입력 · 기본점수와 별도</span>
        </summary>
        <p>
          입력하지 않아도 1차 입지점수는 산정됩니다. 입력하면 랙 수와 필요
          연면적을 계산해 설계 적합성 검토에 추가 반영합니다. 수전용량과
          IT부하는 다릅니다.
        </p>
        <div className="review-fields">
          <NumberField
            label="IT부하"
            suffix="MW"
            value={p.itMw}
            onChange={(itMw) => project({ itMw })}
          />
          <NumberField
            label="랙당 전력"
            suffix="kW"
            value={p.rackKw}
            onChange={(rackKw) => project({ rackKw })}
          />
          <NumberField
            label="통로 포함 랙당 면적"
            suffix="㎡"
            value={p.rackAreaM2}
            onChange={(rackAreaM2) => project({ rackAreaM2 })}
          />
          <NumberField
            label="전산실 면적 비중"
            suffix="%"
            value={p.whiteSpacePct}
            onChange={(whiteSpacePct) => project({ whiteSpacePct })}
          />
        </div>
      </details>
      <fieldset disabled={!hasSite}>
        <legend>선택 부지 조건</legend>
        {!hasSite && <p>주소를 검색하거나 지도에서 후보 부지를 선택하세요.</p>}
        <div className="unit-switch" role="group" aria-label="면적 표시 단위">
          <button
            type="button"
            aria-pressed={unit === 'm2'}
            onClick={() => setUnit('m2')}
          >
            ㎡
          </button>
          <button
            type="button"
            aria-pressed={unit === 'pyeong'}
            onClick={() => setUnit('pyeong')}
          >
            평
          </button>
        </div>
        <div className="review-fields">
          {area('대지면적', 'landAreaM2')}
          {p.areaMethod === 'manual' && area('계획 연면적', 'plannedAreaM2')}
          {p.development === 'conversion' ? (
            area('확보된 건물 연면적', 'existingAreaM2')
          ) : (
            <>
              <NumberField
                label="적용 용적률"
                suffix="%"
                value={c.farPct}
                onChange={(farPct) => conditions({ farPct })}
              />
              <NumberField
                label="적용 건폐율"
                suffix="%"
                value={c.coveragePct}
                onChange={(coveragePct) => conditions({ coveragePct })}
              />
              <NumberField
                label="계획 지상층수"
                suffix="층"
                value={c.floors}
                onChange={(floors) => conditions({ floors })}
              />
            </>
          )}
        </div>
        <p className="input-note">
          용적률·건폐율은 확인한 적용값을 입력하세요. 용도지역만으로 자동
          확정하지 않습니다.
        </p>
        <details className="input-details">
          <summary>
            사업비와 차입조건 <span>부지별 보관</span>
          </summary>
          <label className="review-field">
            <span>사업비 입력 방식</span>
            <select
              value={c.costMode}
              onChange={(e) =>
                conditions({
                  costMode: e.target.value as SiteConditions['costMode'],
                })
              }
            >
              <option value="items">항목별 입력</option>
              <option value="total">총사업비 직접 입력</option>
            </select>
          </label>
          <div className="review-fields">
            {c.costMode === 'total' ? (
              <NumberField
                label="총사업비"
                suffix="억원"
                value={c.totalCostKrw === null ? null : c.totalCostKrw / 1e8}
                onChange={(v) =>
                  conditions({ totalCostKrw: v === null ? null : v * 1e8 })
                }
              />
            ) : (
              (Object.keys(COST_LABELS) as CostItem[]).map((k) => (
                <NumberField
                  key={k}
                  label={COST_LABELS[k]}
                  suffix="억원"
                  value={c.costs[k] === null ? null : c.costs[k] / 1e8}
                  onChange={(v) =>
                    conditions({
                      costs: { ...c.costs, [k]: v === null ? null : v * 1e8 },
                    })
                  }
                />
              ))
            )}
            <NumberField
              label="지연 중 평균 차입잔액"
              suffix="억원"
              value={c.averageDebtKrw === null ? null : c.averageDebtKrw / 1e8}
              onChange={(v) =>
                conditions({ averageDebtKrw: v === null ? null : v * 1e8 })
              }
            />
          </div>
          <p className="input-note">
            비용은 동일한 범위·가격 기준으로 입력하세요. 지연 금융비용은
            별도이며, 확정된 0원과 미입력은 구분합니다. 총액 방식과 항목 방식은
            합산하지 않습니다.
          </p>
        </details>
        <details className="input-details">
          <summary>전력·용수·통신 협의 상태</summary>
          {(
            Object.keys(
              CONSULTATION_LABELS,
            ) as (keyof SiteConditions['consultations'])[]
          ).map((k) => {
            const v = c.consultations[k];
            const change = (patch: Partial<typeof v>) =>
              conditions({
                consultations: { ...c.consultations, [k]: { ...v, ...patch } },
              });
            return (
              <div className="consultation-fields" key={k}>
                <label className="review-field">
                  <span>{CONSULTATION_LABELS[k]} 협의</span>
                  <select
                    value={v.status}
                    onChange={(e) =>
                      change({ status: e.target.value as typeof v.status })
                    }
                  >
                    {(
                      Object.keys(CONSULTATION_STATUS) as (typeof v.status)[]
                    ).map((s) => (
                      <option key={s} value={s}>
                        {CONSULTATION_STATUS[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="review-field">
                  <span>{CONSULTATION_LABELS[k]} 확인 날짜</span>
                  <input
                    type="date"
                    value={v.date}
                    onChange={(e) => change({ date: e.target.value })}
                  />
                </label>
                <label className="review-field wide">
                  <span>{CONSULTATION_LABELS[k]} 확인 내용</span>
                  <textarea
                    rows={2}
                    value={v.note}
                    maxLength={2000}
                    placeholder="확인기관·조건·추가 확인사항"
                    onChange={(e) => change({ note: e.target.value })}
                  />
                </label>
              </div>
            );
          })}
          <p className="input-note">
            사용자 확인은 기록 상태입니다. 전력 공급·용수량·통신 인입 가능
            여부를 서비스가 보증하지 않습니다.
          </p>
        </details>
      </fieldset>
      <details className="input-details">
        <summary>
          금리·지연기간 가정 <span>후보 공통</span>
        </summary>
        <p>
          시장 예측이 아닌 계산 가정입니다. 차입잔액을 입력하면 비용표가
          계산됩니다.
        </p>
        <div className="review-fields">
          {p.rates.map((v, i) => (
            <NumberField
              key={`r${i}`}
              label={`금리 가정 ${i + 1}`}
              suffix="%"
              value={v * 100}
              onChange={(v) =>
                project({
                  rates: p.rates.map((r, j) =>
                    j === i ? (v === null ? NaN : v / 100) : r,
                  ) as ProjectAssumptions['rates'],
                })
              }
            />
          ))}
          {p.delays.map((v, i) => (
            <NumberField
              key={`d${i}`}
              label={`지연 가정 ${i + 1}`}
              suffix="개월"
              value={v}
              onChange={(v) =>
                project({
                  delays: p.delays.map((d, j) =>
                    j === i ? (v ?? NaN) : d,
                  ) as ProjectAssumptions['delays'],
                })
              }
            />
          ))}
        </div>
      </details>
      </div>
    </details>
  );
}
