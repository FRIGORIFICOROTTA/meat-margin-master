## Objetivo

1. Restringir acesso: só emails cadastrados numa lista de autorização podem entrar (senha ou Google).
2. Tela em Configurações para gerenciar credenciais Google OAuth e a allowlist de emails.
3. Aplicar identidade visual do logo Rota das Carnes (vermelho carne + preto profundo) modo claro e modo escuro 
4. Adicionar logo como marca d'água discreta no sistema, sidebar e relatórios, e como imagem de fundo na tela de login.

---

## 1. Logo como asset

- Fazer upload do logo enviado via `lovable-assets` → `src/assets/logo-rota.png.asset.json`.
- Criar componente `<BrandLogo />` reutilizável em `src/components/brand/BrandLogo.tsx` (aceita `size`, `variant`).

## 2. Paleta de cores (src/styles.css)

Substituir tokens semânticos por paleta vermelho carne + preto profundo:

- `--background: #0a0a0a`, `--foreground: #fafafa`
- `--primary: #c8102e` (vermelho carne), `--primary-foreground: #ffffff`
- `--card: #1a1a1a`, `--sidebar: #0a0a0a`, `--sidebar-primary: #c8102e`
- `--border/--muted` em cinzas escuros para contraste
- Manter `@theme inline` para os utilities shadcn.

## 3. Marca d'água

- **Sistema (rotas autenticadas)**: `<Watermark />` fixo no `_authenticated/route.tsx`, `position: fixed`, centralizado, `opacity: 0.03`, `z-index: 0`, `pointer-events: none`, `background-image` do logo com `background-size` grande. Conteúdo real fica em `z-index: 10`.
- **Sidebar**: logo no topo do sidebar (contraste padrão, não marca d'água) — editar componente sidebar existente.
- **Login**: `src/components/auth/LoginSignupForm.tsx` recebe `background-image` do logo com overlay escuro `rgba(10,10,10,0.85)`. Painel esquerdo passa a mostrar o logo real em vez do placeholder "R".
- **Relatórios**: `src/lib/memorial-export.ts` (export PDF/HTML) ganha marca d'água CSS `@media print` com o logo em `opacity: 0.05` centralizado em cada página via `body::before`.

## 4. Allowlist de emails + credenciais Google (banco)

### Migration

Duas tabelas novas:

`**allowed_emails**` — emails autorizados a entrar

- `email` (text, unique, lowercase), `added_by` (uuid → auth.users), `note` (text opcional)
- RLS: só admins (dono do grupo via `grupos.owner_id = auth.uid()`) leem/escrevem
- GRANTs: SELECT/INSERT/UPDATE/DELETE para authenticated; ALL para service_role

`**google_oauth_config**` — 1 linha (singleton) com credenciais do Google OAuth

- `id` (fixo 1), `client_id` (text), `client_secret_ref` (text — nome do secret no Lovable Cloud), `enabled` (bool), `updated_by`, `updated_at`
- RLS: só admins leem/escrevem
- **Importante**: o Client Secret real é gravado como Supabase secret (`GOOGLE_OAUTH_CLIENT_SECRET`) via `add_secret`, nunca em texto no banco. A tabela só guarda o Client ID (público) + flag `enabled` + referência.

Função helper `is_admin()` — retorna true se `auth.uid()` é `owner_id` de algum grupo.

### Enforcement da allowlist

Server function `check_email_allowed(email)` chamada no login:

- Frontend (`LoginSignupForm`): após `signInWithPassword` bem-sucedido, chamar server fn; se email não autorizado → `supabase.auth.signOut()` + toast erro.
- Google OAuth: após redirect, no `beforeLoad` do `_authenticated/route.tsx` (ou num callback público `/auth/callback`), validar; se não autorizado → signOut + redirect `/auth?error=not_allowed`.
- Signup: bloquear no frontend antes de `signUp()` — server fn pública que só retorna boolean.

Trigger opcional em `auth.users` INSERT? **Não** — não podemos escrever na schema `auth`. Enforcement fica no server function + UI.

## 5. Tela de Configurações (aba nova)

Editar `src/routes/_authenticated/configuracoes.tsx` adicionando duas abas:

**Aba "Acessos"**

- Lista de emails autorizados (tabela com add/remove)
- Input para adicionar email + botão "Autorizar"
- Só visível para admins (dono de grupo)

**Aba "Google Login"**

- Campo Client ID (texto)
- Campo Client Secret (password, salvo via `update_secret` no `GOOGLE_OAUTH_CLIENT_SECRET`)
- Toggle "Ativar login com Google"
- Instruções passo-a-passo com URLs prontas (Redirect URI do Supabase, Authorized Origins) para copiar
- Aviso: "Após salvar aqui, cole também no painel do Supabase → Authentication → Providers → Google" (limitação: Supabase Auth lê os providers do dashboard dele, não do nosso banco — nossa tabela serve como *fonte de verdade documentada + flag de ativação no frontend*)

## 6. Fluxo Google no LoginSignupForm

- Botão "Continuar com Google" só aparece se `google_oauth_config.enabled = true` (query pública com policy anon read do campo `enabled`).
- Depois do OAuth, no callback validar allowlist.

---

## Arquivos criados/editados

**Novos:**

- `src/assets/logo-rota.png.asset.json`
- `src/components/brand/BrandLogo.tsx`
- `src/components/brand/Watermark.tsx`
- `src/lib/auth-allowlist.functions.ts` (server fns: `checkEmailAllowed`, `listAllowedEmails`, `addAllowedEmail`, `removeAllowedEmail`, `getGoogleOAuthConfig`, `updateGoogleOAuthConfig`)
- `src/components/settings/AccessTab.tsx`
- `src/components/settings/GoogleAuthTab.tsx`

**Editados:**

- `src/styles.css` — nova paleta
- `src/routes/_authenticated/route.tsx` — adiciona `<Watermark />`
- `src/routes/_authenticated/configuracoes.tsx` — abas novas
- `src/components/auth/LoginSignupForm.tsx` — logo real, fundo do logo, gate do botão Google, validação allowlist pós-login
- `src/lib/memorial-export.ts` — marca d'água nos relatórios
- Sidebar (arquivo a identificar em `src/components/` — provavelmente em `_authenticated/route.tsx` ou layout) — logo no topo

**Migration:** 2 tabelas + função `is_admin()` + policies + grants.

**Secret novo:** `GOOGLE_OAUTH_CLIENT_SECRET` (via `add_secret`).

---

## Fora de escopo

- Sincronização automática das credenciais Google com o Supabase Auth (impossível sem Management API + PAT do Supabase — o usuário ainda precisa colar no dashboard do Supabase uma vez).
- Convites por email / envio de link.
- Filtro por domínio corporativo.
- Modo claro alternativo.

Confirma para eu implementar?