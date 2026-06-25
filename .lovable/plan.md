## Problema

O parser de DRE em `supabase/functions/extract-financial-data/index.ts` (função `parseDRE`) assume que o texto extraído do PDF tem quebras de linha (`\n`). O `unpdf` está devolvendo o PDF do VR System como uma única linha gigante. Com isso:

- `text.split(/\r?\n/)` produz uma única "linha" com tudo
- `captureNumberByLabel` chama `lastNumberInLine`, que retorna o **último** número do texto inteiro — no PDF de teste, é o "2" de "Página 2 de 2"
- Por isso `total_vendas=2`, `cmv=2`, `resultado_líquido=2` e zero despesas

Confirmado no banco: o último arquivo `DEMONSTRATIVO DE RESULTADO.pdf` (status `extraido`) salvou todos os campos = 2. Um arquivo mais antigo, cujo PDF tinha quebras de linha, foi extraído corretamente.

## Correção

Reescrever `parseDRE` para ser **resiliente a texto sem quebras de linha**, no mesmo padrão que já fizemos no `parseEstoque`:

1. **Normalização**
   - Colapsar NBSP, tabs, `\r`, `\n` em espaços únicos.
   - Remover ruído repetido: `https://vrsystem.info`, `Página N de M`, cabeçalho "Demonstrativo de Resultado … hh:mm:ss", "Tipo data: …", linha de gráfico ("As porcentagens deste gráfico…").

2. **Captura de totais por âncora + número à frente**
   - Para cada label (`Total Vendas`, `CMV / Custo das mercadorias vendidas`, `Resultado bruto`, `Total de despesas`, `Resultado líquido`, `Devoluções`), montar regex `/<label>\s*([\-\(]?\s*R?\$?\s*[\d.]+,\d{2}\)?)/i` que pega o **primeiro número logo após o rótulo**, em vez do último da linha.
   - Para `Resultado bruto` e `Resultado líquido`, usar a **última** ocorrência (no PDF aparecem duas vezes: dentro e fora do detalhamento).
   - Manter `parseBR` (já trata parênteses e sinal).

3. **Detalhamento de despesas**
   - Recortar a região entre a âncora `Plano de conta Valor % Vnd` (ou `Despesas <valor> <pct>` inicial) e `Resultado bruto` (segunda ocorrência) / `Total de despesas`.
   - Dentro dessa região, aplicar regex global `/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9\/\-\. ]{2,40}?)\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})(?=\s|$)/g` capturando triplas `(label, valor, %)`.
   - Filtrar labels que sejam cabeçalhos/totais (`Despesas`, `Total de despesas`, `Resultado bruto`, `Resultado líquido`, `Plano de conta`, `Valor`, `% Vnd`).
   - Manter `categorize(label)` existente.

4. **Período**
   - Já há regex para `\d{2}\/20\d{2}`; ampliar para reconhecer também `De: 01/05/2026 até: 31/05/2026` e derivar `mes`/`ano` daí.

5. **Compatibilidade**
   - Manter o caminho atual funcionando para PDFs que vêm com quebras de linha (regex de label não depende da existência de `\n`).

6. **Diagnóstico**
   - Aumentar `__raw_preview` para 3000 caracteres (igual estoque) e, quando `total_vendas` ficar null, logar `text.slice(0, 1500)` no console da edge function.

## Validação

- Reprocessar o arquivo `f9a31bac-7dac-4621-9352-d7949dbe41e1` ("DEMONSTRATIVO DE RESULTADO.pdf" maio/2026) com `force=true` e confirmar:
  - `total_vendas = 418888.95`
  - `cmv = 256552.64`
  - `total_despesas = 59181.37`
  - `resultado_liquido = 103154.94`
  - 11 despesas detalhadas (Manutencao, Aluguel, Agua, Maquinas de cartao, Internet, Salarios, Vale Funcionario, Gratificações, Publicidade, Despesa de loja, Obras).
- Reprocessar o outro arquivo (que já funcionava) e confirmar que continua igual — sem regressão.

## Arquivos tocados

- `supabase/functions/extract-financial-data/index.ts` — apenas `parseDRE` e helpers próximos. `parseEstoque` não é alterado.

Nada de mudança de schema, RLS, rotas ou UI.
