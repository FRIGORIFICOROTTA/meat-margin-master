// Helpers de formatação financeira brasileira.

export const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const NUM = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const NUM3 = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

export const PCT = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function fmtBRL(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return BRL.format(value);
}

export function fmtPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return PCT.format(value);
}

export function fmtNum(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return NUM.format(value);
}

export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export function mesNome(mes: number): string {
  return MESES[mes - 1] ?? String(mes);
}

// Categorização automática de produtos por palavras-chave.
const REGRAS_CATEGORIA: Array<{ categoria: string; keywords: string[] }> = [
  {
    categoria: "Carnes Bovinas",
    keywords: [
      "boi",
      "bovin",
      "alcatra",
      "picanha",
      "contra file",
      "contrafile",
      "maminha",
      "fraldinha",
      "patinho",
      "coxao",
      "acem",
      "musculo",
      "costela",
      "file mignon",
      "cupim",
      "lagarto",
    ],
  },
  {
    categoria: "Carnes Suínas",
    keywords: ["suino", "porco", "linguica", "bacon", "pernil", "lombo", "costela suina", "toucinho"],
  },
  {
    categoria: "Aves",
    keywords: ["frango", "galinha", "peito", "coxa", "asa", "sobrecoxa", "filé de frango", "file de frango"],
  },
  { categoria: "Bebidas", keywords: ["agua", "refrigerante", "coca", "guarana", "cerveja", "suco"] },
  { categoria: "Temperos", keywords: ["sal", "pimenta", "tempero", "alho", "cebola desidr"] },
  { categoria: "Mercearia", keywords: ["arroz", "feijao", "oleo", "farinha", "acucar", "macarrao"] },
];

export function categorizarProduto(nome: string): string {
  const n = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  for (const r of REGRAS_CATEGORIA) {
    if (r.keywords.some((k) => n.includes(k))) return r.categoria;
  }
  return "Outros";
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
