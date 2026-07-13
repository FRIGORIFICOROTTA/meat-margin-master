// Memorial de Cálculo — PDF para validação do contador.
// Documenta todas as fórmulas e critérios usados nas DREs Gerencial e Fiscal.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtBRL, fmtPct, mesNome } from "@/lib/finance";
import {
  mergeConfig,
  REGIME_LABEL,
  type ConfigTributaria,
  type RegimeTributario,
} from "@/lib/fiscal";

type DREValues = {
  total_vendas: number;
  devolucoes: number;
  cmv: number;
  variacao_estoque: number;
  total_despesas: number;
  estoque_inicial: number;
  estoque_final: number;
  resultado_bruto: number;
  resultado_liquido_gerencial: number;
};

type FiscalValues = {
  receita_bruta: number;
  devolucoes: number;
  impostos_total: number;
  impostos_breakdown: Array<{ label: string; valor: number }>;
  receita_liquida: number;
  cmv: number;
  variacao_estoque: number;
  cmv_ajustado: number;
  lucro_bruto: number;
  despesas_operacionais: number;
  lucro_antes_ir: number;
  irpj: number;
  csll: number;
  resultado_liquido_fiscal: number;
};

export type MemorialOpts = {
  grupo?: string | null;
  empresa: string;
  cnpj?: string | null;
  regime: RegimeTributario;
  config: ConfigTributaria | null;
  mes: number;
  ano: number;
  dre: DREValues;
  fiscalEstimado: FiscalValues;
  fiscalReal?: FiscalValues | null;
  temLancamentosReais: boolean;
};

const PRIMARY: [number, number, number] = [153, 60, 29]; // Meat Red

/**
 * A fonte padrão do jsPDF (Helvetica) usa codificação WinAnsi/Latin-1 e NÃO
 * possui glifos para símbolos como − (minus U+2212), Σ, ±, →, ≥ e aspas
 * tipográficas. Sem tratamento eles são renderizados como lixo (", £, etc.).
 * Este sanitizador troca todo caractere fora do Latin-1 por um equivalente
 * seguro; é aplicado a TODO texto que entra no PDF.
 */
const CHAR_MAP: Record<string, string> = {
  "\u2212": "-", // − minus matemático
  "\u2013": "-", // – en dash
  "\u2014": "-", // — em dash
  "\u2211": "Soma de", // ∑ n-ary summation
  "\u03A3": "Soma de", // Σ sigma grego (o usado no código)
  "\u00B1": "+/-", // ±
  "\u2192": "->", // →
  "\u2264": "<=", // ≤
  "\u2265": ">=", // ≥
  "\u00D7": "x", // ×
  "\u2260": "!=", // ≠
  "\u2248": "~", // ≈
  "\u2022": "-", // • bullet
  "\u2018": "'",
  "\u2019": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u2026": "...", // …
  "\u00A0": " ", // NBSP
};

export function sanitizePdfText(s: string): string {
  let out = "";
  for (const ch of s) {
    if (CHAR_MAP[ch] !== undefined) {
      out += CHAR_MAP[ch];
    } else if (ch.charCodeAt(0) > 255) {
      // Fora do Latin-1 e sem mapeamento: remove o acento se possível.
      const semAcento = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      out += semAcento.charCodeAt(0) <= 255 ? semAcento : "?";
    } else {
      out += ch;
    }
  }
  return out;
}

/** Sanitiza recursivamente linhas de tabela. */
function sanRows(rows: string[][]): string[][] {
  return rows.map((r) => r.map((c) => sanitizePdfText(String(c))));
}

