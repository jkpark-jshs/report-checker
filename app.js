// 화면 동작: 입력 → 검사(checker.js) → 결과 표시

const $ = id => document.getElementById(id);
const input = $('input');

const CHECK_NAMES = {
  structure: '항목 구성 (누락·순서·중복)',
  units: '단위 표기 오류',
  spacing: '숫자-단위 띄어쓰기',
  figures: '그림·표 번호',
  style: '문체 (1인칭·구어체·혼용)',
  content: '내용 (측정값·오차 분석·결론)',
  reference: '참고문헌 형식'
};

// 설정과 기록은 브라우저(localStorage)에 저장한다. 저장이 막힌 환경이면 그냥 넘어간다.
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch (e) { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 저장 불가 환경 */ }
}

const settings = load('rc-settings', {
  required: RULES.sections.map(s => s.key),
  checks: Object.fromEntries(Object.keys(CHECK_NAMES).map(k => [k, true]))
});
let history = load('rc-history', []);
let lastResult = null;
let filter = 'all';
let currentFile = '';

// 1. 검사 실행
function run() {
  const text = input.value;
  if (!text.trim()) { lastResult = null; render(); return; }
  lastResult = checkReport(text, settings);
  render();
}

// 입력할 때마다 바로 검사하되, 0.3초 동안 입력이 멈췄을 때만 실행한다(디바운스)
let timer = null;
input.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(run, 300);
});

// 2. 결과 그리기
function render() {
  const r = lastResult;
  const scoreBox = $('score');
  scoreBox.className = 'score';
  if (!r) {
    $('scoreNum').textContent = '-';
    ['cError', 'cWarn', 'cInfo', 'cAll'].forEach(id => { $(id).textContent = '0'; });
    $('sectionChips').innerHTML = '';
    $('issueList').innerHTML = '<li class="empty">보고서를 넣으면 여기에 결과가 나옵니다.</li>';
    return;
  }

  $('scoreNum').textContent = r.score;
  scoreBox.classList.add(r.score >= 90 ? 'good' : r.score >= 60 ? 'mid' : 'bad');
  $('cError').textContent = r.stats.error;
  $('cWarn').textContent = r.stats.warn;
  $('cInfo').textContent = r.stats.info;
  $('cAll').textContent = r.issues.length;

  // 찾은 항목은 초록, 빠진 필수 항목은 빨강
  const foundKeys = r.sections.map(s => s.key);
  $('sectionChips').innerHTML = RULES.sections
    .filter(s => settings.required.includes(s.key) || foundKeys.includes(s.key))
    .map(s => `<span class="chip ${foundKeys.includes(s.key) ? 'ok' : 'miss'}">${s.label}</span>`)
    .join('');

  const lines = input.value.replace(/\r\n?/g, '\n').split('\n');
  const shown = r.issues.filter(x => filter === 'all' || x.level === filter);
  const LEVEL = { error: '오류', warn: '주의', info: '권장' };

  if (!shown.length) {
    $('issueList').innerHTML = r.issues.length
      ? '<li class="empty">이 단계의 문제는 없습니다.</li>'
      : '<li class="empty"><strong>형식 문제 없음</strong>제출해도 좋습니다.</li>';
    return;
  }
  $('issueList').innerHTML = shown.map(x => `
    <li class="issue ${x.level}" data-line="${x.line === null ? '' : x.line}">
      <div class="meta"><span class="tag ${x.level}">${LEVEL[x.level]}</span>${x.category}${x.line === null ? ' · 문서 전체' : ` · ${x.line + 1}번째 줄`}</div>
      <div class="msg">${escapeHtml(x.message)}</div>
      <div class="fix">${escapeHtml(x.fix)}</div>
      ${x.line !== null ? `<div class="quote">${escapeHtml(lines[x.line] || '')}</div>` : ''}
    </li>`).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 3. 문제를 누르면 그 줄로 이동해서 선택한다
$('issueList').addEventListener('click', e => {
  const li = e.target.closest('.issue');
  if (!li || li.dataset.line === '') return;
  jumpToLine(Number(li.dataset.line));
});

function jumpToLine(n) {
  const lines = input.value.split('\n');
  const start = lines.slice(0, n).reduce((sum, l) => sum + l.length + 1, 0);
  const end = start + lines[n].length;
  // 스크롤 위치 계산: 앞부분만 넣었을 때의 높이 = 그 줄의 위치
  const full = input.value;
  input.value = full.slice(0, end);
  const y = input.scrollHeight;
  input.value = full;
  input.scrollTop = Math.max(0, y - input.clientHeight / 2);
  input.focus();
  input.setSelectionRange(start, end);
}

// 4. 오류/주의/권장 필터
document.querySelectorAll('.count').forEach(btn => {
  btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    document.querySelectorAll('.count').forEach(b => b.classList.toggle('active', b === btn));
    render();
  });
});

