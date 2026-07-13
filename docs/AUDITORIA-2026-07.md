# Relatório de Auditoria — DRE Inteligente

**Data:** 13 de julho de 2026
**Escopo:** `src/lib/fiscal.ts`, rotas `dre.tsx` / `fiscal.tsx`, Edge Function
`extract-financial-data`, migrations e políticas de RLS
**Metodologia:** auditoria dos 9 blocos de parâmetros da DRE (Receita, Deduções, CMV,
Lucro Bruto, Despesas, Despesas Financeiras, Outras Receitas/Despesas, IRPJ/CSLL,
Resultado Líquido), seguida de validação numérica contra dados reais de Maio/2026
(Nova Rota Ltda — Formosa).

> **Escopo declarado:** esta auditoria valida a **lógica de cálculo** do sistema.
> Não substitui o contador responsável para fechamento fiscal e societário.

---

## 1. Resumo executivo

A DRE **Gerencial** estava estruturalmente correta. A DRE **Fiscal** estava inutilizável
em produção: um conflito entre o enum do banco e o enum do código fazia **todos os
tributos saírem zerados** para qualquer empresa cadastrada.

Foram identificados e corrigidos **5 bugs de cálculo** e **2 vulnerabilidades**.
Todas as correções foram validadas com 32 testes numéricos, typecheck e build de produção.

**Não resolvido por decisão consciente:** os percentuais de PIS/COFINS por empresa
dependem de definição do contador (ver §5). Os defaults são conservadores e
**superestimam** o imposto — nunca o subestimam.

---

## 2. Classificação da DRE

O sistema opera em duas camadas explícitas:

- **Gerencial** — reclassificações permitidas. Não é base fiscal.
- **Fiscal/Societária** — estimativas de tributos sobre o lucro gerencial.

⚠️ **Achado estrutural (aceito, documentado):** a base do IRPJ/CSLL no Lucro Real é o
lucro contábil ajustado (LALUR), não o lucro gerencial. O sistema calcula **provisão
gerencial**, e o Memorial de Cálculo declara isso ao contador. A separação de papéis
está correta desde que essa premissa seja respeitada.

---

## 3. Achados

### A1 — Regime tributário incompatível 🔴 CRÍTICO

O enum do Postgres é `('gerencial', 'lucro_real')`. O código TypeScript esperava
`'simples' | 'presumido' | 'real'`. O cast direto (`as RegimeTributario`) passava no
typecheck mas produzia um valor inexistente em `DEFAULTS[regime]`, resultando em
`undefined` — e **todas as alíquotas viravam zero**.

**Impacto:** a DRE Fiscal exibia resultado líquido idêntico ao gerencial, sem nenhum
imposto, para todas as empresas.

**Correção:** função `normalizeRegime()` mapeia o enum do banco para o regime de cálculo.
Aplicada em `fiscal.tsx` e `dre.tsx`.

---

### A2 — Configuração tributária ignorada 🔴

O banco grava `{aliquota_pis, aliquota_cofins, aliquota_icms, ...}`. O código lia
`{pis, cofins, icms, ...}`. As alíquotas configuradas por empresa **nunca surtiam efeito**;
o sistema sempre caía nos defaults.

**Correção:** função `normalizeConfig()` aceita ambos os formatos, com precedência para
as chaves curtas.

---

### A3 — Adicional de IRPJ não calculado 🔴

O `config_tributaria` default do banco já trazia `adicional_irpj: 0.10` e
`adicional_irpj_limite: 20000`, mas o código **nunca usava esses campos**.

**Base legal:** Lei 9.249/95, art. 3º, §1º — adicional de 10% sobre a parcela do lucro
que exceder R$ 20.000/mês.

**Impacto:** subprovisionamento de IRPJ. Num mês com lucro de R$ 100 mil, R$ 8.000 a menos.

**Correção:** função `calcularIRPJ(base, cfg)` = `15% × base + 10% × max(base − 20.000, 0)`.
Aplicada no Lucro Real e no Presumido.

---

### A4 — PIS/COFINS sem alíquota zero nem créditos 🔴

O regime não-cumulativo aplicava 1,65% + 7,6% sobre **toda** a receita bruta, sem créditos
sobre insumos e ignorando que **carnes bovinas, suínas e de aves têm alíquota zero na venda**
(Lei 12.839/2013 — cesta básica).

**Impacto:** superestimava PIS/COFINS em até 9,25% da receita de carnes. Numa filial com
R$ 418 mil de faturamento, cerca de R$ 38 mil/mês de imposto fantasma — suficiente para
transformar um lucro real em prejuízo aparente na DRE Estimada.

**Correção:** dois parâmetros configuráveis por empresa —
`pis_cofins_pct_receita_tributada` (proporção da receita que gera débito) e
`pis_cofins_pct_base_credito` (proporção das compras com direito a crédito).
Débito líquido = `débito − crédito`, com piso zero.

