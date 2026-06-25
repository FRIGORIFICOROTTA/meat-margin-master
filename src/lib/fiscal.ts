// Cálculo de DRE Fiscal a partir do DRE gerencial + configuração tributária.
// As alíquotas vivem em empresas.config_tributaria (jsonb) com defaults por regime.

export type RegimeTributario = "simples" | "presumido" | "real";

export type ConfigTributaria = {
  // Percentuais em decimal (ex.: 0.04 = 4%)
  aliquota_simples?: number; // DAS total estimado
  icms?: number;
  pis?: number;
  cofins?: number;
  iss?: number;
  irpj?: number;
  csll?: number;
  // Presunção para Lucro Presumido (base de cálculo IR/CSLL sobre receita)
  presuncao_irpj?: number; // ex.: 0.08
  presuncao_csll?: number; // ex.: 0.12
};

export const DEFAULTS: Record<RegimeTributario, ConfigTributaria> = {
  simples: { aliquota_simples: 0.06 },
  presumido: {
    pis: 0.0065,
    cofins: 0.03,
    icms: 0.18,
    presuncao_irpj: 0.08,
    irpj: 0.15,
    presuncao_csll: 0.12,
    csll: 0.09,
  },
  real: {
    pis: 0.0165,
    cofins: 0.076,
    icms: 0.18,
    irpj: 0.15,
    csll: 0.09,
  },
};

export type DREInput = {
  total_vendas: number;
  cmv: number;
  variacao_estoque: number;
  total_despesas: number;
  devolucoes?: number;
};

