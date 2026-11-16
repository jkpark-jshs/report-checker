// 검사 엔진 테스트: node tests/checker.test.js
// 각 검사 규칙이 잡아야 할 것은 잡고, 잡지 말아야 할 것은 안 잡는지 확인한다.
const assert = require('assert');
const { checkReport, matchHeading } = require('../js/checker.js');
const SAMPLES = require('../js/samples.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('통과', name); }
  catch (e) { console.log('실패', name, '\n ', e.message); process.exitCode = 1; }
}
const has = (r, cat, word) => r.issues.some(x => x.category === cat && x.message.includes(word));

test('제목 인식: 번호·로마자·콜론·합쳐진 제목', () => {
  assert.deepStrictEqual(matchHeading('1. 실험 목적').keys, ['purpose']);
  assert.deepStrictEqual(matchHeading('Ⅲ. 재료 및 방법').keys, ['materials', 'method']);
  assert.deepStrictEqual(matchHeading('고찰: 오차는').keys, ['discussion']);
  assert.strictEqual(matchHeading('결과는 다음과 같다'), null);
});

test('필수 항목 누락을 잡는다', () => {
  const r = checkReport('목적\n무엇을 확인한다.\n결과\n10 cm였다.');
  assert.ok(has(r, '구성', '준비물'));
  assert.ok(has(r, '구성', '고찰'));
});

test('항목 순서가 바뀌면 경고한다', () => {
  const r = checkReport('결과\n1 cm였다.\n목적\n확인한다.', { required: [] });
  assert.ok(has(r, '구성', '순서'));
});

test('단위 오류: ml, sec, Kg', () => {
  const r = checkReport('결과\n10ml, 3.5sec, 2Kg이었다.', { required: [] });
  assert.ok(has(r, '단위', '10ml'));
  assert.ok(has(r, '단위', '3.5sec'));
  assert.ok(has(r, '단위', '2Kg'));
});

test('올바른 단위는 잡지 않는다', () => {
  const r = checkReport('결과\n10 mL, 3.5 s, 2 kg, 25 °C, 15 %였다.', { required: [] });
  assert.strictEqual(r.issues.filter(x => x.category === '단위').length, 0);
});

test('그림 번호 건너뜀과 없는 번호 언급', () => {
  const r = checkReport('결과\n표 3을 보면 알 수 있다.\n표 1. 첫 표\n표 3. 둘째 표', { required: [] });
  assert.ok(has(r, '그림·표', '순서대로가 아닙니다'));
  assert.ok(!has(r, '그림·표', '그런 표가 없습니다'));
});

test('"그림 1을 보면"은 캡션이 아니라 본문 언급이다', () => {
  const r = checkReport('결과\n그림 1을 보면 비례한다.\n그림 1. 그래프', { required: [] });
  assert.strictEqual(r.issues.filter(x => x.category === '그림·표').length, 0);
});

test('"발표 2"의 표는 표 번호가 아니다', () => {
  const r = checkReport('결과\n발표 2회를 하였다.', { required: [] });
  assert.strictEqual(r.issues.filter(x => x.category === '그림·표').length, 0);
});

test('문체 혼용, 1인칭, 구어체', () => {
  const r = checkReport('결과\n길이가 길었다.\n주기가 길었다.\n내가 보기에 너무 좋았습니다.', { required: [] });
  assert.ok(has(r, '문체', '섞였습니다'));
  assert.ok(has(r, '문체', '1인칭'));
  assert.ok(has(r, '문체', '구어체'));
});

test('참고문헌 연도 누락', () => {
  const r = checkReport('참고문헌\n물리학 교과서', { required: [] });
  assert.ok(has(r, '참고문헌', '연도'));
});

test('예시: 고친 보고서는 문제 0개, 고치기 전은 15개 이상', () => {
  assert.strictEqual(checkReport(SAMPLES.good).issues.length, 0);
  assert.ok(checkReport(SAMPLES.bad).issues.length >= 15);
});

console.log(`\n${passed}개 통과`);