---

### A5 — IRPJ/CSLL estimados sobre lucro desatualizado 🟡

Ao lançar PIS/COFINS/ICMS **reais**, o IRPJ *estimado* continuava sendo calculado sobre o
lucro da estimativa antiga, e não sobre o lucro apurado com os valores reais.

**Correção:** em `calcularDREFiscalReal()`, o IRPJ/CSLL estimados são recalculados sobre o
LAIR obtido com os tributos operacionais reais.

---

### S1 — RLS de `allowed_emails` expunha a lista completa 🟡

```sql
CREATE POLICY "Anyone can check email exists"
  ON public.allowed_emails FOR SELECT USING (true);
```

Com `USING (true)` e sem restrição de role, qualquer pessoa com a **anon key** (que é pública
por design) podia executar `SELECT * FROM allowed_emails` e obter **todos** os e-mails
autorizados — enumeração de usuários.

**Correção** (migration `20260713120000_fix_allowed_emails_rls.sql`): leitura da tabela
restrita a admins; o fluxo de login passou a usar a RPC `email_is_allowed(text)`, que é
`SECURITY DEFINER` e retorna **apenas um boolean**.

---

### S2 — `.env` fora do `.gitignore` 🟡

**Risco real: baixo.** O arquivo contém apenas a URL do Supabase e a *publishable/anon key*,
ambas públicas por design e protegidas por RLS. Não havia `service_role key` nem credencial
da Gemini.

**Correção:** `.env` e `.env.*` adicionados ao `.gitignore`. A proteção real continua sendo
a correção das políticas de RLS (S1), não o sigilo da anon key.

---

### Itens verificados e aprovados ✅

| Item | Resultado |
|---|---|
| Convenção da variação de estoque (`EI − EF`) | Consistente em `dre.tsx`, `importar.tsx` e `fiscal.ts`; cascata fecha |
| Demais políticas de RLS | Todas as tabelas com RLS ativo, escopo por empresa via `user_has_empresa_access()` |
| `google_oauth_config` legível por anon | Correto — armazena apenas `client_id` (público) e a flag `enabled` |
| Edge Function de extração | Parser determinístico com warnings explícitos; valores não reconhecidos viram `null`, nunca são inventados. Idempotente. |
| Storage de PDFs | Policies escopadas por empresa |

---

## 4. Validação executada

**32 testes numéricos**, todos aprovados:

- Normalização de regime (4 casos, incluindo `null` e valores do enum do banco)
- Normalização de config (chaves longas do banco → chaves curtas do código)
- IRPJ com adicional em 4 faixas (abaixo, exatamente no limite, acima, prejuízo)
- Cascata completa da DRE Fiscal Estimada — caso real Formosa, receita R$ 418.888,95
- PIS/COFINS com alíquota zero + crédito sobre insumos
- Sobreposição de lançamentos reais e recálculo do IRPJ sobre o LAIR real
- Modo de estimativas desativadas (só lançamentos manuais compõem a DRE)

Também validados: `tsc --noEmit` sem erros e build de produção (Vite + Nitro) concluído.

---

## 5. Pendências com o contador

Estas **não são bugs** — são premissas que exigem decisão técnica contábil:

1. **`pis_cofins_pct_receita_tributada`** — proporção da receita que efetivamente gera débito
   de PIS/COFINS. Para açougue, carnes são alíquota zero; provavelmente só bebidas e mercearia
   geram débito. **Default atual: 100% (superestima).**

2. **`pis_cofins_pct_base_credito`** — proporção das compras com direito a crédito. Avaliar o
   crédito presumido agroindustrial (Lei 10.925/04) na aquisição de gado.
   **Default atual: 0% (superestima).**

3. **Alíquota efetiva de ICMS** — o default de 18% ignora o tratamento de cesta básica /
   carga reduzida para carnes em GO. Preferencialmente, lançar o ICMS apurado como **valor real**
   (o sistema já suporta).

4. **IRPJ/CSLL definitivos** — seguem sendo apurados via LALUR. Os números do sistema são
   provisão gerencial.

**Enquanto os itens 1–3 não estiverem definidos, use a aba "Real" da DRE Fiscal**, que reflete
os tributos efetivamente pagos.

---

## 6. Rastreabilidade

| Commit | Conteúdo |
|---|---|
| `3f7e667` | Correção dos 5 bugs fiscais (A1–A5) + segurança (S1, S2) |
| `6187071` | Editor de alíquotas na tela Fiscal + estimativas opcionais |
| `1993c7d` | Correção do salvamento de lançamentos e exibição na DRE |
| `08a1b90` | Correção da formatação do Memorial de Cálculo (PDF) |

Migration de segurança aplicada em produção (projeto `wzzpybquxllpjrehkunv`) e validada
em 13/07/2026.
