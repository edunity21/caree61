/* 진로전담교사 심층면접 DOCX 생성 — 문항 수는 questions.json 에서 그대로 따릅니다 */
const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, PageBreak, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  HeadingLevel, PageNumber, Footer, convertMillimetersToTwip,
} = require("docx");

const ITEMS = JSON.parse(fs.readFileSync("questions.json", "utf8"));
/* 숫자를 손으로 적어 두면 문항이 늘 때마다 표지와 파일 이름이 어긋납니다. */
const N = ITEMS.length;
const SPACED = String(N).split("").join(" ");

const FONT = "맑은 고딕";
const NAVY = "1F3A5F";
const BRASS = "9C6B1E";
const INK = "1A1A1A";
const INK2 = "4E5D6B";
const RULE = "D3DAE2";
const BG = "F4F6F9";

/* 영역별 머리띠 색 */
const AREA_COLOR = {
  "제도·직무": "1F3A5F", "교직관·이력": "7A3E2E", "교육과정": "2E5E4E",
  "상담": "5B3A72", "검사·이론": "1F4E5F", "AI·미래": "3A4A7A",
  "체험·플랫폼": "6B5A1E", "전남·지역": "5E3A3A",
};

const P = (o) => new Paragraph(o);
const T = (text, o = {}) => new TextRun({ text, font: FONT, color: INK, size: 19, ...o });

const NO_BORDER = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
};
const pad = (n) => String(n).padStart(2, "0");
const mmss = (s) => `${Math.floor(s / 60)}분 ${s % 60}초`;

/* ── 페이지 폭: A4(210mm) − 좌우 여백(각 16mm) = 178mm ── */
const W = convertMillimetersToTwip(178);

/* 색 머리띠 : 번호 · 제목 / 등급·영역·유형 */
function headerBand(it) {
  const c = AREA_COLOR[it.area] || NAVY;
  return new Table({
    columnWidths: [W],
    borders: NO_BORDER,
    rows: [
      new TableRow({
        children: [new TableCell({
          width: { size: W, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: c, color: "auto" },
          margins: { top: 90, bottom: 90, left: 140, right: 140 },
          borders: NO_BORDER,
          children: [
            P({
              spacing: { after: 20 },
              children: [
                T(pad(it.no) + "  ", { color: "FFFFFF", bold: true, size: 26 }),
                T(it.slug, { color: "FFFFFF", bold: true, size: 23 }),
              ],
            }),
            P({
              children: [T(
                `${it.grade}등급  ·  ${it.area}  ·  ${it.kind}  ·  답변 ${mmss(it.total_sec)}`,
                { color: "DDE4EC", size: 15 }
              )],
            }),
          ],
        })],
      }),
    ],
  });
}

/* 회색 배경 상자 (제시문 등) */
function shadedBox(children, fill) {
  return new Table({
    columnWidths: [W],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      left: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      right: { style: BorderStyle.SINGLE, size: 2, color: RULE },
    },
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: W, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: fill || BG, color: "auto" },
        margins: { top: 110, bottom: 110, left: 150, right: 150 },
        children,
      })],
    })],
  });
}

function sectionLabel(text, color) {
  return P({
    spacing: { before: 200, after: 70 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: color || RULE } },
    children: [T(text, { bold: true, size: 16, color: color || INK2, characterSpacing: 12 })],
  });
}

/* 답안 요약표 : 구간 | 시간 | 대응 하위질문 */
function segTable(it) {
  const cw = [Math.round(W * 0.18), Math.round(W * 0.18), W - Math.round(W * 0.18) * 2];
  const cell = (txt, i, o = {}) => new TableCell({
    width: { size: cw[i], type: WidthType.DXA },
    margins: { top: 55, bottom: 55, left: 100, right: 100 },
    shading: o.head ? { type: ShadingType.CLEAR, fill: BG, color: "auto" } : undefined,
    children: [P({ children: [T(txt, { size: 15, bold: !!o.head, color: o.head ? INK2 : INK })] })],
  });
  return new Table({
    columnWidths: cw,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      left: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      right: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: RULE },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [cell("구간", 0, { head: 1 }), cell("시간", 1, { head: 1 }), cell("대응 하위질문", 2, { head: 1 })],
      }),
      ...it.answer.map((s) => new TableRow({
        children: [
          cell(s.label, 0),
          cell(s.sec + "초", 1),
          cell(s.sub ? `${s.sub}번 — ${it.subs[Number(s.sub) - 1]}` : "전체 마무리", 2),
        ],
      })),
    ],
  });
}

