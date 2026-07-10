
## Objetivo
Replicar neste projeto (TanStack Start) a estrutura de autenticação do projeto ERP-ROTTABASE: tela de login/cadastro polida com painel de marca, botão "Continuar com Google" e fluxo completo de recuperação/definição de senha.

## Arquivos que serão criados/alterados

### 1. `src/components/auth/GoogleIcon.tsx` (novo)
Cópia idêntica do ERP-ROTTABASE (SVG multi-cor do Google).

### 2. `src/components/auth/LoginSignupForm.tsx` (novo)
Portado do ERP-ROTTABASE, adaptado ao stack:
- Trocar `react-router-dom` (`useNavigate`, `useSearchParams`) por `@tanstack/react-router` (`useRouter`, `useSearch`/`Route.useSearch`).
- Manter as duas abas **Entrar / Cadastrar** com painel lateral de marca (esquerda) e formulário (direita).
- Manter `signInWithPassword`, `signUp` (com `emailRedirectTo`) e `resetPasswordForEmail` com `redirectTo: ${origin}/definir-senha`.
- Manter botão **Continuar com Google** via `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })` com tratamento de erro "provider is not enabled".
- Suporte a `?next=/rota` para redirecionar após login (validado como caminho relativo same-origin).
- Substituir o import do logo (`@/assets/logo.png` não existe aqui) por um placeholder com a letra "R" no mesmo estilo já usado no `auth.tsx` atual, ou por texto — sem adicionar novo asset.
- Manter o card de disclaimer "Uso consciente e responsabilidade".

### 3. `src/routes/auth.tsx` (substituir)
- Manter `ssr: false` e o `beforeLoad` que redireciona usuário já logado para `/dashboard`.
- Substituir o corpo pelo `<LoginSignupForm />`.
- Validar `search` param `next` via Zod (`validateSearch`) para tipagem.

### 4. `src/routes/definir-senha.tsx` (novo, público)
Portado do `SetPassword.tsx`:
- Rota pública (fora de `_authenticated/`), `ssr: false`.
- Detecta sessão temporária vinda do hash do email (Supabase processa automaticamente).
- Formulário com nova senha + confirmação, chama `supabase.auth.updateUser({ password })`.
- Após sucesso, `router.navigate({ to: "/dashboard", replace: true })`.
- Trata "link inválido/expirado" com CTA para voltar a `/auth`.

### 5. Sem mudanças
- `src/routes/_authenticated/route.tsx` já está correto (redireciona para `/auth`).
- `src/start.ts` já registra `attachSupabaseAuth`.
- Sem migrations, sem novas dependências (usa Lucide, Sonner, shadcn já instalados).
- Sem mexer em RLS, nem em lógica de negócio, nem em onboarding.

## Instruções de configuração (fornecidas ao final, no chat)
Após a implementação, precisarei que você configure no painel do Supabase e do Google Cloud para o Google login funcionar:

1. **Google Cloud Console** → APIs & Services → Credentials → **Create OAuth Client ID (Web application)**:
   - Authorized JavaScript origins: `https://dre.rotadascarnes.com`, `https://meat-metrics.lovable.app`, `https://id-preview--64a34eb3-b482-4b34-8b7c-b6909cf80922.lovable.app`, `http://localhost:8080`
   - Authorized redirect URIs: `https://wzzpybquxllpjrehkunv.supabase.co/auth/v1/callback`
2. **Supabase Dashboard** → Authentication → Providers → **Google**: ativar e colar Client ID + Client Secret.
3. **Supabase Dashboard** → Authentication → URL Configuration:
   - Site URL: `https://dre.rotadascarnes.com`
   - Redirect URLs: adicionar todas as origens acima + `/definir-senha`.

## Fora de escopo
- Não vou criar tabela `profiles`, nem trigger, nem tocar em `usuarios_perfil` / `grupos` / `empresas` (o onboarding já cuida).
- Não vou adicionar Apple, Microsoft ou outros providers.
- Não vou copiar assets (logo.png) do outro projeto — usarei o placeholder já existente.

Confirma para eu implementar?
