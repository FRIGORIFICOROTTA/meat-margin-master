## Explicação contábil (por que dá diferença hoje)

**1. Variação de estoque — o que é**
Variação = Estoque Final − Estoque Inicial. Ela existe porque o CMV "puro" do ERP raramente bate exatamente com o consumo físico real: há quebras, perdas, transferências, ajustes de inventário, diferenças de custo médio. A variação faz a ponte entre o resultado contábil e a realidade física do estoque.

Tecnicamente, o CMV "verdadeiro" do período é:
```text
CMV Ajustado = Estoque Inicial + Compras − Estoque Final
            = CMV do ERP + (Estoque Inicial − Estoque Final)
            = CMV do ERP − Variação de Estoque
```
Quando a variação é **negativa** (estoque caiu, ex.: −10.608,51), significa que consumimos mais do que comprou → o CMV real é **maior** que o do ERP.
Quando é **positiva** (estoque subiu), parte das compras virou estoque, não custo → CMV real é **menor**.

**2. Por que Gerencial ≠ Fiscal hoje no app**

| Linha | Gerencial (tela DRE) | Fiscal (tela DRE) |
|---|---|---|
| Receita Bruta | total_vendas | total_vendas |
| (−) Impostos s/ venda | — | PIS/COFINS/ICMS/DAS |
| (−) CMV | CMV do ERP | CMV do ERP (sem variação) |
| (−) **Variação de estoque** | **subtraída do Resultado Bruto** | **ignorada** (comentário no código: "evita dupla contagem") |
| (−) Despesas | total_despesas | total_despesas |
| (−) IRPJ/CSLL | — | sim |

Ou seja, hoje o **Gerencial** absorve a variação de estoque (você pediu isso na correção anterior) e o **Fiscal** não absorve. Essa é a principal fonte da diferença, **além** dos tributos — que naturalmente deveriam diferir.

**Conclusão técnica:** não é "erro de cálculo", é **inconsistência de base entre as duas visões**. Contabilmente o correto é tratar a variação de estoque dentro do **CMV Ajustado**, e aplicar a mesma base nas duas DREs. A diferença legítima entre Gerencial e Fiscal deve vir **apenas dos tributos** (PIS/COFINS/ICMS/DAS/IRPJ/CSLL), não da variação de estoque.

---

## Plano de ajuste

Objetivo: alinhar Gerencial e Fiscal usando **CMV Ajustado = CMV + (−Variação)** nas duas visões, mantendo a variação visível como linha informativa.

### 1. `src/lib/fiscal.ts`
- Em `calcularDREFiscal` e `calcularDREFiscalReal`, trocar:
  ```text
  cmv_ajustado = dre.cmv
  ```
  por:
  ```text
  cmv_ajustado = dre.cmv - dre.variacao_estoque
  ```
  (variação negativa aumenta o CMV; positiva reduz — exatamente a definição contábil).
- Adicionar campo `variacao_estoque` no retorno `DREFiscal` para exibição.
- Remover o comentário "evita dupla contagem" (não havia dupla contagem; havia **omissão**).

### 2. `src/routes/_authenticated/dre.tsx`
- **Gerencial**: manter exibição atual, mas reorganizar a apresentação para deixar claro:
  ```text
  Receita Bruta
  (−) CMV
  (−) Variação de Estoque        ← linha informativa
  = Resultado Bruto Ajustado
  (−) Despesas
  = Resultado Líquido Gerencial
  ```
  Fórmula final permanece: `Receita − CMV − Variação − Despesas` (já está assim).
- **Fiscal**: passar a exibir a linha "Variação de Estoque" logo abaixo do CMV, e usar `cmv_ajustado` no Lucro Bruto. O Resultado Líquido Fiscal passa a refletir a mesma variação física, diferindo do Gerencial **apenas pelos tributos**.
- Atualizar o painel comparativo "Gerencial × Fiscal" para mostrar que a diferença é exatamente: `impostos + IRPJ + CSLL`.

### 3. `src/routes/_authenticated/fiscal.tsx`
- Recalcular o "Valor Estimado" usando a nova base (a estimativa por tributo não muda, pois é sobre Receita; mas o resultado líquido estimado sim). Validar que o card de comparação Estimado × Real continua coerente.

### 4. Tooltip explicativo na UI
- Adicionar um pequeno tooltip/legenda em ambas as DREs ao lado de "Variação de Estoque":
  > "Ajuste do CMV pela variação física do estoque (Estoque Final − Estoque Inicial). Variação negativa aumenta o custo real do período."

### 5. Sem migração de banco
Nenhum dado persistido muda — `resultado_liquido_gerencial` já é recalculado na exibição/edição. A mudança é apenas em cálculo e apresentação.

### Resultado esperado (seu exemplo)
- Gerencial líquido = `Receita − CMV − Variação − Despesas` (sem mudança numérica).
- Fiscal líquido = `Receita − Impostos − CMV − Variação − Despesas − IRPJ − CSLL` (passa a incluir a variação, ficando contabilmente consistente).
- Diferença Gerencial − Fiscal = exatamente `Impostos + IRPJ + CSLL`.