function questionPages(it, isLast) {
  const c = AREA_COLOR[it.area] || NAVY;
  const out = [];

  out.push(headerBand(it));

  /* 평가 주안점 */
  out.push(P({
    spacing: { before: 130, after: 0 },
    children: [
      T("평가 주안점  ", { size: 14, bold: true, color: BRASS, characterSpacing: 10 }),
      T(it.focus.join("  ·  "), { size: 15, color: INK2 }),
    ],
  }));

  /* 제시문 */
  out.push(sectionLabel("제 시 문", c));
  out.push(shadedBox([P({ children: [T(it.prompt, { size: 18 })], spacing: { line: 300 } })]));

  /* 하위질문 */
  out.push(sectionLabel("하 위 질 문", c));
  it.subs.forEach((s, i) => out.push(P({
    spacing: { after: 55, line: 280 },
    indent: { left: 200, hanging: 200 },
    children: [T(`${i + 1}. `, { bold: true, color: c, size: 18 }), T(s, { size: 18 })],
  })));

  /* 핵심 키워드 */
  out.push(sectionLabel("핵 심 키 워 드", c));
  out.push(P({
    spacing: { after: 40, line: 280 },
    children: [T(it.keywords.join("  ·  "), { size: 16, color: INK2 })],
  }));

  /* 답안 구성 */
  out.push(sectionLabel("답 안 구 성", c));
  out.push(segTable(it));

  /* 구상 메모 — 남는 공간을 실제 연습에 쓰도록.
     빈 문단에 밑줄을 주면 인접 문단끼리 테두리가 병합되므로 표로 그립니다. */
  out.push(sectionLabel("구 상 메 모   ( 4 0 초 )", c));
  out.push(new Table({
    columnWidths: [W],
    borders: {
      top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.DOTTED, size: 3, color: RULE },
      insideHorizontal: { style: BorderStyle.DOTTED, size: 3, color: RULE },
    },
    rows: Array.from({ length: 7 }, () => new TableRow({
      height: { value: 400, rule: "atLeast" },
      children: [new TableCell({
        width: { size: W, type: WidthType.DXA },
        borders: {
          top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.DOTTED, size: 3, color: RULE },
        },
        children: [P({ children: [T("", { size: 16 })] })],
      })],
    })),
  }));

  /* ── 2페이지: 모범답안 ── */
  out.push(P({ children: [new PageBreak()] }));
  out.push(P({
    spacing: { after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: c } },
    children: [
      T(pad(it.no) + "  ", { bold: true, size: 20, color: c }),
      T("모범답안", { bold: true, size: 20, color: c }),
      T(`    ${it.slug}`, { size: 15, color: INK2 }),
    ],
  }));

  it.answer.forEach((s) => {
    out.push(P({
      spacing: { before: 150, after: 45 },
      children: [
        T(`${s.label} · ${s.sec}초`, { bold: true, size: 15, color: BRASS }),
        T(s.sub ? `  ·  하위질문 ${s.sub}` : "", { size: 14, color: INK2 }),
      ],
    }));
    out.push(P({
      spacing: { after: 60, line: 320 },
      indent: { left: 120 },
      children: [T(s.text, { size: 18 })],
    }));
  });

  /* 채점 포인트 */
  const bullets = (title, arr, color) => {
    out.push(sectionLabel(title, color));
    arr.forEach((x) => out.push(P({
      spacing: { after: 40, line: 270 },
      indent: { left: 220, hanging: 130 },
      children: [T("– ", { color: color, size: 16 }), T(x, { size: 16, color: INK2 })],
    })));
  };
  bullets("면 접 위 원 이  확 인 하 는  것", it.rubric, NAVY);
  bullets("여 기 서  갈 립 니 다", it.pitfall, "9B2C2C");
  bullets("인 용 할  수  있 는  근 거", it.evidence, BRASS);

  out.push(P({
    spacing: { before: 130 },
    children: [T(`원본 대응  ${it.source}`, { size: 13, color: "8A97A5", italics: true })],
  }));

  if (!isLast) out.push(P({ children: [new PageBreak()] }));
  return out;
}

