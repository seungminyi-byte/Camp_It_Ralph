import '../styles/home.css';

const steps = [
  { number: '01', title: '주소에서 시작', description: '제안받은 주소나 읍면동을 검색하거나 지도에서 후보 위치를 선택합니다.' },
  { number: '02', title: '확인할 조건 정리', description: '공개자료로 기본 검토를 시작합니다. 면적·비용은 필요한 경우 추가로 입력하세요.' },
  { number: '03', title: '비교하고 보고서로', description: '최대 4곳을 같은 기준으로 비교하고, 근거와 다음 확인사항을 PDF로 남깁니다.' },
];

const scopes = [
  { symbol: '↯', title: '전력', description: '공개 변전소 목록과 주변 위치를 살펴봅니다.', limit: '실제 공급 가능량과 연결 조건은 공급기관 협의가 필요합니다.' },
  { symbol: '▧', title: '인허가·재해', description: '용도지역과 보호·규제구역, 재해 관련 자료를 확인합니다.', limit: '조회 범위와 기준일을 확인하고 최신 고시·도면을 대조해야 합니다.' },
  { symbol: '◎', title: '주변 현황', description: '주변 인구·가구·학교와 참고 기사 등 검토 근거를 모읍니다.', limit: '주민수용성이나 민원 발생 가능성을 판정하지 않습니다.' },
  { symbol: '▤', title: '면적·비용 · 선택', description: '입력한 사업조건으로 필요 면적과 사업비·지연 금융비용을 계산합니다.', limit: '미입력 값은 계산을 보류하고, 계산 가정과 입력값을 함께 표시합니다.' },
];

export default function HomePage({ hasOpenedReview }: { hasOpenedReview: boolean }) {
  const action = hasOpenedReview ? '검토 계속하기' : '주소로 검토 시작';

  return (
    <>
      <main id="home-main" className="home-main" tabIndex={-1}>
        <section className="home-hero" aria-labelledby="home-title">
          <div className="hero-copy">
            <p className="home-kicker"><span aria-hidden="true" />데이터센터 후보 부지 1차 검토</p>
            <h1 id="home-title" tabIndex={-1}>주소에서 시작해,<br />다음 확인사항까지.</h1>
            <p className="hero-description">전력·인허가·재해·주변 현황을 같은 기준으로 살펴보고, 확인된 제약과 미확인 조건을 보고서로 정리합니다.</p>
            <a className="entry-primary hero-cta" href="#review">{action}<span aria-hidden="true">→</span></a>
            <p className="hero-assurance">내부 사업정보 없이 시작<br className="mobile-break" /><span aria-hidden="true"> · </span>AI 없이 기본 보고서 사용</p>
            {hasOpenedReview && <p className="home-session-note">이 화면을 오가는 동안 후보와 입력조건은 유지됩니다.</p>}
          </div>
          <figure className="report-example" aria-labelledby="example-caption">
            <figcaption id="example-caption"><span>화면 구성 예시</span><span>기본 보고서</span></figcaption>
            <div className="example-sheet">
              <div className="example-heading"><span className="example-document-icon" aria-hidden="true">▤</span><div><p>후보 부지 1차 검토</p><strong>검토 근거와 다음 행동</strong></div></div>
              <div className="example-address"><span aria-hidden="true">⌖</span>선택한 위치와 조회 기준을 함께 기록</div>
              <dl>
                <div><dt><span className="example-index">01</span>확인된 제약</dt><dd>해당 자료와 근거를 구분해 표시</dd></div>
                <div><dt><span className="example-index">02</span>미확인 조건</dt><dd><span className="example-status">전력 공급조건 · 미확인</span></dd></div>
                <div><dt><span className="example-index">03</span>다음 확인사항</dt><dd>공급기관과 연결·공급조건 협의</dd></div>
              </dl>
              <div className="example-source"><span aria-hidden="true">↳</span>공개자료의 출처·기준일과 입력조건 표시</div>
            </div>
            <p className="example-note">서비스의 정보 구성을 설명하는 예시이며, 실제 부지의 검토 결과가 아닙니다.</p>
          </figure>
        </section>

        <section className="home-how" aria-labelledby="how-title">
          <div className="home-section-heading"><p className="home-kicker">사용 방법</p><h2 id="how-title">주소 하나로 기본 검토부터.</h2><p>상세조건과 AI 의견은 필요한 때에 추가하세요.</p></div>
          <ol className="home-steps">{steps.map((step) => <li key={step.number}><span>{step.number}</span><h3>{step.title}</h3><p>{step.description}</p></li>)}</ol>
        </section>

        <section className="home-scope" aria-labelledby="scope-title">
          <div className="home-section-heading"><p className="home-kicker">검토 범위</p><h2 id="scope-title">확인한 것과 남은 질문을 구분합니다.</h2><p>공개자료와 입력한 조건을 바탕으로 후속 조사의 출발점을 만듭니다.</p></div>
          <div className="scope-grid">{scopes.map((scope) => <article key={scope.title}><span className="scope-symbol" aria-hidden="true">{scope.symbol}</span><h3>{scope.title}</h3><p>{scope.description}</p><p className="scope-limit">{scope.limit}</p></article>)}</div>
        </section>

        <section className="home-closing" aria-labelledby="closing-title">
          <div><p className="home-kicker">함께 쓰는 검토 근거</p><h2 id="closing-title">다음 검토로 이어지는 보고서.</h2><p>GS건설의 후보 부지 검토를 위한 도구입니다. 같은 형식의 보고서로 그룹 내 관련 조직과 검토 근거를 공유할 수 있습니다.</p></div>
          <a className="entry-primary" href="#review">{action}<span aria-hidden="true">→</span></a>
        </section>
      </main>
      <footer className="home-footer"><div><strong>여기 DC 돼요? <span>가칭 · 해커톤 프로토타입</span></strong><p>스크리닝 참고용, 한전 공식 검토·법률 판단 대체 불가.</p></div><p>공개자료의 출처·기준일·조회 범위는 검토 화면과 보고서에서 확인할 수 있습니다.<br />후보와 입력은 현재 화면 세션에서 유지되며 새로고침하면 초기화됩니다.</p></footer>
    </>
  );
}
