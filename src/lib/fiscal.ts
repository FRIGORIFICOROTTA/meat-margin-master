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
  // CMV do PDF já reflete o custo das mercadorias vendidas no período;
  // a variação de estoque é mostrada separadamente como ajuste informativo,
  // não somada novamente ao CMV (evita dupla contagem).
  const cmv_ajustado = dre.cmv;
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
    cmv_ajustado,
    lucro_bruto,
    despesas_operacionais,
    lucro_antes_ir,
    irpj,
    csll,
    resultado_liquido_fiscal,
  };
}

export const REGIME_LABEL: Record<RegimeTributario, string> = {
  simples: "Simples Nacional",
  presumido: "Lucro Presumido",
  real: "Lucro Real",
};
