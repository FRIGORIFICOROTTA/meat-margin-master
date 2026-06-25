## Objetivo

Trocar a extração via Gemini por um **parser determinístico** que lê o texto do PDF direto no servidor (sem IA), e permitir **editar/inserir** os dados manualmente depois da importação. A IA passa a ser usada só para análise/relatórios (resumos, insights, comparativos), nunca mais para extrair números.

## Mudanças

### 1. Parser nativo de PDF (Edge Function)
Reescrever `extract-financial-data` para:
- Baixar o PDF do Storage.
- Extrair o texto bruto usando `unpdf` (biblioteca pura JS/Deno, sem binários nativos, sem chamadas externas).
- Aplicar **regras de parsing por regex** específicas para o layout dos relatórios do grupo:
  - **DRE**: detectar linhas como "Receita Bruta", "Devoluções", "CMV/Custo", "Despesas Operacionais" e cada categoria; converter valores BR (`1.234,56` → `1234.56`); tratar parênteses/sinais como negativo.
  - **Estoque**: detectar cabeçalho (data, CNPJ, filial) e iterar as linhas da tabela (código, produto, unidade, qtd, vl. unit., vl. total).
- Salvar em `arquivos_importados.extracted_json` no mesmo formato JSON já consumido pela UI.
- Em caso de linhas não reconhecidas, persistir em `extracted_json.__warnings` com o trecho cru, sem falhar.

Remover dependência de `GEMINI_API_KEY` e `LOVABLE_API_KEY` nessa função.

### 2. Edição manual dos dados extraídos
Na tela `/importar`, no bloco "Revisão antes de confirmar":
- Transformar os cards de KPI (Total de vendas, CMV, Resultado bruto, Total despesas, Estoque inicial/final) em **inputs editáveis** com máscara BR.
- Adicionar uma **tabela editável de despesas** abaixo dos KPIs, com colunas: categoria (select), subcategoria, valor. Botão "Adicionar despesa" e ícone de excluir por linha.
- Botão **"Confirmar e gerar DRE"** passa a salvar a versão editada (sobrescreve `extracted_json` antes de persistir em `dre_mensal` e `despesas_detalhe`).

### 3. Edição pós-importação (DRE já gerada)
Na rota `/dre`, adicionar botão **"Editar DRE"** que abre um modal com os mesmos campos editáveis (totais + tabela de despesas) e permite:
- Corrigir qualquer valor manualmente.
- Adicionar/remover linhas de despesa.
- Salvar regrava `dre_mensal` + `despesas_detalhe` do período/empresa atual (idempotente).

### 4. Estoque manual
Em `/estoque`, adicionar botão **"Adicionar item"** e edição inline (qtd, vl. unit., vl. total) na tabela existente, mais botão de excluir por linha. Recalcula totais ao salvar.

### 5. Renomear botões na UI
- "Extrair com IA" → **"Extrair PDF"**
- "Forçar reprocessar" → **"Re-extrair"** (mantém)
- Remover qualquer menção a "IA" no contexto de extração; deixar claro na home/ajuda que a IA é usada apenas em relatórios.

## Pontos técnicos

- **Lib**: `unpdf` (Deno-compatível, zero deps nativas) para extrair texto. Funciona em Edge Functions Supabase.
- **Robustez**: regex são por seções com âncoras (ex.: capturar valor após "Total de Vendas" até quebra de linha). Layout variando → caem em `__warnings` mas não quebram o fluxo (o usuário edita manualmente).
- **Migração**: nenhuma alteração de schema; usamos colunas/JSONs já existentes em `arquivos_importados`, `dre_mensal`, `despesas_detalhe`, `inventario_*`.
- **IA**: fica reservada para um próximo passo (resumos/insights na tela Dashboard), via Lovable AI Gateway.

## O que NÃO muda
- Estrutura do banco, autenticação, multi-empresa, fluxo de upload e idempotência por hash do arquivo.

## Pergunta antes de implementar
O parser regex funciona bem se os PDFs sempre seguem o mesmo layout (ex.: exportados sempre do mesmo ERP). Se houver variação grande entre filiais, talvez algumas linhas caiam em "warnings" e você precise editar manualmente. Tudo certo seguir assim, ou prefere que eu já preveja **upload de CSV/Excel** como alternativa ao PDF?
