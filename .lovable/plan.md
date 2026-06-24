# Próximo passo — Fatia 2

A Fatia 1 entregou autenticação, multiempresa, importação de PDFs com Gemini, DRE Gerencial, estoque e dashboard. Agora avançamos para a camada fiscal e refinamentos.

## Escopo

### 1. DRE Fiscal (alternável por empresa)
- Toggle Gerencial / Fiscal na rota `/dre`.
- Cálculo fiscal por regime tributário da empresa (Simples / Lucro Presumido / Lucro Real):
  - Aplicar alíquotas configuradas em `empresas` sobre receita bruta.
  - Deduções de impostos (ICMS, PIS, COFINS, ISS, IRPJ, CSLL) conforme regime.
  - Receita líquida fiscal = bruta − impostos.
  - Resultado fiscal usando variação de estoque oficial.
- Comparativo lado-a-lado Gerencial × Fiscal (diferença e %).

### 2. Despesas detalhadas
- Nova aba/rota `/despesas` listando `despesas_detalhe` do período.
- Agrupamento por categoria com totais e % sobre receita.
- Gráfico de pizza/barras das top categorias.
- Filtro por empresa/período via app-state.

### 3. Exportação
- Botão "Exportar PDF" na DRE (usando `@react-pdf/renderer` ou `jspdf`) com layout limpo, cabeçalho da empresa e período.
- Botão "Exportar Excel" (usando `xlsx`) com abas: DRE, Despesas, Estoque.
- Exportações respeitam o modo ativo (Gerencial/Fiscal).

### 4. Dashboard — histórico e comparativos
- Adicionar série temporal de 12 meses (receita, margem, variação estoque).
- Comparativo mês atual vs. mês anterior vs. mesmo mês ano anterior.
- KPI consolidado do grupo (soma de todas empresas do grupo selecionado).

### 5. Polimentos
- Loading states e empty states consistentes.
- Validação de período sem dados (mostrar CTA para importar).
- Toast de erro padronizado em todas as mutations.

## Detalhes técnicos

- **Cálculo fiscal**: criar `src/lib/fiscal.ts` com função pura `calcularDREFiscal(dre, empresa)` que recebe `dre_mensal` e config tributária e retorna estrutura comparável à gerencial.
- **Server functions**: novos `*.functions.ts` em `src/lib/` para agregações de 12 meses e consolidação por grupo (evitar N queries no client).
- **Exportação PDF**: `@react-pdf/renderer` (compatível com Worker via SSR opcional, ou gerar no client com `ClientOnly`).
- **Exportação Excel**: `xlsx` (SheetJS) puro client.
- **RLS**: queries continuam passando pelo `requireSupabaseAuth` e helper `user_has_empresa_access`.

## Fora de escopo nesta fatia
- Conciliação bancária, contas a pagar/receber, fluxo de caixa projetado.
- Multi-tenant billing.
- App mobile.

Confirmar para eu implementar, ou ajustar prioridades (ex.: pular exportação, focar só em fiscal + despesas).