# PDF 글꼴 후보 사전 확인

2026-09-21. 아래 후보 검토 후 실제 시험 PDF의 렌더·추출을 확인했다. 제품 보고서 편입 및 전체 페이지 검수는 아직 미완료다.

- 후보: Google Fonts의 NanumGothic-Regular.ttf, 고정 commit `16680f8688ffcd467d2eb2146a9ce0343404581d`(해당 파일 마지막 변경 2018-03-13).
- [공식 metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/METADATA.pb), [고정 글꼴](https://raw.githubusercontent.com/google/fonts/16680f8688ffcd467d2eb2146a9ce0343404581d/ofl/nanumgothic/NanumGothic-Regular.ttf), [같은 commit OFL](https://raw.githubusercontent.com/google/fonts/16680f8688ffcd467d2eb2146a9ce0343404581d/ofl/nanumgothic/OFL.txt).
- 원본 2,054,744 bytes, SHA256 `76f45ef4a6bcff344c837c95a7dcc26e017e38b5846d5ae0cdcb5b86be2e2d31`. OFL 4,534 bytes, SHA256 `eeacf16032901d0ed0456876ec77b8f0fda6b3fecec7d972f8543eb602e6c30f`.
- OFL 1.1 저작권/라이선스 원문을 글꼴과 배포 고지에 함께 보존해야 한다. 다운로드 사본은 저장소 밖 work/tools/pdf-font에 있다.
- reportlab TTFont로 읽힌 문자 너비 11,829개. 기본 한글과 숫자는 있으나 U+33A1(㎡)은 cmap에 없었다. 파일 크기만 보고 즉시 채택하지 않는다. PDF 구현 단계에서 실제 fontkit subset과 모든 기본 보고서 문자를 검사하고, 필요한 단위 대체 표기(m² 등) 또는 다른 정적 글꼴을 비교해 문자가 사라지지 않게 한다. 검증 전 A4/한글 성공으로 기록하지 않는다.

## 대체 후보: 지역별 정적 Noto Sans KR

- [공식 배포 형식 안내](https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/README.md)의 Region-specific Subset OTF 형식을 확인했다. 언어 전체 16MB/가변 폰트 대신 한국어 정적 Regular를 검토한다.
- 파일: `Sans/SubsetOTF/KR/NotoSansKR-Regular.otf`, 고정 commit `165c01b46ea533872e002e0785ff17e44f6d97d8`(파일 마지막 변경 2021-04-30). [원본](https://raw.githubusercontent.com/notofonts/noto-cjk/165c01b46ea533872e002e0785ff17e44f6d97d8/Sans/SubsetOTF/KR/NotoSansKR-Regular.otf), [같은 commit LICENSE](https://raw.githubusercontent.com/notofonts/noto-cjk/165c01b46ea533872e002e0785ff17e44f6d97d8/LICENSE).
- 원본 4,644,748 bytes, SHA256 `69975a0ac8472717870aefeab0a4d52739308d90856b9955313b2ad5e0148d68`; OFL SHA256 `6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2`. 옛 commit에서는 LICENSE가 Sans 하위가 아닌 루트에 있음을 API 목록으로 확인 후 받았다.
- fontTools 4.65.0으로 cmap 23,174개와 내부 저작권 `© 2014-2021 Adobe (http://www.adobe.com/).` 및 OFL 1.1 확인. `후보 부지 검토 보고서 ㎡억원²㎞°℃·→−₩①✓–—` 문자 누락 0. 자산은 work/tools/pdf-font/noto-kr에 보관.
- 이 결과는 cmap 확인이며 fontkit subset/PDF 실제 렌더 성공을 뜻하지 않는다. 제품에는 아직 편입하지 않았다.

## 실제 삽입 시험과 최종 인계

- pdf-lib 1.17.1 / @pdf-lib/fontkit 1.1.1로 A4 1쪽에 한글·면적 단위·숫자·출처 URL 등 9문장을 생성했다. Poppler 렌더를 눈으로 확인하고 pypdf 텍스트 추출을 별도로 대조했다.
- 정적 OTF subset: 약 47KB였으나 실제 렌더에 네모가 나타나 제외했다. 전체 OTF도 글꼴 경고와 텍스트 추출 오류로 제외했다.
- 같은 upstream commit의 [NotoSansKR-VF.ttf](https://raw.githubusercontent.com/notofonts/noto-cjk/165c01b46ea533872e002e0785ff17e44f6d97d8/Sans/Variable/TTF/Subset/NotoSansKR-VF.ttf)를 fontTools 4.65.0으로 wght=400의 정적 TTF로 변환했다. 원본 SHA256 `9e1d729e7e2b36f9ef439da102f8c134c10aabe46f1c843bf0aca5c043b86f76`.
- 재현 스크립트는 `evidence/pdf-font/derive_noto_kr.py`. 원본을 스크립트 옆 `noto-kr/NotoSansKR-VF.ttf`에 두고 실행한다. `recalcTimestamp=False`로 upstream 시각을 보존해 결과 해시를 고정했다. 정적 TTF는 6,225,168 bytes, SHA256 `d2a33412bcbd2503d0a0222936da3830ac5d76eec92bcf0eab58ea955f32f6d4`.
- TTF subset은 추출 검사를 통과했지만 실제 렌더에서 한글 복합 글자가 사라졌다. 따라서 **subset:false**가 필수다. 추출 통과만으로 시각 검수를 대체하지 않는다.
- 기본 fontkit shaping은 공백·URL의 숫자를 대체 glyph로 바꿔 추출 오류를 만들었다. `fontkit.create(bytes).availableFeatures` 전체와 `frac,numr,dnom,pnum,tnum,locl`을 명시적으로 false로 설정했을 때 해결됐다. availableFeatures 목록만 꺼서는 URL 숫자 문제가 남았다.
- 최종 파일 3,129,232 bytes / Node 생성 535ms. A4 595.28×841.89pt 1쪽, 9문장 모두 추출 일치, cmap 누락 0. 실제 렌더 1쪽에서 한글·단위·URL 숫자를 확인했다. `evidence/pdf-font/{probe-manifest.json,final-verification.json,probe-page.png}` 참고. Node 시간은 브라우저 성능 수치가 아니다.
- 제품 편입 시 전체 TTF와 OFL을 보존하고 PDF 코드·폰트는 다운로드 클릭 시만 읽는다. 실제 보고서의 긴 문장·다중 페이지·지원하지 않는 사용자 입력 문자 처리·다운로드 실패/취소는 별도 구현·검증해야 한다.
