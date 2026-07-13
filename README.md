# DRE Inteligente — Rota das Carnes

Sistema de apuração de **DRE Gerencial e Fiscal** para o Grupo Rota (frigorífico / açougues),
com importação automatizada de relatórios do ERP, tratamento de variação de estoque no CMV
e cálculo tributário sob Lucro Real.

> **Status:** em produção desde 13/07/2026.
> Auditoria de código e correções fiscais concluídas — ver [Histórico](#histórico-do-projeto).

---

## 1. O que o sistema faz

| Módulo | Função |
|---|---|
| **Importar** | Upload dos PDFs do ERP (DRE mensal, Inventário Inicial e Final). Parser determinístico extrai os valores; o usuário revisa e confirma antes de persistir. Idempotente — reimportar o mesmo período substitui, não duplica. |
| **DRE** | Cascata Gerencial e Fiscal lado a lado. A Fiscal tem duas visões: **Estimada** (alíquotas × base) e **Real** (valores efetivamente pagos). |
| **Fiscal** | Editor de alíquotas por empresa + lançamento dos tributos realmente pagos (DAS, DARF, guias). |
| **Estoque** | Snapshots de inventário que alimentam a variação de estoque. |
| **Despesas** | Detalhamento das despesas operacionais por categoria. |
| **Memorial de Cálculo** | PDF com todas as fórmulas e premissas, para validação e assinatura do contador. |

### Fórmula central

```
CMV Ajustado = CMV (do ERP) + Variação de Estoque
Variação de Estoque = Estoque Inicial − Estoque Final
```

Variação **positiva** significa que o estoque caiu: houve consumo além do registrado em CMV,
então o custo real do período **aumenta**. Essa é a base operacional usada tanto na DRE
Gerencial quanto na Fiscal — a diferença entre as duas é **exclusivamente** o bloco de tributos.

---

## 2. Stack

- **Frontend:** React + TanStack Router/Query, Tailwind, shadcn/ui
- **Backend:** Supabase (Postgres + RLS + Edge Functions)
- **Build/Deploy:** Vite + Nitro, sincronizado com [Lovable](https://lovable.dev)
- **Extração de PDF:** `unpdf` + regex determinístico (Edge Function `extract-financial-data`)

### Modelo de dados

```
grupos → empresas → dre_mensal ─┬→ despesas_detalhe
                                └→ lancamentos_fiscais
                    inventario_snapshot → inventario_itens
                    arquivos_importados (PDFs + extracted_json)
```

Toda tabela tem RLS ativo, com acesso escopado por empresa via `user_has_empresa_access()`.

---

## 3. Configuração tributária

As alíquotas ficam em `empresas.config_tributaria` (JSONB) e são editáveis na tela **Fiscal**.
Valores ausentes assumem os defaults de `src/lib/fiscal.ts`.

| Parâmetro | Default (Lucro Real) | Observação |
|---|---|---|
| `pis` / `cofins` | 1,65% / 7,6% | Não-cumulativo |
| `icms` | 18% | Carnes em GO têm carga reduzida — ajustar |
| `irpj` / `csll` | 15% / 9% | |
| `adicional_irpj` + `adicional_irpj_limite` | 10% sobre o que exceder R$ 20.000/mês | Lei 9.249/95 |
| `pis_cofins_pct_receita_tributada` | 1,0 (100%) | ⚠️ **Ver alerta abaixo** |
| `pis_cofins_pct_base_credito` | 0,0 | ⚠️ **Ver alerta abaixo** |
| `estimativas_habilitadas` | `true` | Se `false`, só lançamentos manuais compõem a DRE Fiscal |

### ⚠️ Pendência com o contador

Os dois últimos parâmetros estão com **defaults conservadores que superestimam o imposto**.

**Carnes bovinas, suínas e de aves têm alíquota zero de PIS/COFINS na venda**
(Lei 12.839/2013 — cesta básica). Para um açougue, a maior parte da receita não gera débito.
Com o default atual (100% tributada, 0% de crédito), a DRE Fiscal **Estimada** cobra imposto
que provavelmente não existe.

**Antes de usar a DRE Estimada para decisão, defina com o contador:**
1. Que proporção da receita efetivamente gera débito de PIS/COFINS (bebidas, mercearia etc.)
2. Que proporção das compras dá direito a crédito — incluindo avaliar o crédito presumido
   agroindustrial (Lei 10.925/04) na compra de gado
3. A alíquota efetiva de ICMS para carnes em GO/DF

Enquanto isso não estiver alinhado, **prefira a aba "Real"** da DRE Fiscal, que usa os valores
efetivamente pagos.

---

## 4. Limites do sistema (leia antes de confiar nos números)

- **A DRE Fiscal produz estimativas gerenciais, não apuração legal.** A base do IRPJ/CSLL no
  Lucro Real é o lucro contábil ajustado (LALUR), não o lucro gerencial. A apuração definitiva
  é do contador.
- **Reclassificações gerenciais não servem como base fiscal** sem aval formal do contador.
- O parser de PDF exige PDFs de **texto** (não digitalizados). Valores não reconhecidos viram
  `null` e são preenchidos manualmente na tela de Importação — nunca são inventados.
- Em parcelamentos, apenas juros e correção entram na DRE; o principal abate o passivo.
  O sistema **não** faz esse split automaticamente — lance com atenção.

---

## 5. Histórico do projeto

### Auditoria de código — 13/07/2026

Auditoria completa de `src/lib/fiscal.ts`, rotas, Edge Function e políticas de RLS.
Cinco bugs de cálculo e dois de segurança encontrados e corrigidos, com 32 testes numéricos.

**Bugs de cálculo**

| Bug | Impacto |
|---|---|
| Enum do banco (`gerencial`/`lucro_real`) incompatível com o código (`simples`/`presumido`/`real`) | 🔴 **Crítico** — todos os tributos saíam **zerados** na DRE Fiscal |
| Config tributária lida com chaves erradas (`pis` vs `aliquota_pis`) | Alíquotas por empresa eram silenciosamente ignoradas |
| Adicional de IRPJ (10% > R$ 20 mil/mês) nunca calculado | Subprovisionava IRPJ |
| PIS/COFINS sobre 100% da receita, sem crédito e sem alíquota zero de carnes | Superestimava imposto em até 9,25% da receita |
| IRPJ/CSLL estimados sobre lucro desatualizado quando havia tributos reais lançados | Cascata inconsistente |

**Segurança**

| Item | Correção |
|---|---|
| RLS de `allowed_emails` com `USING (true)` expunha a lista completa de e-mails a qualquer um com a anon key | Substituído pela RPC `email_is_allowed()`, que retorna apenas boolean |
| `.env` fora do `.gitignore` | Adicionado (o arquivo continha só chaves públicas — risco baixo) |

**Melhorias de usabilidade entregues na sequência**

- Editor de alíquotas na tela Fiscal + toggle para desativar estimativas automáticas
- Botão **"Salvar tudo"** visível nos lançamentos fiscais (antes era um ícone escondido);
  badge por linha indicando "não salvo" / "salvo · na DRE"
- DRE Fiscal passou a abrir na aba **"Real"** — os lançamentos manuais não apareciam por padrão
- Memorial de Cálculo: corrigida a corrupção de caracteres no PDF (a fonte Helvetica do jsPDF é
  Latin-1 e não tem `−`, `Σ`, `±`), o corte de frases no meio e a marca d'água sobre a assinatura

---

## 6. Desenvolvimento

```bash
npm install
npm run dev
```

Migrations ficam em `supabase/migrations/` e são aplicadas via Lovable ou pelo SQL Editor
do Supabase. As funções são idempotentes (`CREATE OR REPLACE`), seguras para reexecutar.

Antes de qualquer push, valide:

```bash
npx tsc --noEmit    # typecheck
npx vite build      # build de produção
```

⚠️ Este repositório é sincronizado com o Lovable. **Não reescreva histórico publicado**
(force push, rebase ou squash de commits já enviados).

---

## 7. Referência legal

| Norma | Assunto |
|---|---|
| Lei 12.839/2013 | Alíquota zero de PIS/COFINS — carnes bovinas, suínas e aves (cesta básica) |
| Lei 9.249/95, art. 3º §1º | Adicional de 10% de IRPJ sobre lucro acima de R$ 20.000/mês |
| Lei 10.925/04 | Crédito presumido agroindustrial na aquisição de insumos |
| RCTE-GO | ICMS Goiás — diferimento na entrada de gado, crédito outorgado |
