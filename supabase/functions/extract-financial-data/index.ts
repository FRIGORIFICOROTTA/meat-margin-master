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

const PROMPT_DRE = `Você é um especialista em análise financeira contábil brasileira. Analise o PDF de Demonstrativo de Resultado e extraia os dados. Retorne EXCLUSIVAMENTE um objeto JSON válido, sem markdown, sem comentários, exatamente nesta estrutura:
{
  "filial": string,
  "periodo_inicio": "YYYY-MM-DD",
  "periodo_fim": "YYYY-MM-DD",
  "total_vendas": number,
  "cmv": number,
  "resultado_bruto": number,
  "despesas": [
    { "categoria": string, "subcategoria": string|null, "valor": number, "percentual_venda": number }
  ],
  "total_despesas": number,
  "resultado_liquido": number
}
Valores monetários como número decimal (use ponto, não vírgula). Não invente dados ausentes — use null quando não encontrar.`;

const PROMPT_ESTOQUE = `Você é um especialista em gestão de estoque e inventário. Analise o PDF de Livro de Registro de Inventário e extraia todos os itens. Retorne EXCLUSIVAMENTE um objeto JSON válido, sem markdown, exatamente nesta estrutura:
{
  "filial": string,
  "cnpj": string,
  "data_referencia": "YYYY-MM-DD",
  "total_itens": number,
  "total_valor": number,
  "itens": [
    { "codigo": string, "produto": string, "unidade": string,
      "quantidade": number, "valor_unitario": number, "valor_total": number }
  ]
}
Extraia TODOS os itens listados, sem omitir nenhum. Valores como número decimal com ponto.`;

interface ReqBody {
  arquivo_id: string;
  idempotency_key?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Sem token de autenticação");

    // Cliente do usuário (RLS aplicado) — valida acesso ao arquivo
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const body = (await req.json()) as ReqBody;
    if (!body.arquivo_id) throw new Error("arquivo_id obrigatório");

    const { data: arquivo, error: arqErr } = await userClient
      .from("arquivos_importados")
      .select("id, tipo_arquivo, storage_path, status, extracted_json, empresa_id")
      .eq("id", body.arquivo_id)
      .single();

    if (arqErr || !arquivo) throw new Error("Arquivo não encontrado ou sem acesso");

    // Idempotência: cache se já extraído/confirmado
    if (
      (arquivo.status === "extraido" || arquivo.status === "confirmado") &&
      arquivo.extracted_json
    ) {
      return new Response(
        JSON.stringify({ cached: true, data: arquivo.extracted_json, status: arquivo.status }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cliente admin para download/update
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    await admin
      .from("arquivos_importados")
      .update({ status: "processando", erro_mensagem: null })
      .eq("id", arquivo.id);

    // Baixa o PDF do storage
    const { data: file, error: dlErr } = await admin.storage
      .from("financial-pdfs")
      .download(arquivo.storage_path);
    if (dlErr || !file) throw new Error(`Falha ao baixar PDF: ${dlErr?.message}`);

    const ab = await file.arrayBuffer();
    // base64 encode
    const bytes = new Uint8Array(ab);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const pdf_base64 = btoa(bin);

    const prompt =
      arquivo.tipo_arquivo === "dre" ? PROMPT_DRE : PROMPT_ESTOQUE;

    // Chama Gemini 2.0 Flash
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "application/pdf", data: pdf_base64 } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
    });

    if (!geminiRes.ok) {
      const txt = await geminiRes.text();
      throw new Error(`Gemini erro ${geminiRes.status}: ${txt.slice(0, 500)}`);
    }

    const geminiJson = await geminiRes.json();
    const text: string =
      geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) throw new Error("Gemini retornou resposta vazia");

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (_e) {
      throw new Error(`Saída do Gemini não é JSON válido: ${text.slice(0, 200)}`);
    }

    await admin
      .from("arquivos_importados")
      .update({ status: "extraido", extracted_json: parsed })
      .eq("id", arquivo.id);

    return new Response(
      JSON.stringify({ cached: false, data: parsed, status: "extraido" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("extract-financial-data error:", msg);
    // Marca erro se houver arquivo_id
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body?.arquivo_id) {
        const admin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await admin
          .from("arquivos_importados")
          .update({ status: "erro", erro_mensagem: msg })
          .eq("id", body.arquivo_id);
      }
    } catch (_e) {
      // ignore
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
