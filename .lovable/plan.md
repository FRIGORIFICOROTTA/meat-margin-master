## Diagnóstico

Comparando o esperado com o atual no parser de estoque:

| Arquivo | Itens esperados | Valor esperado | Detectado hoje | Diferença |
|---|---|---|---|---|
| Maio (final) | 313 | 58.594,72 | **313 / 58.594,72** ✅ | 0 |
| Abril (inicial) | 318 | 69.203,23 | **317 / 69.140,39** | -1 item / -62,84 |

Ou seja: **maio está 100% correto**. O problema é só no abril — o parser está deixando 1 item de fora cujo `valor_total` é R$ 62,84.

### Causa provável (a confirmar com log)

O parser tem 3 pontos onde um item legítimo pode ser descartado:

1. **Âncora regex** (`UNIDADE seguida de 3 números`) — exige `\b` antes da unidade. Itens cuja descrição termine colada na unidade (ex.: `...750ML UN01UN UNID 1,00 ...` — note o `UN01UN` na imagem) podem confundir o lookbehind e fazer o regex casar com `UN` em vez de `UNID`, "comendo" o item anterior.
2. **Dedup key** = `codigo|valor_total|quantidade`. Se dois itens distintos têm mesmo código (caso raro mas possível em SKU repetido) **ou** se um item aparece com código `null`, a chave colide e o segundo é jogado fora.
3. **Captura código+descrição**: pega o ÚLTIMO `dígito + letra` da janela. Quando a descrição do item *anterior* termina em número (ex.: `500G`, `750ML`, `200G`), esse número pode ser interpretado como "código" do item *seguinte*, deixando o item anterior sem código e fazendo o atual perder a descrição correta.

O valor 62,84 não bate com nenhum item visível nas últimas linhas do PDF, então o item perdido está no meio do relatório.

## Plano de correção

### 1. Instrumentar para localizar o item perdido (1 deploy)

Em `supabase/functions/extract-financial-data/index.ts`, adicionar log SEMPRE (não só quando zero):
- Total de âncoras (`anchorRe`) encontradas vs itens aceitos.
- Lista dos descartes com motivo: `"qtd/vu/vt null"`, `"window vazia"`, `"produto < 2 chars"`, `"dedup key colidiu (key=...)"`.
- Soma calculada vs `totalReportado` e a diferença.

Pedir ao usuário para clicar em **"Forçar reprocessar"** no arquivo de abril e ler o log da função.

### 2. Corrigir a(s) causa(s) identificada(s)

Dependendo do log, aplicar uma ou mais:

- **Dedup mais robusto**: trocar a chave por `${codigo}|${produto}|${vt}` (inclui descrição) — colisões só acontecem se for genuinamente o mesmo item.
- **Âncora resiliente a `UN01UN`**: exigir que o caractere *anterior* à unidade não seja letra/dígito, e dar prioridade à unidade mais longa (`UNID` antes de `UN`) ordenando o regex `UNID|KG|PCT|PC|CX|LT|MT|DZ|GR|ML|UN|G|L` — já está nessa ordem, mas o `|` em regex é guloso da esquerda, então OK. O ajuste real é mudar `\b(${UNI})\b` para `(?<![A-Za-z0-9])(${UNI})(?=\\s)`.
- **Detecção de código melhor**: aceitar como código apenas se a janela começar com `^\d{1,8}\s+[A-Za-zÀ-ÿ]` (não pegar dígitos no meio), e se não houver, deixar `codigo=null` mas ainda **manter o item** (o dedup acima já protege).

### 3. Validar

- Reprocessar abril → esperar **318 itens / 69.203,23**.
- Reprocessar maio → continuar **313 / 58.594,72** (não regredir).
- Mostrar no chat o diff antes/depois.

### 4. UX (opcional, baixo custo)

Na tela `/estoque`, exibir um aviso amarelo quando `itens.length` ≠ `total_itens reportado pelo PDF` ou quando `soma(itens) ≠ total_valor reportado`, para o usuário detectar discrepâncias futuras sem precisar abrir a função.

## Entregável

Um único deploy da edge function `extract-financial-data` com diagnóstico + correção, validado contra os dois PDFs reais.