export function exportMemorialCalculoPdf(opts: MemorialOpts) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  // Intercepta doc.text: TODO texto passa pelo sanitizador antes de ir ao PDF.
  // Garante que nenhum símbolo fora do Latin-1 (−, Σ, ±, →) escape e vire lixo,
  // inclusive em textos futuros adicionados ao memorial.
  const rawText = doc.text.bind(doc);
  (doc as unknown as { text: typeof doc.text }).text = ((
    txt: string | string[],
    x: number,
    y: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...rest: any[]
  ) => {
    const clean = Array.isArray(txt)
      ? txt.map((t) => sanitizePdfText(String(t)))
      : sanitizePdfText(String(txt));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rawText as any)(clean, x, y, ...rest);
  }) as typeof doc.text;

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  // ---------- Cabeçalho ----------
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pageW, 70, "F");
  doc.setTextColor(255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Memorial de Cálculo — DRE Gerencial e Fiscal", margin, 32);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Documento técnico para validação contábil", margin, 50);
  y = 90;

  // ---------- Identificação ----------
  doc.setTextColor(0);
  section(doc, "1. Identificação", y);
  y += 18;

  const ident: Array<[string, string]> = [
    ["Empresa", opts.empresa],
    ["CNPJ", opts.cnpj || "—"],
    ["Grupo Econômico", opts.grupo || "—"],
    ["Regime Tributário", REGIME_LABEL[opts.regime]],
    ["Período de Apuração", `${mesNome(opts.mes)}/${opts.ano}`],
    ["Data de Emissão", new Date().toLocaleString("pt-BR")],
  ];
  autoTable(doc, {
    startY: y,
    body: sanRows(ident),
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 140 } },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  // ---------- Origem dos dados ----------
  y = section(doc, "2. Origem dos Dados", y);
  y = paragraph(
    doc,
    "Os valores gerenciais (receita, CMV, despesas e estoques) são extraídos por parser " +
      "determinístico dos relatórios em PDF emitidos pelo ERP do grupo (DRE mensal e Inventário " +
      "Inicial/Final). Antes da persistência, o usuário revisa e confirma os valores na tela de " +
      "Importação. Subtotais e categorias-pai do PDF são descartados por heurística para evitar " +
      "dupla contagem. A importação é idempotente: novo upload do mesmo período substitui o anterior.",
    y,
    margin,
    pageW - 2 * margin,
  );
  y += 8;

  // ---------- DRE Gerencial ----------
  y = section(doc, "3. DRE Gerencial — Fórmulas", y);
  y = formulasTable(
    doc,
    [
      ["Receita Bruta", "total_vendas (do ERP)"],
      ["(−) Devoluções", "devolucoes (do ERP)"],
      ["= Receita Líquida Gerencial", "Receita Bruta − Devoluções"],
      ["(−) CMV", "cmv (do ERP, custo das mercadorias vendidas)"],
      [
        "(±) Variação de Estoque",
        "Estoque Inicial − Estoque Final  (positiva = consumo extra; aumenta o custo)",
      ],
      ["= CMV Ajustado", "CMV + Variação de Estoque"],
      ["= Resultado Bruto", "Receita Líquida − CMV Ajustado"],
      ["(−) Despesas Operacionais", "Σ despesas_detalhe.valor"],
      [
        "= Resultado Líquido Gerencial",
        "Resultado Bruto − Despesas Operacionais",
      ],
    ],
    y,
    margin,
    pageW,
  );

  // ---------- DRE Fiscal Estimado ----------
  y = ensureSpace(doc, y, 80, margin);
  y = section(doc, "4. DRE Fiscal — Estimativa Automática", y);
  y = paragraph(
    doc,
    "A DRE Fiscal Estimada aplica as alíquotas configuradas para o regime sobre a base tributável " +
      "(Receita Bruta − Devoluções) e, conforme o regime, sobre o lucro. As alíquotas vivem em " +
      "empresas.config_tributaria; valores ausentes assumem os defaults definidos em src/lib/fiscal.ts.",
    y,
    margin,
    pageW - 2 * margin,
  );
  y += 4;

  const fRows = regimeFormulas(opts.regime);
  y = formulasTable(doc, fRows, y, margin, pageW);

  // Tabela de alíquotas efetivas
  y = ensureSpace(doc, y, 100, margin);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Alíquotas configuradas nesta empresa", margin, y);
  y += 6;
  const cfg = mergeConfig(opts.regime, opts.config);
  const aliqRows = aliquotasRows(opts.regime, cfg);
  autoTable(doc, {
    startY: y,
    head: sanRows([["Parâmetro", "Valor", "Origem"]]),
    body: sanRows(aliqRows),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: PRIMARY, textColor: 255 },
    columnStyles: { 1: { halign: "right", cellWidth: 80 }, 2: { cellWidth: 90 } },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  // ---------- DRE Fiscal Real ----------
  y = ensureSpace(doc, y, 80, margin);
  y = section(doc, "5. DRE Fiscal — Valores Reais (Lançamentos)", y);
  y = paragraph(
    doc,
    "Quando o usuário lança valores efetivamente pagos (DAS, DARF, guias) na tela de Lançamentos " +
      "Fiscais, o sistema substitui a estimativa pelo valor real, tributo a tributo. Tributos sem " +
      "lançamento continuam usando a estimativa. Ajustes do tipo 'Outros' entram com sinal: " +
      "+1 (despesa) soma aos tributos; −1 (crédito) abate. A base operacional (Receita − CMV " +
      "Ajustado − Despesas) é idêntica à da visão Gerencial — a diferença entre Gerencial e Fiscal " +
      "corresponde exclusivamente ao bloco de tributos.",
    y,
    margin,
    pageW - 2 * margin,
  );
  y += 8;

  // ---------- Exemplo numérico ----------
  doc.addPage();
  y = margin;
  y = section(doc, `6. Exemplo Numérico — ${mesNome(opts.mes)}/${opts.ano}`, y);

  const v = opts.dre.total_vendas;
  const pct = (n: number) => (v > 0 ? n / v : 0);
  const fmt = (n: number) => fmtBRL(n);
  const fmtP = (n: number) => (v > 0 ? fmtPct(pct(n)) : "—");

  // Gerencial
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("6.1 DRE Gerencial", margin, y);
  y += 6;
  const gerLinhas: Array<[string, string, string]> = [
    ["Receita Bruta (Vendas)", fmt(v), fmtP(v)],
    ["(−) Devoluções", fmt(-opts.dre.devolucoes), fmtP(-opts.dre.devolucoes)],
    ["(−) CMV", fmt(-opts.dre.cmv), fmtP(-opts.dre.cmv)],
    [
      "(±) Variação de Estoque",
      fmt(-opts.dre.variacao_estoque),
      fmtP(-opts.dre.variacao_estoque),
    ],
    ["= Resultado Bruto Ajustado", fmt(opts.dre.resultado_bruto - opts.dre.variacao_estoque), fmtP(opts.dre.resultado_bruto - opts.dre.variacao_estoque)],
    ["(−) Despesas Operacionais", fmt(-opts.dre.total_despesas), fmtP(-opts.dre.total_despesas)],
    [
      "= Resultado Líquido Gerencial",
      fmt(opts.dre.resultado_liquido_gerencial),
      fmtP(opts.dre.resultado_liquido_gerencial),
    ],
  ];
  autoTable(doc, {
    startY: y,
    head: sanRows([["Descrição", "Valor", "% Receita"]]),
    body: sanRows(gerLinhas),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: PRIMARY, textColor: 255 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right", cellWidth: 70 } },
    didParseCell: (data) => {
      const label = gerLinhas[data.row.index]?.[0] ?? "";
      if (label.startsWith("=")) data.cell.styles.fontStyle = "bold";
    },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  // Fiscal estimado
  y = ensureSpace(doc, y, 120, margin);
  doc.setFont("helvetica", "bold");
  doc.text("6.2 DRE Fiscal Estimada", margin, y);
  y += 6;
  y = fiscalTable(doc, opts.fiscalEstimado, y, margin, PRIMARY);

  // Fiscal real (se houver)
  if (opts.fiscalReal && opts.temLancamentosReais) {
    y = ensureSpace(doc, y, 120, margin);
    doc.setFont("helvetica", "bold");
    doc.text("6.3 DRE Fiscal Real (com lançamentos efetivos)", margin, y);
    y += 6;
    y = fiscalTable(doc, opts.fiscalReal, y, margin, PRIMARY);
  }

  // ---------- Glossário ----------
  y = ensureSpace(doc, y, 160, margin);
  y = section(doc, "7. Glossário e Premissas", y);
  const glossario: Array<[string, string]> = [
    ["CMV", "Custo da Mercadoria Vendida, conforme apurado pelo ERP."],
    [
      "Variação de Estoque",
      "Diferença Estoque Inicial − Estoque Final. Positiva indica consumo físico superior ao registrado em CMV (aumenta o custo real do período).",
    ],
    [
      "CMV Ajustado",
      "CMV + Variação de Estoque. É a base operacional usada tanto na DRE Gerencial quanto na Fiscal.",
    ],
    [
      "Base Tributável",
      "Receita Bruta − Devoluções. Aplica-se às alíquotas de PIS, COFINS, ICMS, ISS e DAS.",
    ],
    [
      "Presunção (Lucro Presumido)",
      "Percentual da receita usado como base de IRPJ/CSLL (defaults: 8% IRPJ e 12% CSLL para comércio).",
    ],
    [
      "Lucro Real (IRPJ/CSLL)",
      "Aplicado sobre o Lucro antes do IR quando positivo; zero quando o resultado for prejuízo.",
    ],
    [
      "Idempotência",
      "Reimportar PDFs do mesmo período substitui os dados anteriores — não há duplicação.",
    ],
    [
      "Subtotais",
      "Linhas de subtotal/categoria-pai do PDF do ERP são descartadas no parser para evitar dupla contagem.",
    ],
  ];
  autoTable(doc, {
    startY: y,
    body: sanRows(glossario),
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak", valign: "top" },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 130 },
      1: { cellWidth: "auto" },
    },
    tableWidth: pageW - margin * 2,
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 20;

  // ---------- Parecer do contador ----------
  // Precisa de espaço para o texto + 2 linhas de campos + as 2 linhas de
  // observação; 180pt era insuficiente e o bloco colidia com o rodapé.
  y = ensureSpace(doc, y, 220, margin);
  y = section(doc, "8. Parecer do Contador Responsável", y);
  // paragraph() mede a quebra corretamente e devolve o y real da próxima linha
  // (o doc.text com maxWidth antigo devolvia y fixo e sobrepunha os campos).
  y = paragraph(
    doc,
    "Confirmo que as lógicas de cálculo descritas neste memorial estão aderentes à legislação " +
      "tributária aplicável ao regime informado e ao período em análise.",
    y,
    margin,
    pageW - 2 * margin,
  );
  y += 18;
  const colW = (pageW - 2 * margin - 20) / 2;
  field(doc, "Nome", margin, y, colW);
  field(doc, "CRC", margin + colW + 20, y, colW);
  y += 36;
  field(doc, "Data", margin, y, colW);
  field(doc, "Assinatura", margin + colW + 20, y, colW);
  y += 50;
  doc.setFontSize(9);
  doc.text("Parecer:  (  ) De acordo     (  ) Ajustes necessários", margin, y);
  y += 16;
  line(doc, margin, y, pageW - margin);
  y += 16;
  line(doc, margin, y, pageW - margin);

  // ---------- Rodapé + Marca d'água ----------
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);

    // Marca d'água diagonal discreta no centro da página.
    // Fonte menor e opacidade baixa para NÃO invadir o rodapé nem o bloco de
    // assinatura do contador (o texto anterior, em 72pt, transbordava).
    const anyDoc = doc as unknown as {
      GState?: new (opts: { opacity: number }) => unknown;
      setGState?: (g: unknown) => void;
    };
    const temGState = !!(anyDoc.GState && anyDoc.setGState);
    if (temGState) {
      anyDoc.setGState!(new anyDoc.GState!({ opacity: 0.04 }));
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(46);
    doc.setTextColor(...PRIMARY);
    doc.text("ROTA DAS CARNES", pageW / 2, pageH / 2, {
      align: "center",
      angle: 30,
      baseline: "middle",
    });
    if (temGState) {
      anyDoc.setGState!(new anyDoc.GState!({ opacity: 1 }));
    }

    // Rodapé
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `${opts.empresa} · ${mesNome(opts.mes)}/${opts.ano} · Memorial de Cálculo · Página ${i}/${total}`,
      margin,
      pageH - 16,
    );
  }

  doc.save(
    `Memorial_Calculo_DRE_${slug(opts.empresa)}_${opts.mes}-${opts.ano}.pdf`,
  );
}

// ---------------- helpers ----------------

function section(doc: jsPDF, title: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...PRIMARY);
  doc.text(title, 40, y);
  doc.setTextColor(0);
  doc.setLineWidth(0.5);
  doc.setDrawColor(...PRIMARY);
  doc.line(40, y + 3, doc.internal.pageSize.getWidth() - 40, y + 3);
  return y + 16;
}

