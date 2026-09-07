import type { AppData, ProjectType } from '../types';
import { NumberField } from './NumberField';

const EOK = 1e8;

export function ProjectScalePicker({ data, value, capexKrw, annualRate, onChange, onCapex, onRate }: {
  data: AppData;
  value: ProjectType;
  capexKrw: number;
  annualRate: number;
  onChange: (value: ProjectType) => void;
  onCapex: (value: number) => void;
  onRate: (value: number) => void;
}) {
  const finance = data.constants.scoring.finance;
  return (
    <fieldset className="project-scale">
      <legend>데이터센터 규모</legend>
      <div className="scale-options">
        {Object.entries(data.constants.scoring.projectProfiles).map(([key, profile]) => (
          <label key={key} className={`scale-option ${value === key ? 'is-selected' : ''}`}>
            <input type="radio" name="project-scale" value={key} checked={value === key}
              onChange={() => onChange(key as ProjectType)} />
            <span>{profile.label}</span>
            <strong>{profile.targetMw}<small> MW</small></strong>
          </label>
        ))}
      </div>
      <div className="scale-assumptions">
        <div>
          <label>총사업비</label>
          <NumberField label="총사업비 (억원)" value={capexKrw / EOK}
            min={finance.capexRangeKrw[0] / EOK} max={finance.capexRangeKrw[1] / EOK}
            step={100} unit="억원" koreanUnits onChange={(value) => onCapex(Math.round(value) * EOK)} />
        </div>
        <div>
          <label>연 금리</label>
          <NumberField label="연 금리 (%)" value={Math.round(annualRate * 1000) / 10}
            min={Math.round(finance.rateRange[0] * 1000) / 10}
            max={Math.round(finance.rateRange[1] * 1000) / 10}
            step={0.1} decimals={1} unit="%" onChange={(value) => onRate(Math.round(value * 10) / 1000)} />
        </div>
      </div>
      <p className="scale-caption">규모를 바꾸면 MW당 약 {(finance.capexPerMwKrw / EOK).toLocaleString()}억원 기준의 기본 사업비와 연 {(finance.defaultAnnualRate * 100).toFixed(1)}% 금리가 적용됩니다. 이후 직접 조정할 수 있습니다.</p>
    </fieldset>
  );
}
