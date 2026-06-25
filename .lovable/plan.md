## Plano: ajustes na importação

### 1. Resultado líquido sem variação de estoque
Confirmado pelo usuário — manter o cálculo atual. Sem alterações de código.

### 2. Pré-lançamento do Estoque Inicial a partir do Estoque Final do mês anterior
Quando o usuário abrir `/importar` em um mês que ainda não tem `estoque_inicial`, buscar automaticamente o `estoque_final` do mês imediatamente anterior (mesma empresa) e usá-lo como pré-lançamento.

Comportamento:
- Só pré-popula se **não existir** snapshot `inicial` no mês corrente (não sobrescreve dados reais).
- Mostra um banner discreto: "Estoque inicial pré-lançado a partir do estoque final de {mês anterior} — confirme ou edite". Botão "Confirmar" persiste como snapshot `inicial` do mês corrente (copiando total e itens). Botão "Descartar" remove a sugestão e permite upload normal.
- Não cria `arquivos_importados` falso — o snapshot fica marcado com origem `derivado_mes_anterior` (novo valor em campo `observacao`/metadata existente, sem mudança de schema; gravamos no `config` da DRE ou em um campo texto já disponível).
- Implementação: nova query `estoqueFinalAnteriorQ` em `importar.tsx`; ação `confirmarPreLancamentoEstoque` que insere em `inventario_snapshot` + `inventario_itens` clonando o anterior.

### 3. Duplicidade de despesas (categorias somando subcategorias)
**Diagnóstico:** o PDF de DRE traz, no plano de contas, **linhas-resumo de categoria** (ex: "Despesas com Pessoal  12.345,67  3,12") seguidas das **subcategorias** que compõem aquela categoria (Salários, Encargos, etc.). O parser atual (`parseDRE`, regex `tripleRe`) captura **as duas**, então a soma de `despesas_detalhe` dobra: paga categoria + soma das subcategorias.

**Correção no `supabase/functions/extract-financial-data/index.ts`:**
- Detectar linhas-resumo de categoria e descartar, mantendo apenas as folhas (subcategorias).
- Estratégia: após capturar todas as triplas, agrupar por nome candidato a categoria; se o valor de uma linha for **≈ soma das linhas seguintes** dentro de uma janela (tolerância 1%), marcar como cabeçalho e excluí-la.
- Reforço por rótulo: lista de nomes conhecidos de cabeçalho ("Despesas Operacionais", "Despesas com Pessoal", "Despesas Administrativas", "Despesas Financeiras", "Despesas com Vendas", "Tributos", "Outras Despesas") — quando o nome bate e existe pelo menos uma subcategoria abaixo, descartar.
- Validar com o PDF real (já temos o de Maio/Formosa) via `code--execute_preview_javascript` antes de finalizar: a soma de `despesas_detalhe` deve bater com `total_despesas` extraído.

**Migração de dados existentes:** botão **"Reprocessar"** já existente em `/importar` resolve para os arquivos do usuário (limpa `despesas_detalhe` e recria). Não há migração SQL.

### Ordem de execução
1. Fix do parser de despesas (#3) — maior impacto, valida com PDF real.
2. Pré-lançamento de estoque (#2) — nova UI + ação no `importar.tsx`.

### Fora do escopo
- Não mexer no cálculo de resultado líquido (#1 mantém-se).
- Sem alterações de schema.