/* ── 표지 ── */
function cover() {
  const byArea = {};
  ITEMS.forEach((i) => { (byArea[i.area] = byArea[i.area] || []).push(i.no); });
  const total = ITEMS.reduce((a, b) => a + b.total_sec, 0);

  const out = [
    P({ spacing: { before: 2200, after: 0 }, alignment: AlignmentType.CENTER,
        children: [T("전라남도교육청  진로전담교사 선발", { size: 18, color: INK2, characterSpacing: 30 })] }),
    P({ spacing: { before: 260, after: 0 }, alignment: AlignmentType.CENTER,
        children: [T("2차 심층면접 대비", { size: 44, bold: true, color: NAVY })] }),
    P({ spacing: { before: 90, after: 0 }, alignment: AlignmentType.CENTER,
        children: [T(SPACED + " 문 항", { size: 62, bold: true, color: NAVY, characterSpacing: 40 })] }),
    P({ spacing: { before: 200, after: 0 }, alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: BRASS } },
        children: [T("", { size: 2 })] }),
    P({ spacing: { before: 200 }, alignment: AlignmentType.CENTER,
        children: [T("제시문 + 하위질문 3개  ·  답변 발화 2분 22초 통일  ·  구상 40초 포함 3분",
                     { size: 16, color: INK2 })] }),
    P({ spacing: { before: 60 }, alignment: AlignmentType.CENTER,
        children: [T(`전체 답변 분량 ${Math.round(total / 60)}분  ·  239문항 원본 전량 반영`,
                     { size: 16, color: INK2 })] }),
    P({ children: [new PageBreak()] }),

    P({ spacing: { after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY } },
        children: [T("영 역 별  구 성", { bold: true, size: 24, color: NAVY, characterSpacing: 20 })] }),
  ];

  const cw = [Math.round(W * 0.26), Math.round(W * 0.10), W - Math.round(W * 0.26) - Math.round(W * 0.10)];
  const cell = (txt, i, o = {}) => new TableCell({
    width: { size: cw[i], type: WidthType.DXA },
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
    children: [P({ children: [T(txt, { size: 16, bold: !!o.head, color: o.color || (o.head ? "FFFFFF" : INK) })] })],
  });

  out.push(new Table({
    columnWidths: cw,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      left: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      right: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: RULE },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell("영역", 0, { head: 1, fill: NAVY }),
          cell("문항", 1, { head: 1, fill: NAVY }),
          cell("번호", 2, { head: 1, fill: NAVY }),
        ],
      }),
      ...Object.keys(byArea).map((a) => new TableRow({
        children: [
          cell(a, 0, { color: AREA_COLOR[a] }),
          cell(String(byArea[a].length), 1),
          cell(byArea[a].map(pad).join(", "), 2),
        ],
      })),
    ],
  }));

  out.push(P({ spacing: { before: 320, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY } },
      children: [T("문 항 목 록", { bold: true, size: 24, color: NAVY, characterSpacing: 20 })] }));

  ITEMS.forEach((it) => out.push(P({
    spacing: { after: 25, line: 250 },
    indent: { left: 420, hanging: 420 },
    children: [
      T(pad(it.no) + "  ", { bold: true, size: 15, color: AREA_COLOR[it.area] || NAVY }),
      T(it.slug, { size: 15 }),
      T(`  · ${it.grade} · ${it.area}`, { size: 13, color: "8A97A5" }),
    ],
  })));

  out.push(P({ children: [new PageBreak()] }));
  return out;
}

const doc = new Document({
  creator: "진로전담교사 심층면접 대비",
  title: "진로전담교사 심층면접 " + N + "문항",
  styles: { default: { document: { run: { font: FONT, size: 19, color: INK } } } },
  sections: [{
    properties: {
      page: {
        margin: {
          top: convertMillimetersToTwip(16), bottom: convertMillimetersToTwip(14),
          left: convertMillimetersToTwip(16), right: convertMillimetersToTwip(16),
        },
      },
    },
    footers: {
      default: new Footer({
        children: [P({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 14, color: "8A97A5" })],
        })],
      }),
    },
    children: [
      ...cover(),
      ...ITEMS.flatMap((it, i) => questionPages(it, i === ITEMS.length - 1)),
    ],
  }],
});

Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync("진로전담교사_심층면접_" + N + "문항.docx", b);
  console.log("작성 완료 ·", N, "문항 ·", (b.length / 1024 / 1024).toFixed(2), "MB");
});
