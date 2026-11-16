// 파일에서 글자만 뽑아 내는 모듈
// .hwpx와 .docx는 사실 zip 파일이다. 압축을 풀면 본문이 XML로 들어 있다.
//   한글(.hwpx): Contents/section0.xml, section1.xml ...  문단 <hp:p>, 글자 <hp:t>
//   워드(.docx): word/document.xml                       문단 <w:p>,  글자 <w:t>
// 두 형식 모두 "문단 p 안에 글자 t"라는 같은 구조라서 함수 하나로 읽는다.

async function readReportFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.txt') || name.endsWith('.md')) return await file.text();
  if (name.endsWith('.hwp')) {
    throw new Error('.hwp(옛 한글 형식)는 읽을 수 없습니다. 한글에서 "다른 이름으로 저장 → .hwpx"로 저장해서 올려 주세요.');
  }
  if (!name.endsWith('.hwpx') && !name.endsWith('.docx')) {
    throw new Error('지원하는 파일: .hwpx, .docx, .txt');
  }

  const zip = await JSZip.loadAsync(file);
  let xmlPaths;
  if (name.endsWith('.hwpx')) {
    xmlPaths = Object.keys(zip.files)
      .filter(p => /^Contents\/section\d+\.xml$/.test(p))
      .sort((a, b) => sectionNo(a) - sectionNo(b)); // section10이 section2보다 뒤에 오도록 숫자로 정렬
  } else {
    xmlPaths = ['word/document.xml'];
  }

  const lines = [];
  for (const path of xmlPaths) {
    const entry = zip.file(path);
    if (!entry) continue;
    const xml = await entry.async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    collectParagraphs(doc.documentElement, lines);
  }
  if (!lines.length) throw new Error('파일에서 글자를 찾지 못했습니다.');
  return lines.join('\n');
}

function sectionNo(path) {
  return Number(path.match(/section(\d+)/)[1]);
}

// XML 나무를 돌면서 문단(p)을 만나면 한 줄로 만든다.
// localName을 쓰면 접두어(hp:, w:)와 관계없이 'p', 't'로 비교할 수 있다.
function collectParagraphs(node, lines) {
  for (const child of node.children) {
    if (child.localName === 'p') readParagraph(child, lines);
    else collectParagraphs(child, lines);
  }
}

function readParagraph(p, lines) {
  let text = '';
  const visit = node => {
    for (const child of node.children) {
      if (child.localName === 'p') readParagraph(child, lines); // 표 칸 안의 문단은 따로 한 줄
      else if (child.localName === 't') text += child.textContent;
      else if (child.localName === 'tab') text += ' ';
      else visit(child);
    }
  };
  visit(p);
  if (text.trim()) lines.push(text.trim());
}
