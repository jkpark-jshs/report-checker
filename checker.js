// 검사 엔진
// 입력: 보고서 전체 텍스트(문자열)
// 출력: { score, issues, sections, stats }
// 화면(app.js)과 분리되어 있어서 node 테스트에서도 그대로 쓸 수 있다.

const R = (typeof RULES !== 'undefined') ? RULES : require('./rules.js');

const CHECKS_DEFAULT = { structure: true, units: true, spacing: true, figures: true, style: true, content: true, reference: true };

// 한 줄이 '항목 제목'인지 판단한다.
// 예) "1. 실험 목적", "Ⅲ. 재료 및 방법", "결과:", "고찰 : 오차가 생긴 이유는..."
// 제목이면 { keys: ['purpose'], inline: '콜론 뒤 내용' }, 아니면 null
function matchHeading(line) {
  const t = line.trim();
  if (!t || t.length > 40) return null;

  let head = t;
  let inline = '';
  const colon = t.match(/^([^:：]{1,25})[:：]\s*(.*)$/);
  if (colon) { head = colon[1]; inline = colon[2]; }

  // 앞 번호 제거: 1. / 1) / 2.1 / Ⅱ. / IV. / 가. / (1) / ① / ■
  head = head.replace(/^\s*(?:[0-9]+(?:\.[0-9]+)*[.)]?|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+[.)]?|[IVX]+[.)]|[가나다라마바사아자차카타파하][.)]|\([0-9가-하]+\)|[①-⑩]|[■□●○◆◇▶▷*#-]+)\s*/, '');

  const norm = head.replace(/[\s[\]【】<>《》().]/g, '').toLowerCase();
  if (!norm) return null;

  // "재료및방법"처럼 두 항목이 합쳐진 제목도 인정
  const parts = norm.split(/및|\/|·|,|&/).filter(Boolean);
  const keys = [];
  for (const p of parts) {
    const sec = R.sections.find(s => s.names.includes(p));
    if (!sec) return null; // 하나라도 모르는 단어면 제목이 아니다
    keys.push(sec.key);
  }
  return { keys, inline };
}

// 보고서를 항목별로 나눈다.
// lineSection[i] = i번째 줄이 속한 항목 key (제목 줄은 'heading', 첫 제목 전은 null)
function splitSections(lines) {
  const found = [];          // 처음 나온 순서대로 [{ key, line }]
  const content = {};        // key → 내용 줄 번호 배열
  const inlineText = {};     // key → 제목 줄 콜론 뒤 내용
  const duplicates = [];     // 두 번 나온 항목 [{ key, line }]
  const lineSection = new Array(lines.length).fill(null);
  let group = [];            // 지금 읽고 있는 항목들 ("재료 및 방법"이면 2개)

  lines.forEach((line, i) => {
    const h = matchHeading(line);
    // 같은 항목 안에서 다시 나온 이름(표 머리글 "결과" 등)은 제목으로 보지 않는다
    const sameAsNow = h && h.keys.length === 1 && group.includes(h.keys[0]);
    if (h && !sameAsNow) {
      lineSection[i] = 'heading';
      for (const key of h.keys) {
        if (content[key]) { duplicates.push({ key, line: i }); continue; }
        found.push({ key, line: i });
        content[key] = [];
        inlineText[key] = h.inline;
      }
      group = h.keys;
      return;
    }
    lineSection[i] = group.length ? group[group.length - 1] : null;
    group.forEach(k => content[k].push(i));
  });

  return { found, content, inlineText, duplicates, lineSection };
}

function sectionLabel(key) {
  const s = R.sections.find(x => x.key === key);
  return s ? s.label : key;
}

function sectionText(lines, sec, key) {
  if (!sec.content[key]) return '';
  return [sec.inlineText[key] || '', ...sec.content[key].map(i => lines[i])].join('\n').trim();
}

