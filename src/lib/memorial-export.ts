// Memorial de Cálculo — PDF formatado conforme ABNT NBR 14724.
// A4 retrato, margens 3-2-2-3 cm (sup/dir/inf/esq), fonte Times 12pt,
// espaçamento 1,5, texto justificado, paginação superior direita,
// títulos primários em CAIXA ALTA negrito, secundários em CAIXA ALTA.
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

// ABNT — medidas em pontos (1 cm = 28.3465 pt)
const CM = 28.3465;
const M_TOP = 3 * CM;
const M_LEFT = 3 * CM;
const M_RIGHT = 2 * CM;
const M_BOTTOM = 2 * CM;
const FONT = "times";
const FS_BODY = 12;
const FS_SECTION = 12;
const FS_NOTE = 10;
const LH = FS_BODY * 1.5; // entrelinha 1,5

export function exportMemorialCalculoPdf(opts: MemorialOpts) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - M_LEFT - M_RIGHT;
  const bottomLimit = pageH - M_BOTTOM;

  // ========================= CAPA (ABNT) =========================
  doc.setFont(FONT, "bold");
  doc.setFontSize(12);
  const topBlock = [
    "GRUPO ROTA DAS CARNES",
    opts.grupo ? opts.grupo.toUpperCase() : "",
    opts.empresa.toUpperCase(),
  ].filter(Boolean);
  let cy = M_TOP;
  for (const t of topBlock) {
    doc.text(t, pageW / 2, cy, { align: "center" });
    cy += LH;
  }

  doc.setFontSize(14);
  doc.text("MEMORIAL DE CÁLCULO", pageW / 2, pageH / 2 - LH, { align: "center" });
  doc.setFontSize(12);
  doc.setFont(FONT, "normal");
  const subtitulo = doc.splitTextToSize(
    "Demonstração do Resultado do Exercício — Visões Gerencial e Fiscal — " +
      `Apuração de ${mesNome(opts.mes)} de ${opts.ano}`,
    contentW,
  );
  doc.text(subtitulo, pageW / 2, pageH / 2 + 4, { align: "center" });

  doc.setFont(FONT, "normal");
  doc.setFontSize(12);
  const local = "Brasil";
  doc.text(local, pageW / 2, pageH - M_BOTTOM - LH, { align: "center" });
  doc.text(String(opts.ano), pageW / 2, pageH - M_BOTTOM, { align: "center" });

  // ========================= CORPO =========================
  doc.addPage();
  const state = { y: M_TOP };

  // 1 IDENTIFICAÇÃO
  primary(doc, "1 IDENTIFICAÇÃO", state);
  const ident: Array<[string, string]> = [
    ["Empresa", opts.empresa],
    ["CNPJ", opts.cnpj || "—"],
    ["Grupo Econômico", opts.grupo || "—"],
    ["Regime Tributário", REGIME_LABEL[opts.regime]],
    ["Período de Apuração", `${mesNome(opts.mes)}/${opts.ano}`],
    ["Data de Emissão", new Date().toLocaleString("pt-BR")],
  ];
  abntTable(doc, state, ident, [0.35, 0.65], { firstBold: true });

  // 2 ORIGEM DOS DADOS
  primary(doc, "2 ORIGEM DOS DADOS", state);
  body(
    doc,
    state,
    "Os valores gerenciais (receita bruta, devoluções, custo das mercadorias vendidas, " +
      "despesas operacionais e estoques) são extraídos por meio de leitor determinístico " +
      "dos relatórios em formato PDF emitidos pelo sistema de gestão empresarial (ERP) do " +
      "grupo, especificamente a Demonstração do Resultado mensal e os Inventários Inicial " +
      "e Final. Antes da persistência no banco de dados, o usuário revisa e confirma os " +
      "valores na interface de Importação. Subtotais e categorias-pai presentes no relatório " +
      "do ERP são descartados por heurística para evitar dupla contagem. O processo é " +
      "idempotente: a reimportação de arquivos referentes ao mesmo período substitui " +
      "integralmente os dados anteriores, sem duplicidade.",
    contentW,
  );

  // 3 DRE GERENCIAL — FÓRMULAS
  primary(doc, "3 DRE GERENCIAL — FÓRMULAS", state);
  body(
    doc,
    state,
    "A Demonstração do Resultado na visão gerencial é calculada conforme as fórmulas " +
      "apresentadas a seguir, observando que a Variação de Estoque é incorporada ao custo " +
      "para refletir o consumo físico do período.",
    contentW,
  );
  abntTable(
    doc,
    state,
    [
      ["Receita Bruta", "total_vendas (ERP)"],
      ["(−) Devoluções", "devolucoes (ERP)"],
      ["= Receita Líquida Gerencial", "Receita Bruta − Devoluções"],
      ["(−) CMV", "cmv (custo das mercadorias vendidas)"],
      ["(±) Variação de Estoque", "Estoque Inicial − Estoque Final"],
      ["= CMV Ajustado", "CMV + Variação de Estoque"],
      ["= Resultado Bruto", "Receita Líquida − CMV Ajustado"],
      ["(−) Despesas Operacionais", "Σ despesas_detalhe.valor"],
      ["= Resultado Líquido Gerencial", "Resultado Bruto − Despesas Operacionais"],
    ],
    [0.45, 0.55],
    { firstBold: true, header: ["Linha", "Fórmula / Origem"] },
  );

  // 4 DRE FISCAL — ESTIMATIVA
  primary(doc, "4 DRE FISCAL — ESTIMATIVA AUTOMÁTICA", state);
  body(
    doc,
    state,
    "A DRE Fiscal Estimada aplica as alíquotas configuradas para o regime tributário " +
      "vigente sobre a Base Tributável (Receita Bruta deduzida das Devoluções) e, conforme " +
      "o regime, sobre o lucro apurado. As alíquotas são armazenadas no campo " +
      "config_tributaria da empresa; valores ausentes assumem os parâmetros-padrão " +
      "definidos no módulo fiscal do sistema.",
    contentW,
  );
  secondary(doc, "4.1 FÓRMULAS POR REGIME", state);
  abntTable(doc, state, regimeFormulas(opts.regime), [0.45, 0.55], {
    firstBold: true,
    header: ["Linha", "Fórmula"],
  });

  secondary(doc, "4.2 ALÍQUOTAS CONFIGURADAS", state);
  const cfg = mergeConfig(opts.regime, opts.config);
  abntTable(doc, state, aliquotasRows(opts.regime, cfg), [0.5, 0.25, 0.25], {
    header: ["Parâmetro", "Valor", "Origem"],
    alignRight: [1],
  });

  // 5 DRE FISCAL REAL
  primary(doc, "5 DRE FISCAL — VALORES REAIS (LANÇAMENTOS)", state);
  body(
    doc,
    state,
    "Quando o usuário registra valores efetivamente recolhidos (DAS, DARF e demais guias) " +
      "na tela de Lançamentos Fiscais, o sistema substitui, tributo a tributo, a estimativa " +
      "pelo valor real. Tributos sem lançamento permanecem com a estimativa. Ajustes do " +
      "tipo Outros são aplicados com sinal: +1 (despesa) acresce ao total de tributos e −1 " +
      "(crédito) reduz. A base operacional — Receita Bruta deduzida do CMV Ajustado e das " +
      "Despesas Operacionais — é idêntica àquela utilizada na visão Gerencial; portanto, " +
      "a diferença entre os resultados Gerencial e Fiscal corresponde exclusivamente ao " +
      "bloco de tributos do período.",
    contentW,
  );

  // 6 EXEMPLO NUMÉRICO
  primary(doc, `6 EXEMPLO NUMÉRICO — ${mesNome(opts.mes).toUpperCase()}/${opts.ano}`, state);
  const v = opts.dre.total_vendas;
  const pct = (n: number) => (v > 0 ? n / v : 0);
  const fmt = (n: number) => fmtBRL(n);
  const fmtP = (n: number) => (v > 0 ? fmtPct(pct(n)) : "—");

  secondary(doc, "6.1 DRE GERENCIAL", state);
  const ger: Array<[string, string, string]> = [
    ["Receita Bruta (Vendas)", fmt(v), fmtP(v)],
    ["(−) Devoluções", fmt(-opts.dre.devolucoes), fmtP(-opts.dre.devolucoes)],
    ["(−) CMV", fmt(-opts.dre.cmv), fmt(-opts.dre.cmv) === fmt(0) ? "—" : fmtP(-opts.dre.cmv)],
    ["(±) Variação de Estoque", fmt(-opts.dre.variacao_estoque), fmtP(-opts.dre.variacao_estoque)],
    [
      "= Resultado Bruto Ajustado",
      fmt(opts.dre.resultado_bruto - opts.dre.variacao_estoque),
      fmtP(opts.dre.resultado_bruto - opts.dre.variacao_estoque),
    ],
    ["(−) Despesas Operacionais", fmt(-opts.dre.total_despesas), fmtP(-opts.dre.total_despesas)],
    [
      "= Resultado Líquido Gerencial",
      fmt(opts.dre.resultado_liquido_gerencial),
      fmtP(opts.dre.resultado_liquido_gerencial),
    ],
  ];
  abntTable(doc, state, ger, [0.55, 0.25, 0.2], {
    header: ["Descrição", "Valor (R$)", "% Receita"],
    alignRight: [1, 2],
    boldOn: (r) => r[0].startsWith("="),
  });

  secondary(doc, "6.2 DRE FISCAL ESTIMADA", state);
  fiscalAbntTable(doc, state, opts.fiscalEstimado);

  if (opts.fiscalReal && opts.temLancamentosReais) {
    secondary(doc, "6.3 DRE FISCAL REAL", state);
    fiscalAbntTable(doc, state, opts.fiscalReal);
  }

  // 7 GLOSSÁRIO E PREMISSAS
  primary(doc, "7 GLOSSÁRIO E PREMISSAS", state);
  const glossario: Array<[string, string]> = [
    ["CMV", "Custo da Mercadoria Vendida, conforme apurado pelo ERP."],
    [
      "Variação de Estoque",
      "Diferença entre Estoque Inicial e Estoque Final. Quando positiva, indica consumo físico superior ao registrado no CMV, aumentando o custo real do período.",
    ],
    [
      "CMV Ajustado",
      "Soma do CMV com a Variação de Estoque. Constitui a base operacional comum às visões Gerencial e Fiscal.",
    ],
    [
      "Base Tributável",
      "Receita Bruta deduzida das Devoluções. Aplica-se às alíquotas de PIS, COFINS, ICMS, ISS e DAS.",
    ],
    [
      "Presunção (Lucro Presumido)",
      "Percentual da receita utilizado como base de cálculo do IRPJ e da CSLL (parâmetros-padrão: 8% e 12% para a atividade comercial, respectivamente).",
    ],
    [
      "Lucro Real (IRPJ/CSLL)",
      "Tributos incidentes sobre o Lucro antes do IR quando positivo; nulos em caso de prejuízo no período.",
    ],
    [
      "Idempotência",
      "A reimportação de PDFs referentes ao mesmo período substitui os dados anteriormente persistidos, garantindo unicidade.",
    ],
    [
      "Subtotais",
      "Linhas de subtotal e categorias-pai do relatório do ERP são descartadas no leitor para evitar dupla contagem.",
    ],
  ];
  abntTable(doc, state, glossario, [0.3, 0.7], { firstBold: true });

  // 8 PARECER DO CONTADOR
  primary(doc, "8 PARECER DO CONTADOR RESPONSÁVEL", state);
  body(
    doc,
    state,
    "Declaro que examinei o presente Memorial de Cálculo e atesto que as fórmulas, " +
      "critérios e premissas nele descritos estão aderentes à legislação tributária " +
      "aplicável ao regime informado e ao período em análise.",
    contentW,
  );
  ensureSpace(doc, state, 130);
  state.y += LH;
  const colW = (contentW - 20) / 2;
  field(doc, "Nome completo", M_LEFT, state.y, colW);
  field(doc, "CRC", M_LEFT + colW + 20, state.y, colW);
  state.y += 36;
  field(doc, "Data", M_LEFT, state.y, colW);
  field(doc, "Assinatura", M_LEFT + colW + 20, state.y, colW);
  state.y += 40;
  doc.setFont(FONT, "normal");
  doc.setFontSize(FS_BODY);
  doc.text("Parecer:  (  ) De acordo     (  ) Ajustes necessários", M_LEFT, state.y);
  state.y += LH;
  hr(doc, M_LEFT, state.y, pageW - M_RIGHT);
  state.y += LH;
  hr(doc, M_LEFT, state.y, pageW - M_RIGHT);

  // Paginação ABNT — topo direito, contando a partir da capa mas exibindo só a partir da pg 2
  const total = doc.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    doc.setPage(i);
    doc.setFont(FONT, "normal");
    doc.setFontSize(FS_NOTE);
    doc.setTextColor(0);
    doc.text(String(i), pageW - M_RIGHT, M_TOP / 2 + 4, { align: "right" });
  }
  // Rodapé discreto com identificação documental — não exigido pela ABNT mas útil
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `${opts.empresa} · ${mesNome(opts.mes)}/${opts.ano} · Memorial de Cálculo`,
      M_LEFT,
      pageH - M_BOTTOM / 2,
    );
    doc.setTextColor(0);
  }

  doc.save(
    `Memorial_Calculo_DRE_${slug(opts.empresa)}_${opts.mes}-${opts.ano}.pdf`,
  );
}

