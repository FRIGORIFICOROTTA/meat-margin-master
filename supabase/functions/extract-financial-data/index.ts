// Edge function: extrai dados de PDFs financeiros usando parser determinístico (sem IA).
// Recebe { arquivo_id } e atualiza arquivos_importados com extracted_json.
// Idempotente: se status já é 'extraido' ou 'confirmado', retorna cache (a menos que force=true).
//
// A IA NÃO é usada aqui. A extração é feita com `unpdf` (texto bruto) + regex.
// Valores não reconhecidos viram null e o usuário edita manualmente na UI.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// =========================================================================
// HELPERS de parsing BR
// =========================================================================

/** Converte "1.234.567,89" ou "(1.234,56)" em número (negativo se parênteses). */
function parseBR(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  let neg = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    neg = true;
    s = s.slice(0, -1).trim();
  }
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1).trim();
  }
  // remove R$ e espaços
  s = s.replace(/R\$\s*/gi, "").replace(/\s+/g, "");
  if (!s) return null;
  // formato BR: ponto = milhar, vírgula = decimal
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

/** Captura último número BR de uma linha. */
const NUM_RE = /\(?-?\s*R?\$?\s*[\d.]*\d(?:[.,]\d{1,3})?\)?-?/g;
function lastNumberInLine(line: string): number | null {
  const matches = line.match(NUM_RE);
  if (!matches) return null;
  for (let i = matches.length - 1; i >= 0; i--) {
    const v = parseBR(matches[i]);
    if (v !== null) return v;
  }
  return null;
}

function findLineWith(lines: string[], patterns: RegExp[]): string | null {
  for (const ln of lines) {
    for (const p of patterns) {
      if (p.test(ln)) return ln;
    }
  }
  return null;
}

function captureNumberByLabel(lines: string[], patterns: RegExp[]): number | null {
  const ln = findLineWith(lines, patterns);
  if (!ln) return null;
  return lastNumberInLine(ln);
}

// =========================================================================
// Categorização de despesas
// =========================================================================

const CATEGORIAS: Array<{ cat: string; re: RegExp }> = [
  { cat: "Folha de Pagamento", re: /(sal[aá]rio|folha|f[ée]rias|13[ºo°]|inss|fgts|encargos|vale[- ]?transporte|vt|vale[- ]?refei|vr|rescis)/i },
  { cat: "Pró-labore", re: /(pr[oó][- ]?labore)/i },
  { cat: "Aluguel", re: /(aluguel|loca[cç][aã]o|condom[ií]nio)/i },
  { cat: "Energia", re: /(energia|el[eé]trica|luz|cemig|enel|coelba|equatorial)/i },
  { cat: "Água", re: /(\b[aá]gua\b|saneam|cosanpa|cedae|sabesp)/i },
  { cat: "Telefone/Internet", re: /(telefon|internet|provedor|vivo|claro|tim|oi\b)/i },
  { cat: "Marketing", re: /(marketing|propagand|publicid|an[uú]ncio|m[ií]dia)/i },
  { cat: "Manutenção", re: /(manuten|conserto|reparo|equipamento)/i },
  { cat: "Impostos e Taxas", re: /(imposto|taxa|iss|iptu|ipva|alvar[aá]|tributo|das\b|simples)/i },
  { cat: "Serviços de Terceiros", re: /(terceiro|servi[cç]o.*terceiro|consult|contabil|advog|assess)/i },
  { cat: "Material de Consumo", re: /(material|consumo|limpeza|escrit[oó]rio|embalagem)/i },
  { cat: "Combustível", re: /(combust[ií]vel|gasolina|diesel|[oó]leo)/i },
  { cat: "Despesas Financeiras", re: /(juro|tarifa.*banc|iof|cart[aã]o|antecipa|d[ée]bito.*banc)/i },
  { cat: "Frete", re: /(frete|transporte)/i },
];

function categorize(desc: string): string {
  for (const { cat, re } of CATEGORIAS) {
    if (re.test(desc)) return cat;
  }
  return "Outras";
}

// =========================================================================
// Parser de DRE
// =========================================================================

interface DreParsed {
  filial: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  total_vendas: number | null;
  devolucoes: number | null;
  cmv: number | null;
  resultado_bruto: number | null;
  total_despesas: number | null;
  resultado_liquido: number | null;
  despesas: Array<{ categoria: string; subcategoria: string | null; valor: number; percentual_venda: number | null }>;
  __warnings: string[];
  __raw_preview: string;
}

