// Edge function: extrai dados de PDFs financeiros usando Google Gemini.
// Recebe { arquivo_id } e atualiza arquivos_importados com extracted_json.
// Idempotente: se status já é 'extraido' ou 'confirmado', retorna cache.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// =========================================================================
// PROMPTS — instruem o Gemini a normalizar formatos brasileiros para JSON.
// =========================================================================

const PROMPT_DRE = `Você é um especialista em análise contábil brasileira. Analise o PDF de Demonstrativo de Resultado (DRE) e extraia os dados estruturados.

REGRAS CRÍTICAS DE PARSING:
1. Os valores monetários no PDF usam formato brasileiro: ponto separa milhar e vírgula separa decimal. Ex.: "1.234.567,89" => 1234567.89. SEMPRE converta para número decimal com PONTO como separador.
2. Despesas/custos podem aparecer com sinal negativo, entre parênteses "(1.234,56)" ou apenas em coluna de "Saída/Débito". TRATE COMO VALORES POSITIVOS no JSON (o sinal é implícito no campo).
3. Se a DRE separar "Receita Bruta" e "Deduções/Devoluções/Impostos sobre venda", coloque a receita bruta em total_vendas e a soma das deduções em devolucoes.
4. CMV = Custo da Mercadoria Vendida (Custo de Produtos/Mercadorias). NÃO confunda com despesas operacionais.
5. Categorize despesas em: "Folha de Pagamento", "Aluguel", "Energia", "Marketing", "Manutenção", "Impostos e Taxas", "Serviços de Terceiros", "Material de Consumo", "Pró-labore", "Despesas Financeiras", "Outras". subcategoria pode ser a descrição original da linha.
6. Datas no formato YYYY-MM-DD. Se houver apenas mês/ano, use o primeiro e último dia do mês.
7. NÃO INVENTE dados. Use null para campos ausentes.

ESTRUTURA DE SAÍDA (JSON puro, sem markdown):
{
  "filial": string | null,
  "periodo_inicio": "YYYY-MM-DD",
  "periodo_fim": "YYYY-MM-DD",
  "total_vendas": number,
  "devolucoes": number,
  "cmv": number,
  "resultado_bruto": number,
  "despesas": [
    { "categoria": string, "subcategoria": string|null, "valor": number, "percentual_venda": number|null }
  ],
  "total_despesas": number,
  "resultado_liquido": number
}`;

const PROMPT_ESTOQUE = `Você é um especialista em inventário de açougues/frigoríficos. Analise o PDF de Livro de Registro de Inventário e extraia TODOS os itens, sem omitir nenhum.

REGRAS CRÍTICAS:
1. Valores no formato brasileiro: "1.234,56" => 1234.56. Converta sempre para decimal com ponto.
2. Quantidades podem ter até 3 casas decimais (kg) — preserve a precisão.
3. Se valor_total não bater com quantidade*valor_unitario, use o valor_total como reportado no PDF.
4. Data no formato YYYY-MM-DD. Se houver apenas data de referência, use-a; senão use a data de fechamento do período.
5. NÃO OMITA itens. Se o PDF tem 313 itens, retorne 313 itens.

ESTRUTURA DE SAÍDA (JSON puro, sem markdown):
{
  "filial": string | null,
  "cnpj": string | null,
  "data_referencia": "YYYY-MM-DD",
  "total_itens": number,
  "total_valor": number,
  "itens": [
    { "codigo": string|null, "produto": string, "unidade": string|null,
      "quantidade": number, "valor_unitario": number, "valor_total": number }
  ]
}`;

// =========================================================================
// JSON SCHEMAS — força o Gemini a respeitar shape (responseSchema).
// =========================================================================

const SCHEMA_DRE = {
  type: "object",
  properties: {
    filial: { type: "string", nullable: true },
    periodo_inicio: { type: "string" },
    periodo_fim: { type: "string" },
    total_vendas: { type: "number" },
    devolucoes: { type: "number" },
    cmv: { type: "number" },
    resultado_bruto: { type: "number" },
    total_despesas: { type: "number" },
    resultado_liquido: { type: "number" },
    despesas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          categoria: { type: "string" },
          subcategoria: { type: "string", nullable: true },
          valor: { type: "number" },
          percentual_venda: { type: "number", nullable: true },
        },
        required: ["categoria", "valor"],
      },
    },
  },
  required: ["total_vendas", "cmv", "total_despesas", "despesas"],
};

const SCHEMA_ESTOQUE = {
  type: "object",
  properties: {
    filial: { type: "string", nullable: true },
    cnpj: { type: "string", nullable: true },
    data_referencia: { type: "string" },
    total_itens: { type: "number" },
    total_valor: { type: "number" },
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          codigo: { type: "string", nullable: true },
          produto: { type: "string" },
          unidade: { type: "string", nullable: true },
          quantidade: { type: "number" },
          valor_unitario: { type: "number" },
          valor_total: { type: "number" },
        },
        required: ["produto", "quantidade", "valor_total"],
      },
    },
  },
  required: ["data_referencia", "total_valor", "itens"],
};

interface ReqBody {
  arquivo_id: string;
  idempotency_key?: string;
  force?: boolean; // ignora cache e reprocessa
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let arquivoIdForError: string | null = null;

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

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
      .select("id, tipo_arquivo, storage_path, status, extracted_json, empresa_id")
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
    const bytes = new Uint8Array(ab);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const pdf_base64 = btoa(bin);

    const isEstoque = arquivo.tipo_arquivo !== "dre";
    const prompt = isEstoque ? PROMPT_ESTOQUE : PROMPT_DRE;
    const schema = isEstoque ? SCHEMA_ESTOQUE : SCHEMA_DRE;

    // Lovable AI Gateway (OpenAI-compatible). Suporta PDF via content type "file".
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0,
        max_tokens: 32768,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "file",
                file: {
                  filename: "documento.pdf",
                  file_data: `data:application/pdf;base64,${pdf_base64}`,
                },
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "extracao", strict: true, schema },
        },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      if (aiRes.status === 429)
        throw new Error("Limite de requisições atingido (429). Tente novamente em alguns instantes.");
      if (aiRes.status === 402)
        throw new Error("Créditos do Lovable AI esgotados (402). Adicione créditos em Configurações → Plans & credits.");
      throw new Error(`Lovable AI erro ${aiRes.status}: ${txt.slice(0, 800)}`);
    }

    const aiJson = await aiRes.json();
    const text: string = aiJson?.choices?.[0]?.message?.content ?? "";
    if (!text) {
      const finishReason = aiJson?.choices?.[0]?.finish_reason ?? "unknown";
      throw new Error(`AI retornou resposta vazia (finish_reason=${finishReason})`);
    }


    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (_e) {
      // Persiste o texto bruto para debug e relança erro detalhado.
      await admin
        .from("arquivos_importados")
        .update({
          status: "erro",
          erro_mensagem: `JSON inválido do Gemini. Trecho: ${text.slice(0, 500)}`,
          extracted_json: { __raw_text: text.slice(0, 5000), __parse_error: true },
        })
        .eq("id", arquivo.id);
      throw new Error(`Saída do Gemini não é JSON válido (salva em extracted_json.__raw_text)`);
    }

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