// 메인 검사 함수
function checkReport(text, options = {}) {
  const required = options.required || R.sections.map(s => s.key);
  const checks = Object.assign({}, CHECKS_DEFAULT, options.checks || {});
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const issues = [];
  const add = (level, category, line, message, fix) => issues.push({ level, category, line, message, fix: fix || '' });

  const sec = splitSections(lines);
  const isBody = i => sec.lineSection[i] !== 'heading' && sec.lineSection[i] !== 'reference' && lines[i].trim() !== '';

  // 1. 구성: 필수 항목, 빈 항목, 순서, 중복
  if (checks.structure) {
    for (const key of required) {
      if (!sec.content[key]) {
        add('error', '구성', null, `필수 항목 "${sectionLabel(key)}"이(가) 없습니다.`, `"${sectionLabel(key)}" 제목을 만들고 내용을 채우세요.`);
      } else if (!sectionText(lines, sec, key)) {
        const f = sec.found.find(x => x.key === key);
        add('error', '구성', f ? f.line : null, `"${sectionLabel(key)}" 항목이 비어 있습니다.`, '제목 아래에 내용을 쓰세요.');
      }
    }
    let maxOrder = 0;
    for (const f of sec.found) {
      const order = R.sections.find(s => s.key === f.key).order;
      if (order < maxOrder) {
        add('warn', '구성', f.line, `"${sectionLabel(f.key)}" 항목의 순서가 어긋났습니다.`, '목적 → 이론 → 준비물 → 방법 → 결과 → 고찰 → 결론 → 참고문헌 순서로 쓰세요.');
      }
      maxOrder = Math.max(maxOrder, order);
    }
    for (const d of sec.duplicates) {
      add('warn', '구성', d.line, `"${sectionLabel(d.key)}" 항목이 두 번 나옵니다.`, '하나로 합치세요.');
    }
  }

  // 2. 단위 표기
  lines.forEach((line, i) => {
    if (!isBody(i) && sec.lineSection[i] !== 'heading') return;
    if (sec.lineSection[i] === 'reference') return;
    if (checks.units) {
      for (const rule of R.unitFixes) {
        rule.pattern.lastIndex = 0;
        const hits = line.match(rule.pattern);
        if (hits) {
          const level = rule.right === '°C' ? 'warn' : 'error';
          add(level, '단위', i, `단위 표기 오류: "${hits[0].trim()}" (${rule.why})`, `"${rule.right}"(으)로 고치세요.`);
        }
      }
    }
    if (checks.spacing) {
      R.unitSpacing.lastIndex = 0;
      const hits = line.match(R.unitSpacing);
      if (hits) {
        add('info', '단위', i, `숫자와 단위를 붙여 썼습니다: ${hits.slice(0, 3).map(h => `"${h}"`).join(', ')}`, '숫자와 단위 사이를 한 칸 띄우세요. 예) 10 mL (%, °는 붙여 씀)');
      }
    }
  });

  // 3. 그림·표 번호
  if (checks.figures) {
    // 캡션: "표 1. 제목", "<그림 2> 제목"  /  언급: "표 1과 같다", "그림 2를 보면"
    // 번호 바로 뒤에 조사(을, 과, 에서 등)가 붙으면 캡션이 아니라 본문 언급이다
    const captionRe = /^\s*[<[(]?\s*(표|그림|table|fig\.?|figure)\s*([0-9]+)\s*(?:[.:)\]>]|\s|$)/i;
    const mentionRe = /(?<![가-힣A-Za-z])(표|그림)\s*([0-9]+)/g;
    const captions = { 표: [], 그림: [] };
    const mentions = { 표: new Set(), 그림: new Set() };
    const kindOf = w => (/^(표|table)$/i.test(w) ? '표' : '그림');

    lines.forEach((line, i) => {
      const t = line.trim();
      const c = t.length <= 80 ? t.match(captionRe) : null;
      if (c) {
        captions[kindOf(c[1])].push({ num: Number(c[2]), line: i });
        return;
      }
      if (sec.lineSection[i] === 'reference') return;
      let m;
      mentionRe.lastIndex = 0;
      while ((m = mentionRe.exec(line)) !== null) {
        mentions[m[1]].add(Number(m[2]));
        mentions[m[1]][`line${m[2]}`] = i;
      }
    });

    for (const kind of ['표', '그림']) {
      const nums = captions[kind].map(c => c.num);
      captions[kind].forEach((c, idx) => {
        if (nums.indexOf(c.num) !== idx) {
          add('error', '그림·표', c.line, `${kind} ${c.num} 번호가 중복됩니다.`, '번호를 하나씩 다르게 매기세요.');
        } else if (c.num !== idx + 1) {
          add('error', '그림·표', c.line, `${kind} 번호가 순서대로가 아닙니다. (${idx + 1}번이 와야 하는데 ${c.num}번)`, `${kind} 번호를 1부터 차례대로 매기세요.`);
        }
        if (!mentions[kind].has(c.num)) {
          add('warn', '그림·표', c.line, `${kind} ${c.num}을(를) 본문에서 한 번도 언급하지 않았습니다.`, `본문에 "${kind} ${c.num}에서 보듯이..."처럼 언급하세요.`);
        }
      });
      for (const n of mentions[kind]) {
        if (!nums.includes(n)) {
          add('error', '그림·표', mentions[kind][`line${n}`], `본문에서 "${kind} ${n}"을(를) 언급했지만 그런 ${kind}${kind === '표' ? '가' : '이'} 없습니다.`, `${kind} 번호를 확인하세요.`);
        }
      }
    }
  }

  // 4. 문체: 1인칭, 구어체, 미래형, 문체 혼용
  if (checks.style) {
    const formal = [];   // 합니다체 줄
    const plain = [];    // 하였다체 줄
    lines.forEach((line, i) => {
      if (!isBody(i)) return;
      R.firstPerson.lastIndex = 0;
      const fp = line.match(R.firstPerson);
      if (fp) add('warn', '문체', i, `1인칭 표현 "${fp[0].trim()}"을(를) 썼습니다.`, '보고서는 주어를 빼거나 "본 실험에서는"처럼 쓰세요.');
      R.informal.lastIndex = 0;
      const inf = line.match(R.informal);
      if (inf) add('warn', '문체', i, `구어체 표현 "${inf[0]}"을(를) 썼습니다.`, '객관적인 표현으로 바꾸세요. 예) 너무 → 매우');
      const where = sec.lineSection[i];
      if ((where === 'method' || where === 'result') && R.futureTense.test(line)) {
        add('warn', '문체', i, '실험이 끝난 뒤의 보고서인데 미래형으로 썼습니다.', '"~하였다"처럼 과거형으로 쓰세요.');
      }
      const sentences = line.match(/[^.!?]+[.!?]?/g) || [];
      for (const s of sentences) {
        const e = s.trim();
        if (/(니다|어요|아요|해요|예요|에요)[.!?]?$/.test(e)) formal.push(i);
        else if (/다[.!?]?$/.test(e)) plain.push(i);
      }
    });
    if (formal.length && plain.length) {
      const minority = formal.length <= plain.length ? formal : plain;
      const name = minority === formal ? '합니다체' : '하였다체';
      const other = minority === formal ? '하였다체' : '합니다체';
      [...new Set(minority)].forEach(i => {
        add('warn', '문체', i, `문체가 섞였습니다. 이 줄은 ${name}인데 보고서 대부분은 ${other}입니다.`, `${other}로 통일하세요.`);
      });
    }
  }

  // 5. 내용: 결과에 측정값, 고찰에 오차 분석, 목적과 결론 연결
  if (checks.content) {
    const lineOf = key => { const f = sec.found.find(x => x.key === key); return f ? f.line : null; };
    const result = sectionText(lines, sec, 'result');
    if (sec.content.result && result && !/\d/.test(result)) {
      add('warn', '내용', lineOf('result'), '실험 결과에 측정값(숫자)이 하나도 없습니다.', '측정값을 표나 수치로 제시하세요.');
    }
    const disc = sectionText(lines, sec, 'discussion');
    if (sec.content.discussion && disc) {
      if (!R.discussionKeywords.some(k => disc.includes(k))) {
        add('warn', '내용', lineOf('discussion'), '고찰에 오차 원인이나 개선점 분석이 없습니다.', '이론값과 측정값의 차이, 오차 원인, 개선 방법을 쓰세요.');
      }
      if (disc.replace(/\s/g, '').length < 50) {
        add('warn', '내용', lineOf('discussion'), '고찰이 너무 짧습니다. (공백 제외 50자 미만)', '결과가 왜 그렇게 나왔는지 근거를 들어 설명하세요.');
      }
    }
    const purpose = sectionText(lines, sec, 'purpose');
    const conclusion = sectionText(lines, sec, 'conclusion');
    if (purpose && conclusion) {
      const words = keywords(purpose);
      // 목적 핵심어가 결론에 2개 이상(목적 핵심어가 1개뿐이면 1개) 있어야 연결된 것으로 본다
      const need = Math.min(2, words.length);
      const hit = words.filter(w => conclusion.includes(w)).length;
      if (words.length && hit < need) {
        add('warn', '내용', lineOf('conclusion'), `결론이 실험 목적과 연결되지 않습니다. (목적의 핵심어 ${words.slice(0, 3).map(w => `"${w}"`).join(', ')}가 결론에 없음)`, '결론에서 목적에 대한 답을 직접 쓰세요.');
      }
    }
  }

  // 6. 참고문헌 형식
  if (checks.reference && sec.content.reference) {
    for (const i of sec.content.reference) {
      const t = lines[i].trim();
      if (!t) continue;
      const hasYear = /(19|20)\d{2}/.test(t);
      const hasUrl = /(https?:\/\/|www\.)/i.test(t);
      if (!hasYear && !hasUrl) {
        add('warn', '참고문헌', i, '출처에 연도나 URL이 없습니다.', '저자, 연도, 제목, 출판사(또는 URL) 순서로 쓰세요.');
      } else if (hasUrl && !/(접속|검색|열람|accessed)/i.test(t)) {
        add('info', '참고문헌', i, '웹 자료에 접속일이 없습니다.', 'URL 뒤에 "(접속일: 2026. 11. 16.)"처럼 쓰세요.');
      }
    }
  }

  // 점수: 100점에서 감점
  const count = lvl => issues.filter(x => x.level === lvl).length;
  const stats = { error: count('error'), warn: count('warn'), info: count('info'), lines: lines.length };
  const score = Math.max(0, 100 - stats.error * R.penalty.error - stats.warn * R.penalty.warn - stats.info * R.penalty.info);

  issues.sort((a, b) => (a.line === null ? -1 : a.line) - (b.line === null ? -1 : b.line));
  const sections = sec.found.map(f => ({ key: f.key, label: sectionLabel(f.key), line: f.line }));
  return { score, issues, sections, stats };
}

// 목적 문장에서 핵심어를 뽑는다: 2글자 이상 한글 단어에서 조사를 떼어 낸다
function keywords(text) {
  const words = text.match(/[가-힣]{2,}/g) || [];
  const out = [];
  for (let w of words) {
    w = w.replace(/(으로|에서|하는|하여|한다|하기|을|를|이|가|은|는|의|에|과|와|로|도)$/, '');
    if (w.length >= 2 && !R.stopwords.includes(w) && !out.includes(w)) out.push(w);
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { checkReport, matchHeading, keywords };