function paragraph(
  doc: jsPDF,
  text: string,
  y: number,
  x: number,
  maxW: number,
): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(40);
  // Sanitiza ANTES de medir: splitTextToSize precisa medir exatamente a string
  // que será impressa, senão a quebra de linha sai errada e o texto é cortado.
  const lines = doc.splitTextToSize(sanitizePdfText(text), maxW);
  doc.text(lines, x, y);
  return y + lines.length * 12 + 4;
}

function formulasTable(
  doc: jsPDF,
  rows: Array<[string, string]>,
  y: number,
  margin: number,
  pageW: number,
): number {
  autoTable(doc, {
    startY: y,
    head: sanRows([["Linha", "Fórmula / Origem"]]),
    body: sanRows(rows),
    styles: { fontSize: 9, cellPadding: 5, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: PRIMARY, textColor: 255 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 175 },
      1: { cellWidth: "auto" },
    },
    tableWidth: pageW - margin * 2,
    margin: { left: margin, right: margin },
  });
  return (doc as any).lastAutoTable.finalY + 16;
}

function regimeFormulas(regime: RegimeTributario): Array<[string, string]> {
  const base: Array<[string, string]> = [
    ["Base Tributável", "Receita Bruta − Devoluções"],
  ];
  if (regime === "simples") {
    return [
      ...base,
      ["DAS (Simples Nacional)", "Base × alíquota_simples"],
      ["IRPJ/CSLL", "Não se aplica (englobados no DAS)"],
    ];
  }
  if (regime === "presumido") {
    return [
      ...base,
      ["PIS", "Base × pis"],
      ["COFINS", "Base × cofins"],
      ["ICMS", "Base × icms"],
      ["ISS (se aplicável)", "Base × iss"],
      ["IRPJ", "Base × presuncao_irpj × irpj"],
      ["CSLL", "Base × presuncao_csll × csll"],
    ];
  }
  return [
    ...base,
    ["PIS", "Base × pis"],
    ["COFINS", "Base × cofins"],
    ["ICMS", "Base × icms"],
    ["ISS (se aplicável)", "Base × iss"],
    ["IRPJ", "max(Lucro antes IR, 0) × irpj"],
    ["CSLL", "max(Lucro antes IR, 0) × csll"],
  ];
}

