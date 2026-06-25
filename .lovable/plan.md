## Análise das melhorias commitadas (775eabb — "Corrigiu parser estoque PDF")

O commit refatora apenas `parseEstoque` em `supabase/functions/extract-financial-data/index.ts` (+81/-30). Pontos principais:

1. **Normalização mais agressiva** — colapsa NBSP, `\r`, `\n`, tabs em espaço único antes de processar.
2. **Limpeza de ruído de página** — remove cabeçalhos/rodapés repetidos ("Página X de Y", linha de cabeçalho de colunas, "Livro de Registro de Inventário", "Emitido em ...", "Fls. N") substituindo por espaço para não colar tokens vizinhos.
3. **Captura do total reportado *antes*** da limpeza, garantindo que regex de "Total Geral / Valor Total" não seja apagada.
4. **Parser em duas etapas (mais robusto)**:
   - Ancora em `UNIDADE + 3 números BR` com `\b` para não casar `KG` dentro de "1KG".
   - Volta para a janela anterior e extrai `código + descrição`, tolerando produtos com dígitos no nome.
5. **Diagnóstico**: se 0 itens, loga primeiros 3000 / últimos 1500 caracteres do texto flat.
6. **Preview ampliado** para 3000 chars.

### Estado atual no banco

Consultei `arquivos_importados`. Há dois PDFs de estoque, **ambos com `qtd_itens = 0`** e atualizados antes do deploy do novo parser:
- `contagem estoque formosa abril.pdf` — status `extraido`, warning "nenhum item detectado".
- `ESTOQUE 31 MAIO FORMOSA.pdf` — status `pendente` (nunca chegou a extrair).

Ou seja, a correção foi **commitada mas ainda não validada contra os PDFs reais**.

### Riscos que vejo na nova lógica (a observar nos logs)

- `numSrc` aceita `\d+(?:[.,]\d+)?` sem milhar — pode casar pedaços de número de telefone/CNPJ se eles sobrarem perto da unidade.
- O lookahead `(?=\s|$|[A-Za-zÀ-ÿ])` permite encostar em letra; combinado com a captura "janela anterior" pode incluir lixo do item anterior quando dois itens estiverem coladinhos.
- `codeM` exige `[^\d]` após o código — descrições que começam com dígito (ex.: "1KG ALCATRA") forçam o fallback `fb`, que pega o código mas o produto começa com o token seguinte; verificar.

## Plano de validação

1. Garantir que a Edge Function está deployada com a versão do commit (deploy explícito `extract-financial-data`).
2. Reprocessar com `force=true` os dois PDFs de estoque chamando `extract-financial-data` via curl autenticado.
3. Consultar `arquivos_importados` para conferir `qtd_itens`, `total_valor`, `data_referencia` e `warnings`.
4. Puxar `edge_function_logs` para ler o dump de 3000/1500 chars caso `qtd_itens` siga em 0.
5. Conforme o resultado:
   - **OK** → reporto métricas (itens detectados, total reportado vs somado) e encerro.
   - **Ainda zero ou parcial** → uso o texto bruto do log pra ajustar a regex e proponho patch num plano novo.

Sem alterações de schema. Sem alterações de UI. Só validação + eventual ajuste cirúrgico em `parseEstoque`.