export type DREFiscal = {
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


export function mergeConfig(
  regime: RegimeTributario,
  config: ConfigTributaria | null | undefined,
): ConfigTributaria {
  return { ...DEFAULTS[regime], ...(config ?? {}) };
}

export function calcularDREFiscal(
  dre: DREInput,
  regime: RegimeTributario,
  configRaw: ConfigTributaria | null | undefined,
): DREFiscal {
  const cfg = mergeConfig(regime, configRaw);
  const receita_bruta = dre.total_vendas;
  const devolucoes = dre.devolucoes ?? 0;
  const base = receita_bruta - devolucoes;

  const impostos_breakdown: Array<{ label: string; valor: number }> = [];
  let impostos_total = 0;

  if (regime === "simples") {
    const v = base * (cfg.aliquota_simples ?? 0);
    impostos_breakdown.push({ label: "DAS (Simples Nacional)", valor: v });
    impostos_total = v;
  } else {
    const pis = base * (cfg.pis ?? 0);
    const cofins = base * (cfg.cofins ?? 0);
    const icms = base * (cfg.icms ?? 0);
    impostos_breakdown.push(
      { label: "PIS", valor: pis },
      { label: "COFINS", valor: cofins },
      { label: "ICMS", valor: icms },
    );
    impostos_total = pis + cofins + icms;
    if (cfg.iss) {
      const iss = base * cfg.iss;
      impostos_breakdown.push({ label: "ISS", valor: iss });
      impostos_total += iss;
    }
  }

  const receita_liquida = base - impostos_total;
  // CMV Ajustado = CMV do ERP - Variação de Estoque (Estoque Final - Estoque Inicial).
  // Variação negativa (estoque caiu) aumenta o custo real do período.
  const cmv = dre.cmv;
  const variacao_estoque = dre.variacao_estoque;
  const cmv_ajustado = cmv - variacao_estoque;
  const lucro_bruto = receita_liquida - cmv_ajustado;
  const despesas_operacionais = dre.total_despesas;
  const lucro_antes_ir = lucro_bruto - despesas_operacionais;

  let irpj = 0;
  let csll = 0;
  if (regime === "presumido") {
    const baseIR = base * (cfg.presuncao_irpj ?? 0.08);
    const baseCSLL = base * (cfg.presuncao_csll ?? 0.12);
    irpj = baseIR * (cfg.irpj ?? 0.15);
    csll = baseCSLL * (cfg.csll ?? 0.09);
  } else if (regime === "real") {
    const baseLucro = Math.max(lucro_antes_ir, 0);
    irpj = baseLucro * (cfg.irpj ?? 0.15);
    csll = baseLucro * (cfg.csll ?? 0.09);
  }

  const resultado_liquido_fiscal = lucro_antes_ir - irpj - csll;

  return {
    receita_bruta,
    devolucoes,
    impostos_total,
    impostos_breakdown,
    receita_liquida,
    cmv,
    variacao_estoque,
    cmv_ajustado,
    lucro_bruto,
    despesas_operacionais,
    lucro_antes_ir,
    irpj,
    csll,
    resultado_liquido_fiscal,
  };
}


// ---------------- DRE Fiscal REAL (com lançamentos efetivos) ----------------

export type TipoLancamentoFiscal = "das" | "pis" | "cofins" | "icms" | "iss" | "irpj" | "csll" | "outros";

export type LancamentoFiscal = {
  tipo: TipoLancamentoFiscal;
  label?: string | null;
  valor_real: number;
  sinal?: number; // +1 despesa, -1 crédito
};

export type DREFiscalReal = DREFiscal & {
  origem: Record<string, "real" | "estimado">;
  faltando: TipoLancamentoFiscal[];
  ajustes_outros: number;
  total_estimado_referencia: number;
};

const LABEL_TRIBUTO: Record<TipoLancamentoFiscal, string> = {
  das: "DAS (Simples Nacional)",
  pis: "PIS",
  cofins: "COFINS",
  icms: "ICMS",
  iss: "ISS",
  irpj: "IRPJ",
  csll: "CSLL",
  outros: "Ajuste fiscal",
};

export function calcularDREFiscalReal(
  dre: DREInput,
  regime: RegimeTributario,
  configRaw: ConfigTributaria | null | undefined,
  lancamentos: LancamentoFiscal[],
): DREFiscalReal {
  const estimado = calcularDREFiscal(dre, regime, configRaw);

  // Map tipo -> soma de lançamentos reais (sinal aplicado)
  const realPorTipo = new Map<TipoLancamentoFiscal, number>();
  let ajustes_outros = 0;
  for (const l of lancamentos) {
    const s = (l.sinal ?? 1) * Number(l.valor_real || 0);
    if (l.tipo === "outros") {
      ajustes_outros += s;
    } else {
      realPorTipo.set(l.tipo, (realPorTipo.get(l.tipo) ?? 0) + s);
    }
  }

  const tributosRegime: TipoLancamentoFiscal[] =
    regime === "simples" ? ["das"] : ["pis", "cofins", "icms", "irpj", "csll"];

  const origem: Record<string, "real" | "estimado"> = {};
  const faltando: TipoLancamentoFiscal[] = [];

  // Reconstrói breakdown
  const impostos_breakdown: Array<{ label: string; valor: number }> = [];
  let impostos_oper_total = 0; // PIS/COFINS/ICMS/ISS/DAS
  let irpj_real = estimado.irpj;
  let csll_real = estimado.csll;

  function resolveTipo(tipo: TipoLancamentoFiscal, estimadoValor: number): number {
    if (realPorTipo.has(tipo)) {
      origem[tipo] = "real";
      return realPorTipo.get(tipo) ?? 0;
    }
    if (estimadoValor > 0) faltando.push(tipo);
    origem[tipo] = "estimado";
    return estimadoValor;
  }

  if (regime === "simples") {
    const dasEst = estimado.impostos_breakdown.find((b) => b.label.startsWith("DAS"))?.valor ?? 0;
    const v = resolveTipo("das", dasEst);
    impostos_breakdown.push({ label: LABEL_TRIBUTO.das, valor: v });
    impostos_oper_total += v;
  } else {
    for (const t of ["pis", "cofins", "icms"] as TipoLancamentoFiscal[]) {
      const est = estimado.impostos_breakdown.find((b) => b.label === LABEL_TRIBUTO[t])?.valor ?? 0;
      const v = resolveTipo(t, est);
      impostos_breakdown.push({ label: LABEL_TRIBUTO[t], valor: v });
      impostos_oper_total += v;
    }
    const issEst = estimado.impostos_breakdown.find((b) => b.label === "ISS")?.valor ?? 0;
    if (issEst > 0 || realPorTipo.has("iss")) {
      const v = resolveTipo("iss", issEst);
      impostos_breakdown.push({ label: LABEL_TRIBUTO.iss, valor: v });
      impostos_oper_total += v;
    }
    irpj_real = resolveTipo("irpj", estimado.irpj);
    csll_real = resolveTipo("csll", estimado.csll);
  }

  if (ajustes_outros !== 0) {
    impostos_breakdown.push({ label: "Ajustes fiscais (outros)", valor: ajustes_outros });
    impostos_oper_total += ajustes_outros;
  }

  const receita_liquida = estimado.receita_bruta - estimado.devolucoes - impostos_oper_total;
  const cmv_ajustado = dre.cmv;
  const lucro_bruto = receita_liquida - cmv_ajustado;
  const despesas_operacionais = dre.total_despesas;
  const lucro_antes_ir = lucro_bruto - despesas_operacionais;
  const resultado_liquido_fiscal = lucro_antes_ir - irpj_real - csll_real;

  // ignora tributos que de fato deveriam existir mas estão zerados na estimativa também
  tributosRegime.forEach((t) => {
    if (!origem[t]) origem[t] = realPorTipo.has(t) ? "real" : "estimado";
  });

  return {
    receita_bruta: estimado.receita_bruta,
    devolucoes: estimado.devolucoes,
    impostos_total: impostos_oper_total,
    impostos_breakdown,
    receita_liquida,
    cmv_ajustado,
    lucro_bruto,
    despesas_operacionais,
    lucro_antes_ir,
    irpj: irpj_real,
    csll: csll_real,
    resultado_liquido_fiscal,
    origem,
    faltando: Array.from(new Set(faltando)),
    ajustes_outros,
    total_estimado_referencia: estimado.impostos_total + estimado.irpj + estimado.csll,
  };
}

export const TRIBUTO_LABEL = LABEL_TRIBUTO;

export function tributosDoRegime(regime: RegimeTributario): TipoLancamentoFiscal[] {
  return regime === "simples"
    ? ["das"]
    : ["pis", "cofins", "icms", "iss", "irpj", "csll"];
}

export function estimativaPorTributo(
  dre: DREInput,
  regime: RegimeTributario,
  configRaw: ConfigTributaria | null | undefined,
): Record<TipoLancamentoFiscal, number> {
  const e = calcularDREFiscal(dre, regime, configRaw);
  const map: Partial<Record<TipoLancamentoFiscal, number>> = {};
  for (const t of tributosDoRegime(regime)) {
    if (t === "irpj") map[t] = e.irpj;
    else if (t === "csll") map[t] = e.csll;
    else {
      const lbl = LABEL_TRIBUTO[t];
      map[t] = e.impostos_breakdown.find((b) => b.label === lbl || b.label.startsWith(lbl))?.valor ?? 0;
    }
  }
  map.outros = 0;
  return map as Record<TipoLancamentoFiscal, number>;
}

export const REGIME_LABEL: Record<RegimeTributario, string> = {
  simples: "Simples Nacional",
  presumido: "Lucro Presumido",
  real: "Lucro Real",
};
