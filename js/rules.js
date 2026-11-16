// 검사 규칙 데이터
// 규칙(무엇을 검사할지)과 엔진(어떻게 검사할지)을 분리해 두었다.
// 선생님마다 보고서 양식이 달라도 이 파일만 고치면 된다.

const RULES = {
  // 보고서 필수 항목. order 순서가 표준 순서다.
  // names: 제목으로 인정하는 이름들 (띄어쓰기는 무시하고 비교)
  sections: [
    { key: 'purpose',    label: '실험 목적',   order: 1, names: ['목적', '실험목적', '탐구목적', '연구목적', 'purpose', 'objective'] },
    { key: 'theory',     label: '이론적 배경', order: 2, names: ['이론', '이론적배경', '배경이론', '배경', '원리', '실험원리', 'theory', 'background'] },
    { key: 'materials',  label: '준비물',      order: 3, names: ['준비물', '재료', '실험재료', '기구', '실험기구', '실험도구', '재료및기구', '실험재료및기구', 'materials'] },
    { key: 'method',     label: '실험 방법',   order: 4, names: ['방법', '실험방법', '과정', '실험과정', '절차', '실험절차', 'method', 'procedure'] },
    { key: 'result',     label: '실험 결과',   order: 5, names: ['결과', '실험결과', '측정결과', 'result', 'results'] },
    { key: 'discussion', label: '고찰',        order: 6, names: ['고찰', '토의', '토론', '논의', '결과분석', '분석', 'discussion'] },
    { key: 'conclusion', label: '결론',        order: 7, names: ['결론', '제언', '요약', 'conclusion'] },
    { key: 'reference',  label: '참고문헌',    order: 8, names: ['참고문헌', '참고자료', '출처', 'reference', 'references'] }
  ],

  // 숫자 뒤에 잘못 쓴 단위 → 올바른 표기
  // pattern은 "숫자 + (공백) + 잘못된 단위"를 찾는다.
  unitFixes: [
    { pattern: /(\d+(?:\.\d+)?)\s*(ml|Ml|ML)(?![A-Za-z])/g,  wrong: 'ml',  right: 'mL',  why: '리터(L)는 대문자로 쓴다' },
    { pattern: /(\d+(?:\.\d+)?)\s*(Kg|KG)(?![A-Za-z])/g,     wrong: 'Kg',  right: 'kg',  why: '킬로(k)는 소문자다' },
    { pattern: /(\d+(?:\.\d+)?)\s*(Km|KM)(?![A-Za-z])/g,     wrong: 'Km',  right: 'km',  why: '킬로(k)는 소문자다' },
    { pattern: /(\d+(?:\.\d+)?)\s*(sec|secs|Sec)(?![A-Za-z])/g, wrong: 'sec', right: 's', why: '초의 SI 기호는 s다' },
    { pattern: /(\d+(?:\.\d+)?)\s*(hr|hrs)(?![A-Za-z])/g,    wrong: 'hr',  right: 'h',   why: '시간의 기호는 h다' },
    { pattern: /(\d+(?:\.\d+)?)\s*(cc)(?![A-Za-z])/g,        wrong: 'cc',  right: 'mL',  why: 'cc 대신 mL 또는 cm³를 쓴다' },
    { pattern: /(\d+(?:\.\d+)?)\s*(deg)(?![A-Za-z])/g,       wrong: 'deg', right: '°',   why: '각도는 ° 기호를 쓴다' },
    { pattern: /(\d+(?:\.\d+)?)\s*(C)(?![A-Za-z])/g,         wrong: 'C',   right: '°C',  why: '섭씨는 °C로 쓴다 (C만 쓰면 쿨롬)' },
    { pattern: /mol\/l(?![A-Za-z])/g,             wrong: 'mol/l', right: 'mol/L', why: '리터(L)는 대문자로 쓴다' },
    { pattern: /(\d+(?:\.\d+)?)\s*(m\/s2|m\/s\^2)(?![0-9])/g, wrong: 'm/s2', right: 'm/s²', why: '제곱은 위첨자로 쓴다' }
  ],

  // 숫자와 단위 사이 띄어쓰기 (SI 표기 원칙). %와 °는 붙여 쓴다.
  unitSpacing: /(\d+(?:\.\d+)?)(mm|cm|km|mg|kg|mL|mol|min|Pa|Hz|L|g|s|N|J|W|K|V|A|m)(?![A-Za-z0-9])/g,

  // 보고서에서 피해야 할 표현
  firstPerson: /(^|[\s(])(나는|내가|나의|저는|제가|저의|우리는|우리가)(?=\s|$)/g,
  informal: /(너무|엄청|진짜|완전|대박|ㅋㅋ|ㅎㅎ|!!)/g,
  futureTense: /(할 것이다|할 예정이다|할 계획이다|것이다\.)/,

  // 고찰에 들어가야 할 핵심어 (하나도 없으면 오차 분석이 없다고 본다)
  discussionKeywords: ['오차', '원인', '개선', '한계', '차이', '보완'],

  // 목적-결론 연결 검사에서 제외할 흔한 단어
  stopwords: ['따른', '따라', '이용하여', '통하여', '실험', '이번', '통해', '대한', '위해', '이용', '알아본다', '알아보기', '측정', '한다', '있다', '하였다', '것이다', '우리', '결과', '목적'],

  // 점수 감점
  penalty: { error: 10, warn: 4, info: 1 }
};

if (typeof module !== 'undefined') module.exports = RULES;
