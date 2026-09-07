import { useEffect, useRef } from 'react';
import type { CompareEntry, PinnedSite } from '../compare/pins';
import { areaLabel, fmtKrw } from '../lib/format';
import { siteVerdict } from '../lib/verdict';

export function CompareDialog({ open, entries, onClose, onOpen, onRemove }: {
  open: boolean; entries: CompareEntry[]; onClose: () => void;
  onOpen: (pin: PinnedSite) => void; onRemove: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  return <dialog className="compare-dialog" ref={dialog} onCancel={onClose} onClose={onClose} aria-labelledby="compare-title">
    <header><div><span className="eyebrow">SAVED SITES</span><h2 id="compare-title">후보지 비교 <small>{entries.length}곳</small></h2></div><button className="icon-button" onClick={onClose} aria-label="후보지 비교 닫기">×</button></header>
    <p className="compare-caption">같은 규모·사업비·금리로 비교합니다. 후보지는 현재 세션 동안 유지됩니다.</p>
    {entries.length < 2 && <p className="compare-caption">{entries.length ? '후보지를 하나 더 담으면 나란히 비교할 수 있습니다.' : '담긴 후보지가 없습니다. 지도에서 부지를 선택해 주세요.'}</p>}
    {entries.length > 0 && <div className="comparison-scroll"><table><thead><tr><th scope="col">평가 항목</th>{entries.map(({ pin, result }) => <th scope="col" key={pin.id}>{areaLabel(result, pin.selection.label ?? '선택 부지')}<small>{pin.selection.lat.toFixed(4)}, {pin.selection.lng.toFixed(4)}</small></th>)}</tr></thead><tbody>
      <tr><th scope="row">종합 점수</th>{entries.map(({ pin, result }) => <td key={pin.id}><strong className="comparison-score">{result.composite.score}</strong> / 100 · {result.composite.grade}등급</td>)}</tr>
      <tr><th scope="row">핵심 판단</th>{entries.map(({ pin, result }) => <td key={pin.id}>{siteVerdict(result, pin.landUse === 'unknown').label}</td>)}</tr>
      <tr><th scope="row">사업 규모</th>{entries.map(({ pin, result }) => <td key={pin.id}>{result.project.profile.targetMw}MW</td>)}</tr>
      <tr><th scope="row">전력 / 인허가</th>{entries.map(({ pin, result }) => <td key={pin.id}>{result.power.score}점 / {result.permit.score}점</td>)}</tr>
      <tr><th scope="row">재해위험지구</th>{entries.map(({ pin, result }) => <td key={pin.id}>{result.disaster.status === 'hit' ? `검토 필요 · −${result.disaster.deduction}점` : result.disaster.status === 'none' ? '해당 없음' : '미확인'}</td>)}</tr>
      <tr><th scope="row">예상 지연</th>{entries.map(({ pin, result }) => <td key={pin.id}>{result.delay.minMonths}–{result.delay.maxMonths}개월</td>)}</tr>
      <tr><th scope="row">지연 금융비용</th>{entries.map(({ pin, result }) => <td key={pin.id}>{fmtKrw(result.finance.delayCostKrw)}</td>)}</tr>
      <tr><th scope="row">후보 관리</th>{entries.map(({ pin }) => <td key={pin.id}><button className="text-button" onClick={() => { onOpen(pin); onClose(); }}>지도에서 보기</button><button className="text-button" onClick={() => onRemove(pin.id)}>후보에서 제거</button></td>)}</tr>
    </tbody></table></div>}
  </dialog>;
}
