# Ajustes na tela de login + esclarecimento do fluxo de cadastro

## 1. Tela de login — ajustes visuais

**`src/components/auth/LoginSignupForm.tsx`**:
- **Marca d'água maior**: `w-[min(80vw,720px)]` → `w-[min(110vw,1200px)]`, mantendo opacidade discreta (~0.05) e `mix-blend-luminosity`.
- **Logo em elipse antes do wordmark**: adicionar um círculo (`w-20 h-20 rounded-full`) com o `BRAND_LOGO_URL` dentro, borda vermelha sutil (`border border-[#c8102e]/30`), fundo `bg-zinc-900/60`, sombra glow vermelha (`shadow-[0_0_40px_rgba(200,16,46,0.25)]`), posicionado acima do título "ROTA DAS CARNES" (centralizado, margem inferior).
- **Botão Google sempre visível**: remover a condicional `googleEnabled` do render dos dois formulários (login e cadastro). O botão aparece sempre; se o Google não estiver ativado no Supabase, o toast "Login com Google ainda não está ativado no Supabase" continua tratando o erro. A tela de Configurações → Google Login continua controlando a config em `google_oauth_config`, mas o botão passa a ser sempre exibido.

## 2. Sobre o fluxo de cadastro (confirmação, não é mudança de código)

Confirmando o comportamento atual, que **já está correto** conforme sua pergunta:

- **Primeiro cadastro** (via tela `/auth` → aba "Cadastrar"):
  1. Usuário se cadastra com email/senha (email precisa estar em `allowed_emails`).
  2. Ao logar pela primeira vez sem grupo, é redirecionado para `/onboarding`.
  3. Em `/onboarding` cria **grupo econômico + empresa matriz** (código já existe em `src/routes/_authenticated/onboarding.tsx`).
  4. Esse primeiro usuário vira o **owner do grupo** (`grupos.owner_id`) e, portanto, admin do sistema (`is_admin()` retorna true para ele).

- **Usuários adicionais**: entram por Configurações → Acessos. O admin:
  1. Cadastra o email em `allowed_emails`.
  2. Envia o link de cadastro para o novo usuário (ele se cadastra em `/auth`).
  3. Se quiser vincular a empresas específicas, usa a tabela `usuarios_empresas` (isso ainda não tem UI — pode ser um próximo passo se você precisar).

## 3. Confirmação de email no primeiro acesso

O envio do email de confirmação é **controlado pelo Supabase Auth**, não pelo código do app. Situação atual:

- Este projeto usa Supabase **externo** (não Lovable Cloud). Portanto o Lovable não pode automatizar templates/SMTP.
- Ao cadastrar, o código já trata os dois cenários (`src/components/auth/LoginSignupForm.tsx`):
  - Se `data.session` existe → confirmação desativada, entra direto no onboarding.
  - Se não → mostra toast "Verifique seu email para confirmar o cadastro."

**O que você precisa verificar no Supabase Dashboard** (`Authentication → Providers → Email`):
- **"Confirm email"**: se estiver **ON**, o usuário precisa clicar no link do email antes de logar. Se **OFF**, cadastro entra direto (recomendado para MVP interno já que a allowlist já filtra quem entra).
- **SMTP**: por padrão o Supabase usa o SMTP dele com limite baixo (3–4 emails/hora). Para produção real, configurar SMTP próprio em `Authentication → SMTP Settings` (Resend, SendGrid etc.) — sem isso, emails de confirmação/reset podem não chegar.
- **Redirect URLs**: em `Authentication → URL Configuration`, incluir a URL de produção (`https://dre.rotadascarnes.com`) e a de preview em "Redirect URLs", senão o link do email confirmação/reset volta para localhost.
- **Template "Confirm signup"**: pode ser customizado com marca Rota das Carnes.

Vou deixar um alerta discreto em Configurações → Google Login (ou criar uma sub-seção "Autenticação por email") apontando esses 3 pontos? **Se quiser**, marque isso no seu retorno; se não, apenas ajusto a tela de login.

## Fora de escopo (deste plano)
- UI para vincular usuários a empresas específicas.
- Configuração de SMTP/templates no Supabase (feito no dashboard, não em código).
- Enviar convite automático por email para novo email adicionado à allowlist.
