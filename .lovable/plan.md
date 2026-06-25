# Plano: Matriz/Filial + CRUD de empresas em Configurações

## Objetivo
Eliminar a confusão do onboarding ("Primeira filial" quando na verdade é a matriz) e permitir cadastrar as demais unidades depois, com distinção formal de tipo.

## 1. Schema (migração Supabase)

- Criar enum `tipo_empresa` com valores `matriz` e `filial`.
- Adicionar coluna `tipo tipo_empresa NOT NULL DEFAULT 'filial'` em `empresas`.
- Backfill: marcar como `matriz` a empresa mais antiga de cada grupo (1 por grupo).
- Índice único parcial: `UNIQUE (grupo_id) WHERE tipo = 'matriz'` — garante exatamente 1 matriz por grupo.
- Manter RLS atual (não muda regra de acesso).

## 2. Onboarding (`src/routes/_authenticated/onboarding.tsx`)

- Renomear seção "Primeira filial" → **"Matriz do grupo"**.
- Renomear "Nome da filial" → **"Nome da matriz"** com placeholder tipo `Ex: Rota das Carnes - Matriz - Brasília DF`.
- Ao gravar, criar a empresa com `tipo = 'matriz'`.
- Texto de apoio explicando: "Você poderá cadastrar as demais filiais depois em Configurações → Empresas."

## 3. Configurações → Empresas (`src/routes/_authenticated/configuracoes.tsx`)

- Adicionar aba/seção **Empresas** com:
  - Lista das empresas do grupo: nome, CNPJ, cidade/UF, regime, **badge Matriz/Filial**.
  - Botão **Nova filial** abre dialog com os mesmos campos do onboarding (sem permitir tipo = matriz já existente).
  - Editar empresa: nome, CNPJ, cidade, UF, regime, config tributária. Tipo bloqueado (não troca matriz/filial pela UI; se precisar, via suporte).
  - Excluir empresa: bloqueado se for matriz e houver filiais; confirmação dupla; soft delete não — delete real respeitando FK (DRE/inventário/arquivos cascateiam por `grupo_id`/`empresa_id` conforme já existe).
- Validação Zod nos formulários (nome, CNPJ formato, UF 2 chars, regime enum).

## 4. UI auxiliar

- **Seletor de empresa** (topbar): mostrar badge `Matriz` ao lado do nome quando aplicável.
- **DRE / Despesas / Estoque / Dashboard**: nada muda na lógica — continuam por `empresa_id`. Apenas o título da página exibe o badge quando a empresa selecionada for matriz.

## 5. Fora de escopo (deixar para depois)

- DRE **consolidada do grupo** (somando matriz + filiais). Pode entrar como próxima fatia.
- Transferência de matriz entre empresas (troca de tipo).
- Hierarquia matriz → filial além de pertencer ao mesmo grupo.

## Detalhes técnicos

```sql
CREATE TYPE public.tipo_empresa AS ENUM ('matriz','filial');
ALTER TABLE public.empresas ADD COLUMN tipo public.tipo_empresa NOT NULL DEFAULT 'filial';

WITH primeiras AS (
  SELECT DISTINCT ON (grupo_id) id FROM public.empresas ORDER BY grupo_id, created_at ASC
)
UPDATE public.empresas SET tipo = 'matriz' WHERE id IN (SELECT id FROM primeiras);

CREATE UNIQUE INDEX empresas_uma_matriz_por_grupo
  ON public.empresas (grupo_id) WHERE tipo = 'matriz';
```

Arquivos a editar:
- `supabase/migrations/<novo>.sql` (via tool de migração)
- `src/routes/_authenticated/onboarding.tsx`
- `src/routes/_authenticated/configuracoes.tsx`
- `src/routes/_authenticated/route.tsx` (badge no seletor)
- `src/lib/app-state.ts` (expor `tipo` no estado da empresa selecionada, se ainda não estiver)

## Resultado esperado

- Onboarding cria explicitamente a **matriz**.
- Filiais são cadastradas em **Configurações → Empresas**, cada uma com seu CNPJ e regime.
- Cada empresa tem sua DRE individual (matriz inclusive).
- Sistema impede duas matrizes no mesmo grupo.
