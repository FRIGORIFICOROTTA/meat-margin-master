## Problema

Você importou os PDFs no período errado (Junho) e quando tentou reimportar em Maio, o sistema bloqueou porque o hash do arquivo já existe vinculado a outro período. Hoje a tela `/importar` não tem como excluir um arquivo importado nem mover ele de período — por isso você ficou travado.

## Solução

Adicionar dois controles em cada card de arquivo importado em `/importar`:

1. **Mover para outro período** — abre um pequeno seletor de Mês/Ano. Reatribui o `arquivos_importados.mes/ano` e, se houver `dre_id` ou `snapshot_id` vinculados, atualiza o `mes/ano` do `dre_mensal` e a `data_referencia` do `inventario_snapshot` correspondente. É a opção certa pro seu caso: você só move tudo de Junho → Maio sem reprocessar nada.
2. **Excluir importação** — remove o registro de `arquivos_importados`, apaga o PDF do storage, e (com confirmação) apaga também o `dre_mensal` + `despesas_detalhe` e/ou `inventario_snapshot` + `inventario_itens` vinculados àquele arquivo. Útil quando você quer recomeçar do zero.

Antes de mover, o sistema valida se já existe DRE no período-destino pra mesma empresa e avisa pra evitar conflito com a constraint `unique(empresa_id, mes, ano)`.

## Onde mexe

- `src/routes/_authenticated/importar.tsx`: adiciona botões "Mover período" e "Excluir" no card de cada arquivo, com `AlertDialog` de confirmação para exclusão e um `Popover` com selects Mês/Ano para mover.
- Sem mudanças de schema, sem mudanças em Edge Function. Tudo cliente + Supabase via RLS já existente.

## Fluxo pro seu caso concreto

1. Vá em `/importar` com a empresa da filial selecionada e o período em **Junho**.
2. Em cada um dos 3 cards (DRE, Estoque Inicial, Estoque Final), clique em **Mover período** → selecione **Maio** → confirme.
3. Troque o seletor de período do topo pra Maio e os dados aparecem lá, já vinculados corretamente. Nenhum reprocessamento, nenhum PDF reenviado.

Alternativa, se preferir refazer: clique em **Excluir** nos 3 cards em Junho (marca também "apagar DRE/estoque vinculados"), troque pro Maio, reimporte os mesmos PDFs.