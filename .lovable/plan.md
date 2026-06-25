# Causa raiz

Olhei o `__raw_preview` do arquivo "ESTOQUE 31 MAIO FORMOSA.pdf" no banco. O `unpdf` está devolvendo **todo o relatório em uma única linha gigante** (sem `\n` entre os itens). O parser atual faz:

```ts
const lines = text.split(/\r?\n/)...
const itemRe = /^(.*?)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)$/;
```

Como só existe 1 linha contendo o relatório inteiro, a regex ancorada em `^...$` nunca casa → 0 itens → aviso "Nenhum item detectado automaticamente". O CNPJ e a data de referência são detectados porque não dependem de quebra de linha, e por isso o cartão aparece como "Extraído" mesmo com 0 itens.

O DRE provavelmente funciona porque o layout repete rótulos únicos (Receita Bruta, CMV…) que ainda casam via `findLineWith`, mas o inventário depende de linhas por item.

# Correção

Na Edge Function `supabase/functions/extract-financial-data/index.ts`, função `parseEstoque`:

1. **Re-linhar o texto antes do parse.** Antes do `split(/\r?\n/)`, normalizar:
   - inserir `\n` antes de cada token que pareça início de item: `código (2-8 dígitos) + descrição + unidade (KG|UNID|UN|PC|...) + 3 números BR no fim`.
   - Padrão proposto: inserir `\n` antes de `\b(\d{2,8})\s+(?=[A-ZÀ-Úa-zà-ú])` quando, dentro dos ~120 chars seguintes, houver `\b(KG|UNID|UN|PC|PCT|CX|LT|DZ|G|ML|L)\b` seguido de três grupos numéricos BR.
   - Como fallback, também quebrar antes de cabeçalhos repetidos ("Código Produto Unid Qtde V.Unit V.Total", "Página X de Y", "Livro de registro de inventário", "Estoque existente em:") para isolar páginas.

2. **Aceitar `UNID` na lista de unidades** (hoje o regex tem `UN` mas o PDF usa `UNID`). Adicionar `UNID` ao `unidadeRe` e à ordem de match (mais longo primeiro: `UNID|KG|PCT|...|UN|...`).

3. **Tolerar item sem quebra perfeita.** Em vez de exigir `^...$`, varrer linha por linha procurando ocorrências do padrão item via `matchAll`, para o caso de duas linhas colarem.

4. **Capturar total reportado** ampliando os rótulos: `total\s+geral`, `valor\s+total\s+do\s+estoque`, `total\s+do\s+invent[aá]rio`, e também a última ocorrência de "Total ... R$ X" no fim do documento.

5. **Manter `__raw_preview`** (primeiros ~2000 chars) para diagnóstico futuro.

Sem mudanças no DRE, no schema ou no front-end. Depois de aplicado, basta clicar **"Forçar reprocessar"** no card de Estoque para re-extrair sem precisar re-upload.

# Validação

- Reprocessar o arquivo `579f98b9-...` (ESTOQUE 31 MAIO FORMOSA) e verificar via `supabase--read_query` que `extracted_json->'itens'` tem comprimento > 0 e `total_valor` é numérico.
- Confirmar no preview que o card mostra contagem de itens e total, sem o aviso amarelo.
