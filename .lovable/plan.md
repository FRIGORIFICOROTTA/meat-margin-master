
## Objetivo

Resolver dois pontos na tela **Lançamentos Fiscais** (`/fiscal`):

1. Permitir **excluir** qualquer linha de ajuste/tributo — inclusive os "Adicionar ajuste/outro" recém-criados que ainda não foram salvos (hoje o botão de lixeira só aparece quando o registro já existe no banco).
2. Adicionar uma **explicação prática** de como funciona a parte fiscal e como preencher os valores e as alíquotas, sem precisar de conhecimento contábil prévio.

## Mudanças (apenas em `src/routes/_authenticated/fiscal.tsx`)

### 1. Exclusão de ajustes

- Botão de lixeira passa a aparecer em **todas as linhas de "outros/ajuste"** (mesmo sem `id`):
  - Se já tem `id` salvo → chama `deleteMut` (soft-delete no banco, comportamento atual).
  - Se ainda não foi salvo → remove apenas da lista local (`setRows`).
- Para tributos padrão do regime (ICMS, PIS, COFINS, IRPJ, CSLL, Simples), a lixeira **não** aparece (eles representam tributos obrigatórios do regime; o usuário zera o valor real se não houver). Se tiverem `id` salvo, mostramos um botão "Limpar" que zera valor/data/observação e remove o registro do banco.
- Diálogo de confirmação simples (`confirm()` nativo) antes de excluir um registro já salvo, para evitar exclusão acidental.

### 2. Guia explicativo

Adicionar, logo abaixo do cabeçalho da página, um card recolhível **"Como preencher esta tela"** (usando `<details>` ou um `Collapsible` shadcn já disponível), aberto por padrão na primeira visita e fechável. Conteúdo em linguagem simples, dividido em blocos curtos:

- **Para que serve esta tela**: registrar o valor **real** dos impostos pagos no período, para que a DRE Fiscal reflita o resultado verdadeiro (e não só uma estimativa).
- **De onde vem o "Estimado"**: cálculo automático baseado no regime tributário da empresa (Simples / Presumido / Real) aplicado sobre a Receita ou o Lucro. É só uma referência — o valor que conta é o **Real**.
- **Como preencher cada tributo** (passo a passo):
  1. Pegue a guia/DARF/DAS efetivamente paga no mês.
  2. Digite o valor pago em **Valor Real**. Se quiser usar a estimativa como ponto de partida, clique no botão **=**.
  3. (Opcional) Informe a data de pagamento e uma observação (nº da guia, parcelamento etc.).
  4. Clique em **Salvar**.
- **Ajustes / Outros**: usar para itens não previstos no regime — retenções (INSS, IRRF, ISS retido), créditos tributários, multas, parcelamentos. Escolher o sinal:
  - **Despesa (+)** → soma aos tributos (reduz o lucro).
  - **Crédito (−)** → abate dos tributos (aumenta o lucro).
- **Diferença (coluna)**: mostra `Real − Estimado`. Vermelho = pagou mais que o estimado; verde = pagou menos. Serve de alerta para revisar lançamentos.
- **Impacto na DRE**: explicar que, ao salvar, a DRE Fiscal no modo **Real** passa a usar esses valores; no modo **Estimado** continua usando o cálculo automático.
- **Por que Gerencial ≠ Fiscal**: a diferença entre as duas visões corresponde exatamente aos tributos lançados aqui (a base operacional Receita − CMV − Variação − Despesas é a mesma).

### Detalhes visuais

- O guia usa um card discreto com ícone de "informação" e tipografia menor, sem poluir a tela.
- Estado de aberto/fechado guardado em `localStorage` (`fiscal-help-open`) para respeitar a escolha do usuário entre visitas.
- A dica curta atual ("clique em = para copiar...") é absorvida pelo guia novo.

## Fora de escopo

- Sem mudanças no schema do banco, no cálculo fiscal (`src/lib/fiscal.ts`) ou na DRE.
- Sem mudanças nas demais rotas.