function aliquotasRows(
  regime: RegimeTributario,
  cfg: ConfigTributaria,
): Array<[string, string, string]> {
  const fmtA = (n?: number) => (n == null ? "—" : `${(n * 100).toFixed(4)}%`);
  const has = (k: keyof ConfigTributaria) =>
    cfg[k] != null ? "Configurada" : "Padrão";
  if (regime === "simples") {
    return [["DAS (alíquota_simples)", fmtA(cfg.aliquota_simples), has("aliquota_simples")]];
  }
  const rows: Array<[string, string, string]> = [
    ["PIS", fmtA(cfg.pis), has("pis")],
    ["COFINS", fmtA(cfg.cofins), has("cofins")],
    ["ICMS", fmtA(cfg.icms), has("icms")],
  ];
  if (cfg.iss) rows.push(["ISS", fmtA(cfg.iss), has("iss")]);
  rows.push(["IRPJ", fmtA(cfg.irpj), has("irpj")]);
  rows.push(["CSLL", fmtA(cfg.csll), has("csll")]);
  if (regime === "presumido") {
    rows.push(["Presunção IRPJ", fmtA(cfg.presuncao_irpj), has("presuncao_irpj")]);
    rows.push(["Presunção CSLL", fmtA(cfg.presuncao_csll), has("presuncao_csll")]);
  }
  return rows;
}

