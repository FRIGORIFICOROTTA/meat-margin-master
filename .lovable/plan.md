# Validação End-to-End com Dados Reais

## Objetivo
Antes de novas features, garantir que o fluxo principal (cadastro → onboarding → importação → DRE/Estoque/Despesas/Dashboard → exportação) funciona com um arquivo real do usuário, e corrigir tudo que aparecer no caminho.

## Etapas

### 1. Smoke test do fluxo atual (sem código)
- Subir Playwright em headless contra `localhost:8080`, autenticar via sessão Supabase injetada.
- Percorrer: `/auth` → onboarding (criar grupo + empresa) → `/importar` → `/dre` → `/estoque` → `/despesas` → `/dashboard` → `/configuracoes`.
- Screenshot em cada etapa + captura de console/network errors.
- Resultado: lista priorizada de bugs reais (não suposições).

### 2. Validar o edge function `extract-financial-data`
- Testar com 3 amostras: planilha simples (xlsx), PDF de DRE escaneado, PDF de DRE digital.
- Para cada amostra: chamar o edge function via `supabase--curl_edge_functions`, conferir JSON retornado contra o schema esperado em `dre_mensal` / `despesas_detalhe` / `inventario_itens`.
- Verificar logs (`supabase--edge_function_logs`) e gasto de tokens no AI Gateway.
- Ajustar prompt do Gemini, validação Zod do retorno, e mapeamento para colunas do banco se necessário.

### 3. Corrigir bugs encontrados
Categorias prováveis (a confirmar no passo 1-2):
- **Parser/extração**: campos faltando, valores com vírgula vs ponto, sinais invertidos (despesa positiva), meses fora do range.
- **UI**: estados vazios sem CTA, loaders travados, period selector permitindo intervalos sem dados.
- **Cálculos**: divergência entre soma de `despesas_detalhe` e `total_despesas` no `dre_mensal`, fiscal vs gerencial com sinal errado.
- **Exportação**: PDF cortando colunas, Excel sem formatação BRL, falhar quando não há dados no período.
- **Permissões**: queries que esquecem `user_has_empresa_access`, RLS bloqueando legitimamente.

### 4. Hardening mínimo
- Tratamento de erro padronizado nos `*.functions.ts` (toast amigável + log).
- Mensagens claras quando o arquivo importado é rejeitado (motivo específico, não "erro genérico").
- Reprocessar arquivo: botão em `/importar` para re-rodar extração num `arquivo_importado` existente.
- Validação no upload: tamanho, tipo MIME, página máxima do PDF.

### 5. Documentação rápida
- Atualizar `.lovable/plan.md` marcando Fase 1+2 como validadas.
- Adicionar seção "Fluxo de teste" com os 3 arquivos-amostra e o resultado esperado.

## Entregáveis
1. Relatório dos bugs encontrados (com screenshots/logs).
2. Correções aplicadas em parser, UI, cálculos, exportação.
3. Botão de reprocessamento em `/importar`.
4. Mensagens de erro/empty-state melhoradas.
5. Plan atualizado.

## Fora de escopo
Contas a pagar/receber, conciliação bancária, multi-tenant billing, novas telas. Apenas validação e correção do que já existe.

## Pré-requisito
Para o passo 2 preciso de pelo menos 1 arquivo real (xlsx ou PDF de DRE) que você usaria no dia-a-dia. Pode subir aqui no chat? Sem isso, faço só o passo 1 com dados sintéticos e o passo 2 fica para depois.