function parseDRE(text: string): DreParsed {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const warnings: string[] = [];

  const total_vendas = captureNumberByLabel(lines, [
    /receita\s+bruta/i,
    /total\s+(de\s+)?vendas/i,
    /\bvendas?\s+(brutas?|totais?)\b/i,
    /faturament/i,
  ]);

  const devolucoes = captureNumberByLabel(lines, [
    /devolu[cç][oõ]es/i,
    /abatim/i,
  ]);

  const cmv = captureNumberByLabel(lines, [
    /\bcmv\b/i,
    /custo\s+(da|de|dos|das).*(mercador|produto|vendid)/i,
    /custo\s+das\s+mercadorias/i,
  ]);

  const resultado_bruto = captureNumberByLabel(lines, [
    /lucro\s+bruto/i,
    /resultado\s+bruto/i,
    /margem\s+bruta/i,
  ]);

  const total_despesas = captureNumberByLabel(lines, [
    /total\s+(de\s+)?despesas?/i,
    /despesas\s+(totais|operacionais)/i,
  ]);

  const resultado_liquido = captureNumberByLabel(lines, [
    /lucro\s+l[ií]quido/i,
    /resultado\s+l[ií]quido/i,
    /resultado\s+do\s+(exerc[ií]cio|per[ií]odo)/i,
  ]);

  // Despesas detalhadas: procura linhas que tenham um valor e um rótulo "razoável" de despesa.
  // Heurística: linhas entre o cabeçalho de "Despesas" e "Total Despesas/Resultado Líquido".
  const despesas: DreParsed["despesas"] = [];
  let inDespesas = false;
  const startRe = /(despesas|gastos)\s+(operacionais|administrat|gerais|com\s+vendas)/i;
  const stopRe = /(total\s+(de\s+)?despesas|resultado\s+l[ií]quido|lucro\s+l[ií]quido)/i;
  for (const ln of lines) {
    if (!inDespesas && startRe.test(ln)) {
      inDespesas = true;
      continue;
    }
    if (inDespesas) {
      if (stopRe.test(ln)) break;
      const val = lastNumberInLine(ln);
      if (val === null) continue;
      // remove o valor para obter o rótulo
      const label = ln.replace(NUM_RE, "").replace(/[-–—]+$/, "").trim();
      if (label.length < 2) continue;
      const valor = Math.abs(val);
      if (valor === 0) continue;
      despesas.push({
        categoria: categorize(label),
        subcategoria: label,
        valor,
        percentual_venda: total_vendas ? valor / total_vendas : null,
      });
    }
  }

  // Tenta extrair período (MM/AAAA ou nome do mês)
  let periodo_inicio: string | null = null;
  let periodo_fim: string | null = null;
  const periodoLine = findLineWith(lines, [
    /per[ií]odo[:\s]/i,
    /\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\s*\/?\s*(de\s+)?20\d{2}/i,
    /\b\d{2}\/20\d{2}\b/,
  ]);
  if (periodoLine) {
    const m1 = periodoLine.match(/\b(\d{2})\/(\d{4})\b/);
    if (m1) {
      const mes = parseInt(m1[1], 10);
      const ano = parseInt(m1[2], 10);
      const last = new Date(ano, mes, 0).getDate();
      periodo_inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
      periodo_fim = `${ano}-${String(mes).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
    }
  }

  if (total_vendas === null) warnings.push("Total de vendas não detectado — preencha manualmente.");
  if (cmv === null) warnings.push("CMV não detectado — preencha manualmente.");
  if (despesas.length === 0) warnings.push("Nenhuma despesa detalhada detectada — adicione manualmente.");

  return {
    filial: null,
    periodo_inicio,
    periodo_fim,
    total_vendas,
    devolucoes: devolucoes ? Math.abs(devolucoes) : null,
    cmv: cmv ? Math.abs(cmv) : null,
    resultado_bruto,
    total_despesas: total_despesas ? Math.abs(total_despesas) : null,
    resultado_liquido,
    despesas,
    __warnings: warnings,
    __raw_preview: lines.slice(0, 80).join("\n"),
  };
}

// =========================================================================
// Parser de Estoque
// =========================================================================

interface EstoqueParsed {
  filial: string | null;
  cnpj: string | null;
  data_referencia: string | null;
  total_itens: number | null;
  total_valor: number | null;
  itens: Array<{
    codigo: string | null;
    produto: string;
    unidade: string | null;
    quantidade: number;
    valor_unitario: number;
    valor_total: number;
  }>;
  __warnings: string[];
  __raw_preview: string;
}

function parseEstoque(text: string): EstoqueParsed {
  // Normaliza espaços (inclui NBSP e tabs)
  let flat = text
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/[ ]+/g, " ");

  // CNPJ e data de referência (operam no texto bruto, não dependem de \n)
  let cnpj: string | null = null;
  const cnpjM = flat.match(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/);
  if (cnpjM) cnpj = cnpjM[1];

  let data_referencia: string | null = null;
  const dataM =
    flat.match(/Estoque\s+existente\s+em[:\s]+(\d{2})\/(\d{2})\/(\d{4})/i) ||
    flat.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (dataM) data_referencia = `${dataM[3]}-${dataM[2]}-${dataM[1]}`;

  // Total reportado no PDF: pega o ÚLTIMO match (rodapé "Total Geral"),
  // não o primeiro (que pode ser um "valor total" intermediário/de página).
  let totalReportado: number | null = null;
  const totalRe =
    /(?:total\s+(?:geral|do\s+invent[aá]rio|do\s+estoque)|valor\s+total(?:\s+do\s+estoque)?)\s*[:R$\s]*?(\d{1,3}(?:\.\d{3})*(?:,\d+)?)/gi;
  const tMatches = [...flat.matchAll(totalRe)];
  if (tMatches.length) totalReportado = parseBR(tMatches[tMatches.length - 1][1]);

  // Remove cabeçalhos/rodapés repetidos (substitui por espaço para não colar tokens)
  const noise: RegExp[] = [
    /p[aá]gina\s+\d+\s+de\s+\d+/gi,
    /c[oó]digo\s+(?:do\s+)?produto\s+(?:descri[cç][aã]o\s+)?unid(?:ade)?\s+qtde?\s+v\.?\s*unit\.?\s+v\.?\s*total/gi,
    /c[oó]digo\s+descri[cç][aã]o\s+unid(?:ade)?\s+qtde?\s+v(?:alor)?\.?\s*unit\.?\s+v(?:alor)?\.?\s*total/gi,
    /livro\s+de\s+registro\s+de\s+invent[aá]rio/gi,
    /estoque\s+existente\s+em[:\s]+\d{2}\/\d{2}\/\d{4}/gi,
    /relat[oó]rio\s+de\s+estoque/gi,
    /emitido\s+em[:\s]+\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?/gi,
    /\bfls?\.\s*\d+\b/gi,
    // Data por extenso (com ou sem hora): "30 de abril de 2026 22:02:44"
    /\b\d{1,2}\s+de\s+(?:janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/gi,
    // Cabeçalho fiscal repetido entre páginas
    /\bempresa\s*:\s*[^:]*?(?=\s+(?:ie|cnpj|livro|folha)\s*:)/gi,
    /\bie\s*:\s*[\d.\-/]+/gi,
    /\bcnpj\s*:\s*\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/gi,
    /\blivro\s*:\s*\d+/gi,
    /\bfolha\s*:\s*\d+/gi,
  ];
  for (const rx of noise) flat = flat.replace(rx, " ");
  flat = flat.replace(/[ ]+/g, " ").trim();

  // Parsing em duas etapas: ancorar em "UNIDADE seguida de 3 números BR"
  // e então capturar código + descrição olhando para trás.
  const UNI = "UNID|KG|PCT|PC|CX|LT|MT|DZ|GR|ML|UN|G|L";
  const numSrc = "\\d{1,3}(?:\\.\\d{3})*(?:,\\d+)?|\\d+(?:[.,]\\d+)?";
  // \b antes da unidade evita casar com sufixos de palavra (ex.: "...KG" em "1KG")
  const anchorRe = new RegExp(
    `\\b(${UNI})\\b\\s+(${numSrc})\\s+(${numSrc})\\s+(${numSrc})(?=\\s|$|[A-Za-zÀ-ÿ])`,
    "gi",
  );

  const warnings: string[] = [];
  const itens: EstoqueParsed["itens"] = [];
  const seen = new Set<string>();
  let totalValor = 0;

  let lastEnd = 0;
  for (const m of flat.matchAll(anchorRe)) {
    const unidade = m[1].toUpperCase();
    const qtd = parseBR(m[2]);
    const vu = parseBR(m[3]);
    const vt = parseBR(m[4]);
    const matchStart = m.index ?? 0;
    if (qtd === null || vu === null || vt === null || vt <= 0) {
      lastEnd = matchStart + m[0].length;
      continue;
    }

    // Janela entre o fim do match anterior e o início deste = "código + descrição"
    const window = flat.slice(lastEnd, matchStart).trim();
    lastEnd = matchStart + m[0].length;
    if (!window) continue;

    // Código: primeira sequência de 1-8 dígitos isolada (espaço antes/depois)
    const codeM = window.match(/(?:^|\s)(\d{1,8})\s+([^\d].*)$/s);
    let codigo: string | null = null;
    let produto = "";
    if (codeM) {
      codigo = codeM[1];
      produto = codeM[2];
    } else {
      // fallback: tenta achar qualquer dígito inicial
      const fb = window.match(/(\d{1,8})\s+(.+)$/s);
      if (fb) {
        codigo = fb[1];
        produto = fb[2];
      } else {
        produto = window;
      }
    }
    produto = produto.replace(/\s+/g, " ").trim();
    if (produto.length < 2) continue;
    if (/^p[aá]gina$/i.test(produto)) continue;

    const key = `${codigo ?? "?"}|${vt.toFixed(2)}|${qtd}`;
    if (seen.has(key)) continue;
    seen.add(key);

    itens.push({
      codigo,
      produto,
      unidade,
      quantidade: qtd,
      valor_unitario: vu,
      valor_total: vt,
    });
    totalValor += vt;
  }

  if (itens.length === 0) {
    warnings.push("Nenhum item detectado automaticamente — adicione manualmente.");
    // Diagnóstico: mostra início e fim do texto normalizado
    console.log("[parseEstoque] zero itens — primeiros 3000 chars do flat:");
    console.log(flat.slice(0, 3000));
    console.log("[parseEstoque] últimos 1500 chars:");
    console.log(flat.slice(-1500));
  }
  if (!data_referencia)
    warnings.push("Data de referência não detectada — preencha manualmente.");

  return {
    filial: null,
    cnpj,
    data_referencia,
    total_itens: itens.length || null,
    total_valor: totalReportado ?? (totalValor > 0 ? totalValor : null),
    itens,
    __warnings: warnings,
    __raw_preview: flat.slice(0, 3000),
  };
}


// =========================================================================
// Handler
// =========================================================================

interface ReqBody {
  arquivo_id: string;
  idempotency_key?: string;
  force?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let arquivoIdForError: string | null = null;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Sem token de autenticação");

    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const body = (await req.json()) as ReqBody;
    if (!body.arquivo_id) throw new Error("arquivo_id obrigatório");
    arquivoIdForError = body.arquivo_id;

    const { data: arquivo, error: arqErr } = await userClient
      .from("arquivos_importados")
      .select("id, tipo_arquivo, storage_path, status, extracted_json")
      .eq("id", body.arquivo_id)
      .single();

    if (arqErr || !arquivo) throw new Error("Arquivo não encontrado ou sem acesso");

    if (
      !body.force &&
      (arquivo.status === "extraido" || arquivo.status === "confirmado") &&
      arquivo.extracted_json
    ) {
      return new Response(
        JSON.stringify({ cached: true, data: arquivo.extracted_json, status: arquivo.status }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    await admin
      .from("arquivos_importados")
      .update({ status: "processando", erro_mensagem: null })
      .eq("id", arquivo.id);

    const { data: file, error: dlErr } = await admin.storage
      .from("financial-pdfs")
      .download(arquivo.storage_path);
    if (dlErr || !file) throw new Error(`Falha ao baixar PDF: ${dlErr?.message}`);

    const ab = await file.arrayBuffer();
    const pdf = await getDocumentProxy(new Uint8Array(ab));
    const { text } = await extractText(pdf, { mergePages: true });
    const fullText = Array.isArray(text) ? text.join("\n") : text;

    if (!fullText || fullText.trim().length < 20) {
      throw new Error("PDF parece estar vazio ou ser uma imagem digitalizada (sem texto). Reexporte como PDF de texto.");
    }

    const isEstoque = arquivo.tipo_arquivo !== "dre";
    const parsed = isEstoque ? parseEstoque(fullText) : parseDRE(fullText);

    await admin
      .from("arquivos_importados")
      .update({ status: "extraido", extracted_json: parsed, erro_mensagem: null })
      .eq("id", arquivo.id);

    return new Response(
      JSON.stringify({ cached: false, data: parsed, status: "extraido" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("extract-financial-data error:", msg);
    if (arquivoIdForError) {
      try {
        const admin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await admin
          .from("arquivos_importados")
          .update({ status: "erro", erro_mensagem: msg.slice(0, 1000) })
          .eq("id", arquivoIdForError);
      } catch (_e) {
        // ignore
      }
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
