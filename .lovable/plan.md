# Relatório de Memorial de Cálculo — DRE Gerencial e Fiscal

## Objetivo

Gerar um documento PDF "Memorial de Cálculo" que descreve, em linguagem técnica contábil, todas as fórmulas e critérios usados pelo sistema. O contador recebe este PDF e confirma se a lógica está aderente à legislação e ao regime tributário da empresa.

## Onde fica no app

- Novo botão **"Memorial de Cálculo (PDF)"** na tela `/dre`, ao lado dos botões de exportar PDF/Excel já existentes.
- Geração 100% client-side com `jsPDF` + `jspdf-autotable` (já instalados em `src/lib/export-utils.ts`).
- O PDF reflete a empresa e o período selecionados (usa regime tributário e `config_tributaria` reais da empresa), para que o contador veja exatamente as alíquotas aplicadas no caso dele.

## Conteúdo do PDF

Estrutura em seções numeradas, com fórmulas, exemplos numéricos do mês corrente e referências às colunas do banco:

1. **Identificação** — Grupo, Empresa, CNPJ, Regime Tributário, Período, data de emissão.
2. **Origem dos dados** — explicação de que valores gerenciais vêm da importação dos PDFs do ERP (DRE + Inventário), revisados pelo usuário antes de persistir.
3. **DRE Gerencial — fórmulas**
   - Receita Bruta = `total_vendas`
   - Devoluções = `devolucoes`
   - Receita Líquida Gerencial = Receita Bruta − Devoluções
   - CMV = `cmv` (do ERP)
   - Variação de Estoque = Estoque Inicial − Estoque Final (convenção: positiva = consumo extra)
   - **CMV Ajustado = CMV + Variação de Estoque**
   - Resultado Bruto = Receita Líquida − CMV Ajustado
   - Despesas Operacionais = soma de `despesas_detalhe.valor`
   - **Resultado Líquido Gerencial = Resultado Bruto − Despesas**
4. **DRE Fiscal Estimado — fórmulas por regime**
   - Base tributável = Receita Bruta − Devoluções
   - **Simples Nacional**: DAS = Base × `aliquota_simples`
   - **Lucro Presumido**: PIS, COFINS, ICMS, ISS sobre a Base; IRPJ = Base × presunção_irpj × alíquota_irpj; CSLL análogo
   - **Lucro Real**: PIS, COFINS, ICMS, ISS sobre a Base; IRPJ/CSLL sobre Lucro antes do IR (se positivo)
   - Tabela com as alíquotas atualmente configuradas na empresa (lidas de `empresas.config_tributaria` com fallback nos `DEFAULTS` de `src/lib/fiscal.ts`).
5. **DRE Fiscal Real**
   - Para cada tributo: se houver lançamento em `lancamentos_fiscais` para o período → usa valor real; senão → mantém estimado.
   - Ajustes "outros" entram com sinal (+1 despesa / −1 crédito).
6. **Base operacional unificada** — nota explicando que Gerencial e Fiscal usam a MESMA base (Receita − CMV Ajustado − Despesas) e que a diferença entre os dois resultados é exatamente o bloco de tributos.
7. **Exemplo numérico do período selecionado** — tabela lado a lado: linha a linha da DRE Gerencial e da DRE Fiscal (Estimado e Real, se houver), com valores e % sobre receita.
8. **Glossário e premissas** — definição de cada termo, convenção de sinal da variação de estoque, tratamento de subtotais duplicados no parser, política de idempotência na importação.
9. **Campo de validação do contador** — espaço com linhas para Nome, CRC, Data, Assinatura e parecer ("De acordo / Ajustes necessários").

## Detalhes técnicos

- Novo arquivo `src/lib/memorial-export.ts` exportando `exportMemorialCalculoPdf(opts)`.
- `opts` recebe: dados da empresa (nome, cnpj, regime, config_tributaria), período (mes/ano), e o DRE do período (gerencial + fiscal estimado + fiscal real já calculados pela página).
- Em `src/routes/_authenticated/dre.tsx`: adicionar handler que reaproveita os dados já carregados na rota e chama o novo export.
- Sem migrações de banco. Sem mudança nas fórmulas existentes — apenas documenta o que já está em `src/lib/fiscal.ts` e na rota da DRE.
- Nome do arquivo: `Memorial_Calculo_DRE_<empresa>_<mes>-<ano>.pdf`.

## Fora de escopo

- Não altera cálculos.
- Não adiciona campos no banco.
- Não envia e-mail ao contador (apenas gera o PDF para o usuário baixar e encaminhar).
