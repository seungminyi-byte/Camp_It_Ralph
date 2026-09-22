# 주변 데이터센터 자료의 출처와 수록 기준

2026-09-08 확인한 자료의 출처와 선별 기준입니다.


검토한 후보 7곳 중 **2곳**을 수록한다. 회사명·운영사·고유 시설명은 지역·시설 유형으로 바꾸고 출처 URL은 유지했다. 전국 전수 목록이 아니며 운영 상태·가용 상면·전력은 실시간 미확인이다. 시설 존재와 규모는 참고점수·공급 가능량 계산에 쓰지 않는다.

| 수록 항목 | 운영·규모 근거 | 주소·좌표 검증 | MW |
|---|---|---|---|
| 세종 집현동 대규모 데이터센터 | [공식 소개](https://datacenter.navercorp.com/gaksejong/): 운영 소개, 서버 수용 규모 60만 유닛 | 같은 페이지 행복대로 824, VWorld 응답 36.50815688750704 / 127.34100594521068 | 종전 270MW는 해당 출처에서 확인되지 않아 용량·종류 null. 개장연도도 미수록 |
| 안산 사동 대규모 데이터센터 | [2024-06-12 발표](https://www.kakaocorp.com/page/detail/11097): 2024년 1월 가동, 설계 수용 규모 4,000랙·12만 서버, 연면적 47,378㎡. [2025-12-29 발표](https://www.kakaocorp.com/page/detail/11861)도 확인 | [입주 연구기관 안내](https://aic.hanyang.ac.kr/notice/notice.php?code=notice&idx=1024&page=9&ptype=view)의 해안로 689, VWorld 응답 37.293497971991656 / 126.83172113353041 | 용량·종류 null. 설계 수용 규모는 현재 가용 규모가 아님 |

좌표는 기존 운영 `/api/geocode`에서 2026-09-08 재확인한 주소 대표점이다. 필지 경계·건물 출입구 위치가 아니다. 새 런타임 API·키는 추가하지 않았다. 서버 유닛은 서버 대수·MW로 환산하지 않는다.

### 이용조건과 제외 내역

공개 시설 소개·보도자료의 최소 사실관계만 자체 문장으로 정리하고 근거 링크를 제공한다. 원문·사진·도면·로고는 번들에 수록하지 않았다. 원자료는 개방 데이터 라이선스를 부여한 자료가 아니며 원문 재배포 권한을 취득했다고 주장하지 않는다. 이번 수록 범위는 사실의 자체 요약이며 원문·브랜드 자료의 재사용 범위를 확장하지 않는다.

- 강남 소규모 시설: [원출처](https://www.digitaledgedc.com/products-services/data-centers/south-korea/) 전력 값이 본문·표에서 다르고 IT/시설 구분도 불명확했다. [약관](https://www.digitaledgedc.com/resources/document/terms-of-use/) 4·6항의 데이터 배포·제3자 재배포 제한으로 제외했다.
- 마포 상면 임대 시설·고양 대규모 시설: [마포 원출처](https://www.equinix.com/data-centers/asia-pacific-colocation/korea-colocation/seoul-data-center/sl1), [고양 원출처](https://www.equinix.com/kr/ko/resources/data-sheets/seoul-sl2x-tech-specs)의 사실 확인과 별개로 [약관](https://www.equinix.com/about/legal/terms) 3항의 데이터 복제·배포 제한으로 제외했다.
- 마포 월드컵북로60길 12 시설: [원출처](https://www.digitalrealty.com/ko/data-centers/asia-pacific/seoul/icn10)의 주소·규모는 확인했으나 종전 12MW·IT 구분은 해당 페이지에 없었다. [한국어 약관](https://www.digitalrealty.com/ko/about/legal/terms)에서 재사용 조건 본문을 확인하지 못해 제외했다.
- 춘천 시설: [종전 보고서](https://www.navercorp.com/static/NAVER_2022_ESG_KOR.pdf)는 404. [현재 소개](https://datacenter.navercorp.com/gaksejong/)의 주소(순환대로 1231)가 기존 목록과 다르고 새 주소의 VWorld 조회도 404여서 기존 좌표를 재사용하지 않았다. [2023년 발표](https://navercorp.com/media/pressReleasesDetail?seq=31060)의 10만 유닛은 10만 서버 대수와 구분한다.
