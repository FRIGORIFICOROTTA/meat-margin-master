## Objetivo

Hoje a DRE Fiscal é **estimada** aplicando as alíquotas-padrão do regime sobre a receita. Para fechar o **resultado real**, você precisa lançar os **impostos efetivamente apurados/pagos no mês** (DAS, ICMS, PIS, COFINS, IRPJ, CSLL etc.) e quaisquer ajustes (créditos, retenções, multas/juros). O plano abaixo cria essa camada de "lançamentos fiscais reais" e faz a DRE Fiscal usar **Real** quando existir, caindo para a **Estimativa** quando não houver lançamento.

## O que muda para o usuário

1. **Nova tela `/fiscal`** (no menu, ao lado da DRE) por empresa/mês:
   - Lista os tributos do regime da empresa (Simples → DAS; Presumido/Real → PIS, COFINS, ICMS, ISS opcional, IRPJ, CSLL).
   - Para cada tributo: campo **Valor Estimado** (calculado, somente leitura) e **Valor Real** (editável), com **data de pagamento**, **competência**, **observação** e anexo opcional (guia/DARF em PDF).
   - Botão **"Usar estimativa"** preenche o real com o calculado (útil para meses já fechados sem guia em mãos).
   - Linha extra **"Ajustes fiscais"** (livre, +/-) para retenções de clientes, créditos de PIS/COFINS, etc.
   - Totalizador: **Total Estimado**, **Total Real**, **Diferença (R$ e %)**.

2. **DRE Fiscal (`/dre` aba Fiscal)** passa a ter um seletor:
   - **Estimado** (comportamento atual) e **Real** (usa os lançamentos).
   - Quando "Real" e faltar algum tributo lançado, mostra aviso "X tributos sem lançamento — usando estimativa para esses".
   - Comparativo Gerencial × Fiscal ganha terceira coluna **Fiscal Real**.

3. **Dashboard**: KPI "Carga tributária efetiva" (Total Real / Receita Bruta) e gráfico mensal Estimado × Real.

## Estrutura de dados (nova tabela)

`lancamentos_fiscais`
- `id uuid pk`
- `empresa_id uuid fk empresas`
- `mes int`, `ano int` (competência)
- `tipo text` — enum aplicacional: `das | pis | cofins | icms | iss | irpj | csll | outros`
- `label text` — rótulo livre (usado quando `tipo = 'outros'`, ex.: "Retenção INSS")
- `valor_real numeric(14,2)` — valor pago/apurado
- `valor_estimado numeric(14,2)` — snapshot no momento do lançamento (auditoria)
- `data_pagamento date` (opcional)
- `observacao text` (opcional)
- `arquivo_path text` (opcional, bucket `financial-pdfs`)
- `sinal smallint default 1` — +1 despesa, -1 crédito/ajuste positivo
- `created_at`, `updated_at`, `deleted_at` (soft delete)
- **Unique** parcial `(empresa_id, mes, ano, tipo, label)` para idempotência
- **RLS** análoga às demais tabelas (`user_has_empresa_access`), com `GRANT` para `authenticated` e `service_role`

## Lógica de cálculo

Em `src/lib/fiscal.ts` adicionar `calcularDREFiscalReal(dre, regime, config, lancamentos)`:
- Para cada tributo do regime: usa `valor_real` se houver lançamento ativo, senão usa o estimado.
- Soma `outros` ao bloco "Impostos" (sinal +/-).
- Mantém o restante do cálculo (receita líquida, lucro bruto, lucro antes IR/CSLL, resultado fiscal).
- Retorna também `cobertura: { tributo, origem: 'real'|'estimado' }[]` para a UI exibir os avisos.

## Telas e componentes

- `src/routes/_authenticated/fiscal.tsx` — listagem + edição inline (mês corrente do seletor de período).
- `src/components/LancamentoFiscalRow.tsx` — linha editável (estimado | real | dif | data | anexo | salvar).
- `src/routes/_authenticated/dre.tsx` — Tabs adicional "Estimado/Real" dentro do modo Fiscal; usa novo cálculo.
- Atualizar `exportDREPdf`/`exportDREExcel` para incluir a coluna **Real** quando aplicável.
- Item de menu **Fiscal** no layout `_authenticated`.

## Fluxo recomendado de uso

1. Importar PDFs (DRE/Estoque) como hoje → DRE Gerencial pronta.
2. Abrir **Fiscal** no mesmo mês → revisar os valores estimados, lançar os reais conforme guias pagas, anexar comprovantes.
3. Voltar para **DRE → Fiscal → Real** e ver o resultado líquido efetivo.

## Fora do escopo desta fatia

- Conciliação automática com extrato bancário.
- OCR de guias DARF/DAS.
- Apuração de crédito de ICMS por NF-e.

Posso seguir e implementar?