// ============== Helpers ABNT ==============

type CursorState = { y: number };

function ensureSpace(doc: jsPDF, state: CursorState, needed: number) {
  const limit = doc.internal.pageSize.getHeight() - M_BOTTOM;
  if (state.y + needed > limit) {
    doc.addPage();
    state.y = M_TOP;
  }
}

function primary(doc: jsPDF, title: string, state: CursorState) {
  ensureSpace(doc, state, LH * 2);
  state.y += LH * 0.5;
  doc.setFont(FONT, "bold");
  doc.setFontSize(FS_SECTION);
  doc.setTextColor(0);
  doc.text(title, M_LEFT, state.y);
  state.y += LH;
}

function secondary(doc: jsPDF, title: string, state: CursorState) {
  ensureSpace(doc, state, LH * 2);
  state.y += LH * 0.3;
  doc.setFont(FONT, "normal");
  doc.setFontSize(FS_SECTION);
  doc.text(title, M_LEFT, state.y);
  state.y += LH;
}

function body(doc: jsPDF, state: CursorState, text: string, maxW: number) {
  doc.setFont(FONT, "normal");
  doc.setFontSize(FS_BODY);
  doc.setTextColor(0);
  const lines = doc.splitTextToSize(text, maxW);
  const needed = lines.length * LH;
  ensureSpace(doc, state, needed);
  // recorte e paginação linha a linha para respeitar margens
  for (const ln of lines) {
    ensureSpace(doc, state, LH);
    doc.text(ln, M_LEFT, state.y, {
      align: "justify",
      maxWidth: maxW,
    });
    state.y += LH;
  }
  state.y += LH * 0.3;
}

