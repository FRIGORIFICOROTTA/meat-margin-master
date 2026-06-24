# Plano — DRE Inteligente (Grupo Rota das Carnes) — Fase 1

Entrega uma fatia funcional end-to-end. DRE Fiscal/Lucro Real, dashboard avançado, exportação PDF/Excel e convites ficam para fases seguintes.

## Stack
- TanStack Start (já configurado) + React + TS + Tailwind + shadcn/ui
- Supabase (Auth, Postgres, Storage, RLS) — já conectado
- **Edge Function Supabase** chamando Gemini API direto (conforme escolha do usuário) — exige secret `GEMINI_API_KEY`
- React Query, Zod, Recharts

## Escopo da Fase 1
1. **Auth**: login/cadastro/recuperação via Supabase Auth; rotas protegidas via layout `_authenticated` (já gerenciado pela integração).
2. **Onboarding simplificado**: primeiro acesso → cria Grupo e vira `admin_grupo`; cadastra Empresa(s).
3. **Multiempresa**: seletor global de empresa no header (persistido em localStorage); RLS por `usuarios_empresas`.
4. **CRUD Grupos/Empresas/Configuração tributária** (sem fluxo de convites).
5. **Importação de PDFs**: dropzone para 3 tipos (DRE, Estoque Inicial, Estoque Final) por período; upload ao Storage; hash SHA-256 para idempotência.
6. **Extração via Gemini** (Edge Function `extract-financial-data`) com prompts especificados e `responseMimeType: application/json`; status por arquivo.
7. **Tela de revisão** dos dados extraídos antes de confirmar e persistir.
8. **DRE Gerencial** calculada e exibida (Receita, CMV, Variação de Estoque, Resultado Bruto Ajustado, Despesas, Resultado Líquido) com % sobre vendas e destaque na variação.
9. **Aba Estoque** com tabela comparativa inicial vs final + categorização por palavra-chave.
10. **Dashboard mínimo**: cards KPI (Receita, Margem Bruta %, Variação Estoque, Resultado Líquido) e gráfico de linha mensal (Recharts).

Fora do escopo da fase 1 (próximas fases): DRE Fiscal/Lucro Real completa, exportação PDF/Excel, visão consolidada do grupo, convites de usuário, papéis `gestor_empresa`/`visualizador` granulares (fase 1 trata todos os membros como `admin_grupo`).

## Modelo de dados (migration única)
Tabelas conforme especificação do prompt, com GRANTs e RLS:
- `grupos`, `empresas` (com `config_tributaria jsonb`, `regime_tributario` enum), `usuarios_perfil`, `usuarios_empresas`
- `dre_mensal` (UNIQUE empresa_id+mes+ano), `despesas_detalhe`
- `inventario_snapshot` (UNIQUE empresa_id+data_referencia+tipo), `inventario_itens`
- `arquivos_importados` (UNIQUE hash_sha256, status enum)
- Função `has_empresa_access(uuid)` SECURITY DEFINER para RLS sem recursão
- Trigger `update_updated_at_column`
- Índices em FKs e colunas de filtro
- Soft delete via `deleted_at`

Storage bucket privado `financial-pdfs` com policies por `empresa_id` no path.

## Edge Function `extract-financial-data`
- Input: `{ arquivo_id, idempotency_key }` (lê PDF do Storage)
- Verifica `arquivos_importados.status`; se já `extraido` ou `confirmado` para o hash, retorna cache
- Chama Gemini `gemini-2.0-flash` com prompt apropriado por `tipo_arquivo` e `responseMimeType: application/json`
- Persiste resultado bruto em `arquivos_importados.extracted_json`, atualiza status
- Secret: `GEMINI_API_KEY` (será solicitado ao usuário)

## Frontend — rotas (TanStack)
- `/auth` (login/cadastro/recuperação) — pública
- `/_authenticated/onboarding` — criar Grupo + Empresa inicial
- `/_authenticated/` → redirect para dashboard
- `/_authenticated/dashboard` — KPIs + gráfico
- `/_authenticated/importar` — dropzone + lista de arquivos + revisão
- `/_authenticated/dre` — DRE Gerencial do período selecionado
- `/_authenticated/estoque` — comparativo
- `/_authenticated/configuracoes` — CRUD empresas + config tributária

Header com seletor de Empresa e seletor Mês/Ano persistidos.

## Identidade visual
- Primária `#993C1D`, acento `#B85C2A`, neutros cinza-suave
- Fonte: Outfit (via `@fontsource/outfit`)
- Números BR (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`)
- Linhas de seção destacadas na tabela DRE

## Idempotência
- Hash SHA-256 do PDF calculado no client antes do upload; se existir registro com mesmo hash + empresa, reusa
- Upserts `ON CONFLICT` em `dre_mensal` e `inventario_snapshot`
- `idempotency_key` aceito pela Edge Function

## Detalhes técnicos
- Server fns em `src/lib/*.functions.ts` para escritas autenticadas (DRE confirm, CRUD)
- Browser client Supabase para leituras simples sob RLS
- Upload direto ao Storage do client (com session)
- `attachSupabaseAuth` já configurado
- React Query com `queryOptions` por entidade; `ensureQueryData` nos loaders sob `_authenticated`

## Sequência de implementação
1. Migration completa (tabelas + RLS + função `has_empresa_access` + bucket)
2. Solicitar secret `GEMINI_API_KEY`
3. Edge Function `extract-financial-data` + deploy
4. Auth pages + onboarding
5. Header com seletores + layout autenticado
6. CRUD empresas/configuração
7. Importação (upload + chamada Edge Function + revisão + confirmação)
8. DRE Gerencial + Estoque
9. Dashboard
10. Seed opcional com dados de exemplo (Filial Formosa Maio/2026)

## Validação ao final da fase
- Login → cria grupo/empresa → importa 3 PDFs reais → revisa → confirma → DRE Gerencial bate com valores → KPIs preenchidos.