// 5. 파일 열기, 예시, 지우기
$('fileInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const status = $('fileStatus');
  status.className = 'hint';
  status.textContent = `"${file.name}" 읽는 중...`;
  try {
    input.value = await readReportFile(file);
    currentFile = file.name;
    status.textContent = `"${file.name}"을(를) 불러왔습니다. 고치면서 바로 다시 검사됩니다.`;
    $('recordLabel').value = file.name;
    run();
  } catch (err) {
    status.className = 'hint err';
    status.textContent = err.message;
  }
  e.target.value = ''; // 같은 파일을 다시 골라도 change가 일어나도록
});

function resetStatus() {
  currentFile = '';
  $('fileStatus').className = 'hint';
  $('fileStatus').textContent = '.hwpx, .docx, .txt 파일을 열거나 아래에 붙여 넣으세요. 쓰는 즉시 검사합니다.';
}
$('sampleBad').addEventListener('click', () => { resetStatus(); input.value = SAMPLES.bad; $('recordLabel').value = '예시 보고서 (고치기 전)'; run(); });
$('sampleGood').addEventListener('click', () => { resetStatus(); input.value = SAMPLES.good; $('recordLabel').value = '예시 보고서 (고친 후)'; run(); });
$('clearBtn').addEventListener('click', () => { resetStatus(); input.value = ''; $('recordLabel').value = ''; run(); });

// 6. 검사 설정
function buildSettings() {
  $('requiredBox').innerHTML = RULES.sections.map(s => `
    <label><input type="checkbox" data-req="${s.key}" ${settings.required.includes(s.key) ? 'checked' : ''}>${s.label}</label>`).join('');
  $('checksBox').innerHTML = Object.entries(CHECK_NAMES).map(([k, name]) => `
    <label><input type="checkbox" data-chk="${k}" ${settings.checks[k] !== false ? 'checked' : ''}>${name}</label>`).join('');
}
document.querySelector('.settings').addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.req) {
    settings.required = RULES.sections.map(s => s.key)
      .filter(k => document.querySelector(`[data-req="${k}"]`).checked);
  }
  if (t.dataset.chk) settings.checks[t.dataset.chk] = t.checked;
  save('rc-settings', settings);
  run();
});

// 7. 검사 기록: 수정 전후 오류 수를 남겨서 효과를 증명한다
$('recordBtn').addEventListener('click', () => {
  if (!lastResult) return;
  history.push({
    time: new Date().toLocaleString('ko-KR'),
    label: $('recordLabel').value.trim() || currentFile || '이름 없음',
    error: lastResult.stats.error,
    warn: lastResult.stats.warn,
    info: lastResult.stats.info,
    score: lastResult.score
  });
  save('rc-history', history);
  renderHistory();
});

function renderHistory() {
  $('historyBody').innerHTML = history.length
    ? history.map(h => `<tr><td>${h.time}</td><td>${escapeHtml(h.label)}</td><td class="n">${h.error}</td><td class="n">${h.warn}</td><td class="n">${h.info}</td><td class="n">${h.score}</td></tr>`).join('')
    : '<tr><td colspan="6" class="empty">아직 기록이 없습니다. 검사 후 "이 결과 기록"을 누르세요.</td></tr>';
}

$('csvBtn').addEventListener('click', () => {
  const rows = [['시각', '이름', '오류', '주의', '권장', '점수'], ...history.map(h => [h.time, h.label, h.error, h.warn, h.info, h.score])];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  // 엑셀에서 한글이 깨지지 않도록 앞에 BOM(﻿)을 붙인다
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '검사기록.csv';
  a.click();
});

$('clearHistory').addEventListener('click', () => {
  history = [];
  save('rc-history', history);
  renderHistory();
});

buildSettings();
renderHistory();
render();
