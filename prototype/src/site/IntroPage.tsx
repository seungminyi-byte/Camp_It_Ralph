import { pageTitles } from './pageTitles';

const steps = [
  ['주소로 시작', '주소·읍면동·위경도를 검색하거나 지도에서 후보를 선택합니다. 읍면동 중심과 실제 필지는 구분해 확인하세요.'],
  ['근거를 먼저 확인', '공개자료에서 확인한 주요 제약, 중요한 미확인 사항, 다음 확인사항을 읽습니다.'],
  ['조건을 더해 비교', '필요할 때 면적·비용·협의 내용을 입력합니다. 공통 사업조건으로 최대 4곳을 비교합니다.'],
  ['보고서로 연결', '첫 장 요약과 상세 근거를 보고서로 열고 A4 PDF로 저장해 후속 협의를 준비합니다.'],
];
function StartLink({ children = '부지 검토 시작' }: { children?: string }) {
  return <a className="site-cta" href="/review">{children}<span aria-hidden="true">↗</span></a>;
}
function Flow() {
  return <ol className="site-flow">{steps.map(([title, body], i) => <li key={title}><span className="step-number">0{i + 1}</span><h3>{title}</h3><p>{body}</p></li>)}</ol>;
}
function Closing() {
  return <section className="site-closing"><div><span className="site-eyebrow">다음 검토의 출발점</span><h2>제안받은 주소부터<br />살펴보세요.</h2><p>내부 사업정보나 AI 없이도 기본 검토와 보고서를 사용할 수 있습니다.</p></div><StartLink /></section>;
}
function HomePage() {
  return <>
    <section className="home-hero">
      <div className="hero-copy"><p className="site-eyebrow">GS건설 데이터센터 개발·사업검토 실무자를 위한 도구</p><h1 id="page-title" tabIndex={-1}>후보 부지의 <br />첫 검토를,<br /><em>같은 기준으로.</em></h1><p className="hero-description">전력·입지·주변 현황의 흩어진 자료를<br className="wide-only" /> 주요 제약, 미확인 조건, 다음 질문으로 정리합니다.</p><div className="hero-actions"><StartLink /><a className="text-link" href="/project">어떻게 검토하나요? <span aria-hidden="true">→</span></a></div><p className="hero-note">공개자료로 시작 · 상세조건은 선택 · AI 없이 보고서</p></div>
      <figure className="product-example"><div className="example-heading"><span className="example-dot" />점수로 살펴보는 검토 예시<span>가정 조건 예시</span></div><a href="/images/product/review-score-example.png" target="_blank" rel="noreferrer" aria-label="참고점수 산정 예시 크게 보기 (새 탭)"><picture><source media="(max-width: 1023px)" srcSet="/images/product/review-score-example-mobile.png" width="716" height="886" /><img src="/images/product/review-score-example.png" width="1130" height="818" fetchPriority="high" alt="실제 제품 화면으로 만든 가정 조건 예시. 세종 반곡동 참고점수 77점, B등급과 입력 면적 충족 결과. 실제 부지 판정이 아닙니다." /></picture></a><figcaption><strong>공개자료·합성 검증 예시 · 실제 부지 판정 아님</strong><span>고정 조회 응답과 합성 사업조건으로 생성한 결과입니다. <a href="/project#example">예시 조건 확인 →</a></span></figcaption></figure>
    </section>
    <section className="site-section home-principles"><div className="section-intro"><span className="site-eyebrow">답을 내리기 전에, 근거부터</span><h2>확인된 것과<br />남은 질문을 함께.</h2><p>자료를 모으는 일에서 한 걸음 더.<br />어떤 후보를 추가 확인할지 논의할 수 있도록 돕습니다.</p></div><div className="principle-list"><article><span>01</span><div><h3>무엇이 제약인지</h3><p>공개자료에서 확인한 입지 제약과 검토 신호를 출처와 함께 읽습니다.</p></div></article><article><span>02</span><div><h3>무엇을 아직 모르는지</h3><p>조회 실패, 자료 결측, 미입력 조건을 그대로 남깁니다. 미확인을 제약 없음으로 바꾸지 않습니다.</p></div></article><article><span>03</span><div><h3>다음에 무엇을 물을지</h3><p>공급기관·관할기관·설계 담당자에게 확인할 질문을 비교 결과와 보고서에 연결합니다.</p></div></article></div></section>
    <section className="site-section"><div className="section-heading-copy"><span className="site-eyebrow">주소에서 보고서까지</span><h2>필요한 만큼 입력하고,<br />같은 조건으로 비교합니다.</h2></div><Flow /></section>
    <section className="home-team-link"><div><span className="site-eyebrow">만든 사람들 · 캠핑왕 랄프</span><h2>우리가 계약서를 덮고<br />지도를 편 이유</h2><p>분쟁 자문과 계약 검토에서 시작된 질문을,<br />부지 선택 단계의 도구로 만들고 있습니다.</p><a className="text-link" href="/team">우리의 이야기 <span aria-hidden="true">→</span></a></div><img src="/images/team/team-back-wide-800.webp" width="800" height="600" loading="lazy" alt="등번호 52가 보이는 유니폼을 입고 함께 선 캠핑왕 랄프 팀원들의 뒷모습" /></section>
    <Closing />
  </>;
}
function ProjectPage() {
  return <>
    <header className="editorial-heading"><p className="site-eyebrow">프로젝트 소개</p><h1 id="page-title" tabIndex={-1}>첫 검토에서 필요한 것은<br /><em>결론보다 확인할 근거.</em></h1><p>‘여기 DC 돼요?’는 제안받은 데이터센터 후보 부지를<br className="wide-only" /> 같은 기준으로 정리하고 비교하는 1차 사업검토 도구입니다.</p></header>
    <section className="site-section editorial-grid"><div><span className="site-eyebrow">기획 배경</span><h2>주소 하나 뒤에<br />여러 확인이 남습니다.</h2></div><div className="prose"><p>데이터센터 개발·사업검토 담당자는 후보지를 제안받으면 전력, 입지 제약, 재해, 주변 현황을 확인하고 면적·비용·공급 협의 조건을 보완해야 합니다.</p><p>자료는 여러 곳에 흩어져 있고 기준일과 공간 단위도 다릅니다. 자료를 찾은 뒤에도 확인한 사실과 아직 모르는 조건을 정리해 후보를 비교하고, 다음 담당자에게 확인할 질문을 넘기는 일이 남습니다.</p><p>이 도구는 그 첫 정리를 돕도록 설계했습니다. 실제 업무시간이나 절감 효과는 아직 측정하지 않았습니다.</p><p className="source-note">복수의 검토 조건이라는 배경은 <a href="https://www.iea.org/reports/key-questions-on-energy-and-ai/executive-summary" target="_blank" rel="noreferrer">IEA의 에너지·AI 분석</a>을 참고했습니다. GS건설의 업무 소요시간을 입증하는 자료는 아닙니다.</p></div></section>
    <section className="site-section"><div className="section-heading-copy"><span className="site-eyebrow">사용 절차</span><h2>기본 검토는 주소부터.<br />상세조건은 필요할 때.</h2></div><Flow /></section>
    <section className="site-section"><div className="section-heading-copy"><span className="site-eyebrow">주요 기능</span><h2>근거를 읽고, 가정을 더하고,<br />후속 확인으로 이어갑니다.</h2></div><div className="feature-grid"><article><h3>지도와 공개자료</h3><p>선택한 위치의 전력 공개 목록, 입지·재해 자료, 인구·가구·학교 등 주변 현황을 살펴봅니다. 지도 레이어와 실제 조회 상태를 구분합니다.</p></article><article><h3>면적·비용·협의 기록</h3><p>공통 사업조건과 부지별 조건을 나눠 입력합니다. 부족한 면적과 입력된 비용을 계산하고, 빠진 항목은 미확인으로 남깁니다.</p></article><article><h3>최대 4곳 비교</h3><p>담은 후보의 제약·미확인·면적·비용을 같은 형식으로 비교합니다. 비용 방식과 입력 범위가 다르면 차액 비교를 보류합니다.</p></article><article><h3>요약에서 상세 근거까지</h3><p>보고서 첫 장에서 위치, 제약, 중요한 미확인, 후보 비교와 다음 확인사항을 봅니다. 이어지는 상세에서 출처와 입력 가정을 확인합니다.</p></article></div></section>
    <section className="site-section" id="sources"><div className="section-heading-copy"><span className="site-eyebrow">자료와 활용 범위</span><h2>자료를 읽을 때,<br />기준일과 한계도 함께.</h2><p>각 검토 결과와 보고서에 자료별 출처·기준일·범위를 표시합니다.<br />온라인 조회시각은 원자료의 기준일을 뜻하지 않습니다.</p></div><div className="source-table-wrap" role="region" aria-label="공개자료 활용 범위"><table className="site-source-table"><caption className="sr-only">공개자료별 쓰임과 확인할 한계</caption><thead><tr><th scope="col">자료</th><th scope="col">검토에 쓰는 내용</th><th scope="col">남겨 두는 확인</th></tr></thead><tbody>
      <tr><th scope="row"><a href="https://www.data.go.kr/data/15128065/fileData.do" target="_blank" rel="noreferrer">한전 공개 목록</a><span>행정구역별 등재</span></th><td data-label="검토에 쓰는 내용">공개 목록의 공급변전소 등재 여부</td><td data-label="남겨 두는 확인">실제 연결 변전소·공급 가능량·계통 협의</td></tr>
      <tr><th scope="row"><a href="https://www.vworld.kr/" target="_blank" rel="noreferrer">VWorld</a><span>온라인 조회 상태·시각 별도 표시</span></th><td data-label="검토에 쓰는 내용">용도지역·규제구역·재해위험지구 관찰</td><td data-label="남겨 두는 확인">최신 고시 도면·개별 법적 적용·조회 누락</td></tr>
      <tr><th scope="row"><a href="https://sgis.kostat.go.kr/" target="_blank" rel="noreferrer">SGIS 인구·가구</a><span>2024년 · 1km 격자</span></th><td data-label="검토에 쓰는 내용">반경 내 격자 중심점의 참고 합계</td><td data-label="남겨 두는 확인">결측·부분 합계·실제 거주와 수용성</td></tr>
      <tr><th scope="row"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a><span>위치 참고자료</span></th><td data-label="검토에 쓰는 내용">지도·변전소 등 위치와 직선거리</td><td data-label="남겨 두는 확인">실제 인입 경로·시설 속성·공급 조건</td></tr>
      <tr><th scope="row">보호지역·지형 번들<span>국립공원 2024 / KDPA 2016 / SRTM 2000 촬영</span></th><td data-label="검토에 쓰는 내용">보호지역 중첩과 주변 지형 참고</td><td data-label="남겨 두는 확인">이후 변경·매립·고시 경계·현장 지반</td></tr>
      <tr><th scope="row">사용자 입력<span>설계·비용·협의 가정</span></th><td data-label="검토에 쓰는 내용">선택한 가정의 면적·비용·금융비용</td><td data-label="남겨 두는 확인">실설계·견적·공급기관 확인과 확약</td></tr>
    </tbody></table></div><p className="source-note">번들 전체가 최신 자료라는 뜻은 아닙니다. 구체적인 출처 링크와 기준일은 검토 결과의 ‘근거 출처·기준일·범위’와 보고서에서 확인하세요.</p></section>
    <section className="site-section editorial-grid" id="example"><div><span className="site-eyebrow">메인 화면 예시의 조건</span><h2>실제 제품 결과,<br />합성 검증 입력.</h2></div><div className="prose"><p>메인 예시는 세종 지역의 공개 좌표(36.4967, 127.3007)에 계획 연면적 30,000㎡, 확보 대지 20,000㎡, 용적률 200%, 건폐율 50%, 지상 4층을 입력한 제품 화면 발췌입니다.</p><p>공업지역·추가 규제 및 재해위험지구 적중 없음이라는 가정과 저장소의 공개자료를 사용했습니다. 참고점수 77점·B등급, 필요 대지 15,000㎡ 대비 확보 20,000㎡로 표시됩니다. 2026년 9월 22일 생성한 검증 예시이며 해당 위치의 실제 용도지역·규제 상태나 사업 가능성에 관한 판단이 아닙니다.</p><a className="text-link" href="/images/product/review-score-example.png" target="_blank" rel="noreferrer">예시 화면 크게 보기 ↗</a></div></section>
    <section className="site-boundary"><span className="site-eyebrow">도구의 역할</span><h2>기본 검토와 보고서는<br />AI 없이도 가능합니다.</h2><p>AI 의견은 선택 기능입니다. 기본 검토 결과와 구분해 읽고, 공급 가능량·인허가·사업 적합성은 담당 기관과 전문가의 후속 검토로 확인하세요.</p><strong>스크리닝 참고용, 한전 공식 검토·법률 판단 대체 불가</strong></section><Closing />
  </>;
}
function TeamPage() {
  return <>
    <section className="team-hero"><div><p className="site-eyebrow">캠핑왕 랄프 · OUR STORY</p><h1 id="page-title" tabIndex={-1}>우리가 계약서를 덮고 <br /><em>지도를 편 이유</em></h1><p className="team-lead">분쟁이 생기기 전에,<br />첫 선택에서 위험을 살펴볼 수 있다면.</p><p>우리는 GS건설 국내법무팀에서 함께 일하는 변호사들입니다. 이번 해커톤을 위해 ‘캠핑왕 랄프’라는 이름으로 모였습니다.</p><p>데이터센터 관련 분쟁 자문과 계약 검토를 하며, 부지를 고르는 첫 선택이 이후 사업에 얼마나 큰 영향을 미치는지 체감했습니다.</p></div><figure className="team-front"><img src="/images/team/team-front-800.webp" srcSet="/images/team/team-front-480.webp 480w, /images/team/team-front-800.webp 800w, /images/team/team-front-1200.webp 1200w" sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1100px) 42vw, 520px" width="1200" height="1600" fetchPriority="high" alt="PLAI CAMP 행사장에서 함께 선 캠핑왕 랄프 팀원 세 명" /><figcaption>PLAI CAMP에서 함께한 캠핑왕 랄프</figcaption></figure></section>
    <section className="site-section editorial-grid"><div><span className="site-eyebrow">경험에서 출발한 질문</span><h2>검토의 시점을<br />조금 앞당겨 보면.</h2></div><div className="prose"><p>계약과 분쟁을 검토할 때 만나는 문제를, 부지 선택 단계에서 미리 살펴볼 수 있다면 어떨까요? 확인한 사실과 아직 모르는 조건이 함께 보인다면 다음 질문도 더 구체적으로 만들 수 있을 것입니다.</p><p>그 생각을 직접 도구로 만들고 싶어 해커톤에 참여했습니다. ‘여기 DC 돼요?’는 그렇게 시작됐습니다.</p><p>법무 경험에서 나온 질문이지만, 이 도구를 사용할 사람은 데이터센터 개발·사업검토 담당자입니다. 후보를 검토하고 비교하며 다음 협의를 준비하는 흐름에 맞추어 만들고 있습니다.</p></div></section>
    <section className="team-making"><span className="site-eyebrow">업무의 질문을 직접 만드는 경험</span><h2>법률 업무에서 익힌 도구 만들기를,<br />새로운 문제로 이어갑니다.</h2><div className="feature-grid"><article><span className="small-status">개발 중</span><h3>새로운 법무시스템</h3><p>현재 사내 법무관리시스템을 대체할 새로운 법무시스템을 Codex와 함께 개발하고 있습니다. 일하는 사람의 질문을 기능으로 구체화하는 경험을 쌓고 있습니다.</p></article><article><span className="small-status">직접 제작·활용</span><h3>법률 문서 플러그인과 스킬</h3><p>소송 서면과 법률 의견서 작성을 위한 플러그인과 스킬을 직접 만들어 업무에 활용하고 있습니다. 근거와 미확인을 구분하는 태도를 이번 도구에도 담았습니다.</p></article></div></section>
    <figure className="team-back"><picture><source media="(max-width: 600px)" srcSet="/images/team/team-back-portrait-480.webp 480w, /images/team/team-back-portrait-800.webp 800w" sizes="calc(100vw - 32px)" width="800" height="1067" /><img src="/images/team/team-back-wide-1440.webp" srcSet="/images/team/team-back-wide-800.webp 800w, /images/team/team-back-wide-1440.webp 1440w" sizes="(max-width: 1200px) calc(100vw - 48px), 1120px" width="1440" height="1080" loading="lazy" alt="등번호 52가 보이는 유니폼을 입고 팔을 든 캠핑왕 랄프 팀원 세 명의 뒷모습" /></picture><figcaption>같은 질문에서 시작해, 함께 만들어 가는 중입니다.</figcaption></figure><Closing />
  </>;
}
export function IntroPage({ path }: { path: string }) {
  return <article className={`intro-page ${path === '/' ? 'home-page' : ''}`}>{path === '/' ? <HomePage /> : path === '/project' ? <ProjectPage /> : path === '/team' ? <TeamPage /> : <section className="editorial-heading"><p className="site-eyebrow">404</p><h1 id="page-title" tabIndex={-1}>{pageTitles[path] ?? '페이지를 찾을 수 없습니다'}</h1><p>주소를 확인하거나 메인으로 돌아가세요.</p><a className="text-link" href="/">메인으로 돌아가기</a></section>}</article>;
}