function abntTable(
  doc: jsPDF,
  state: CursorState,
  rows: Array<string[]>,
  widthsPct: number[],
  opts: {
    header?: string[];
    firstBold?: boolean;
    alignRight?: number[];
    boldOn?: (row: string[]) => boolean;
  } = {},
) {
  const contentW = doc.internal.pageSize.getWidth() - M_LEFT - M_RIGHT;
  const colStyles: Record<number, any> = {};
  widthsPct.forEach((p, i) => {
    colStyles[i] = { cellWidth: contentW * p };
  });
  if (opts.firstBold) {
    colStyles[0] = { ...(colStyles[0] || {}), fontStyle: "bold" };
  }
  if (opts.alignRight) {
    for (const i of opts.alignRight) {
      colStyles[i] = { ...(colStyles[i] || {}), halign: "right" };
    }
  }
  autoTable(doc, {
    startY: state.y,
    head: opts.header ? [opts.header] : undefined,
    body: rows,
    theme: "grid",
    styles: {
      font: FONT,
      fontSize: FS_NOTE,
      cellPadding: 4,
      textColor: 0,
      lineColor: [0, 0, 0],
      lineWidth: 0.4,
    },
    headStyles: {
      font: FONT,
      fontStyle: "bold",
      fillColor: [255, 255, 255],
      textColor: 0,
      lineColor: [0, 0, 0],
      lineWidth: 0.4,
      halign: "left",
    },
    columnStyles: colStyles,
    margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      if (opts.boldOn && opts.boldOn(rows[data.row.index] as string[])) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  state.y = (doc as any).lastAutoTable.finalY + LH * 0.6;
}

function fiscalAbntTable(doc: jsPDF, state: CursorState, f: FiscalValues) {
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
  abntTable(doc, state, rows as unknown as string[][], [0.55, 0.25, 0.2], {
    header: ["Descrição", "Valor (R$)", "% Receita"],
    alignRight: [1, 2],
    boldOn: (r) => r[0].startsWith("="),
  });
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
      ["ISS (quando aplicável)", "Base × iss"],
      ["IRPJ", "Base × presuncao_irpj × irpj"],
      ["CSLL", "Base × presuncao_csll × csll"],
    ];
  }
  return [
    ...base,
    ["PIS", "Base × pis"],
    ["COFINS", "Base × cofins"],
    ["ICMS", "Base × icms"],
    ["ISS (quando aplicável)", "Base × iss"],
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

function field(doc: jsPDF, label: string, x: number, y: number, w: number) {
  doc.setFontSize(FS_NOTE);
  doc.setTextColor(80);
  doc.setFont(FONT, "normal");
  doc.text(label, x, y);
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.line(x, y + 16, x + w, y + 16);
  doc.setTextColor(0);
}

function hr(doc: jsPDF, x1: number, y: number, x2: number) {
  doc.setDrawColor(0);
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