function fiscalTable(
  doc: jsPDF,
  f: FiscalValues,
  y: number,
  margin: number,
  primary: [number, number, number],
): number {
  const v = f.receita_bruta;
  const pct = (n: number) => (v > 0 ? `${((n / v) * 100).toFixed(2)}%` : "—");
  const rows: Array<[string, string, string]> = [
    ["Receita Bruta", fmtBRL(f.receita_bruta), pct(f.receita_bruta)],
  ];
  if (f.devolucoes) rows.push(["(−) Devoluções", fmtBRL(-f.devolucoes), pct(-f.devolucoes)]);
  for (const i of f.impostos_breakdown) {
    rows.push([`(−) ${i.label}`, fmtBRL(-i.valor), pct(-i.valor)]);
  }
  rows.push(["= Receita Líquida", fmtBRL(f.receita_liquida), pct(f.receita_liquida)]);
  rows.push(["(−) CMV", fmtBRL(-f.cmv), pct(-f.cmv)]);
  rows.push(["(±) Variação de Estoque", fmtBRL(-f.variacao_estoque), pct(-f.variacao_estoque)]);
  rows.push(["= Lucro Bruto", fmtBRL(f.lucro_bruto), pct(f.lucro_bruto)]);
  rows.push(["(−) Despesas Operacionais", fmtBRL(-f.despesas_operacionais), pct(-f.despesas_operacionais)]);
  rows.push(["= Lucro antes IR/CSLL", fmtBRL(f.lucro_antes_ir), pct(f.lucro_antes_ir)]);
  if (f.irpj) rows.push(["(−) IRPJ", fmtBRL(-f.irpj), pct(-f.irpj)]);
  if (f.csll) rows.push(["(−) CSLL", fmtBRL(-f.csll), pct(-f.csll)]);
  rows.push([
    "= Resultado Líquido Fiscal",
    fmtBRL(f.resultado_liquido_fiscal),
    pct(f.resultado_liquido_fiscal),
  ]);
  autoTable(doc, {
    startY: y,
    head: sanRows([["Descrição", "Valor", "% Receita"]]),
    body: sanRows(rows),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: primary, textColor: 255 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right", cellWidth: 70 } },
    didParseCell: (data) => {
      const label = rows[data.row.index]?.[0] ?? "";
      if (label.startsWith("=")) data.cell.styles.fontStyle = "bold";
    },
    margin: { left: margin, right: margin },
  });
  return (doc as any).lastAutoTable.finalY + 14;
}

function ensureSpace(doc: jsPDF, y: number, needed: number, margin: number): number {
  const h = doc.internal.pageSize.getHeight();
  if (y + needed > h - margin) {
    doc.addPage();
    return margin;
  }
  return y;
}

function field(doc: jsPDF, label: string, x: number, y: number, w: number) {
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(label, x, y);
  doc.setDrawColor(180);
  doc.setLineWidth(0.4);
  doc.line(x, y + 14, x + w, y + 14);
  doc.setTextColor(0);
}

function line(doc: jsPDF, x1: number, y: number, x2: number) {
  doc.setDrawColor(180);
  doc.setLineWidth(0.4);
  doc.line(x1, y, x2, y);
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
