## Diagnóstico

Reproduzi o cenário com os logs do Supabase Auth e a rede: o cadastro **foi criado** (HTTP 200 em `/signup` com `confirmation_sent_at` e sem `session`), mas você não vê nada porque:

1. **O `<Toaster />` só existe dentro do layout `_authenticated`** (`src/routes/_authenticated/route.tsx:91`). Na tela `/auth` (pública) não há Toaster montado, então **nenhum `toast.success` / `toast.error` aparece** — nem "Verifique seu email", nem "Email não autorizado", nem erros de senha. É o principal motivo de "nenhum informativo de status".
2. **Confirmação de email está ligada no Supabase** (o `/signup` respondeu `confirmation_sent_at` e sem sessão). Sem clicar no link do email o usuário não entra — e sem toast ele nem sabe que precisa checar o email.
3. O botão volta para "Criar conta" (sem erro) e o usuário fica na mesma tela → parece que "nada aconteceu".
4. **Não há checagem de email já cadastrado antes do signup** — usuário tenta 3× o mesmo email (`user_repeated_signup` nos logs) sem receber mensagem clara.

---

## Plano — Validação ponta a ponta do primeiro acesso

### 1. Corrigir feedback visual na tela `/auth`
- Adicionar `<Toaster richColors position="top-center" />` dentro do próprio `LoginSignupForm.tsx` (ou no `routes/auth.tsx`) para que os toasts apareçam na tela de login.
- Adicionar um bloco de **status inline** (alerta persistente abaixo do botão) para mensagens críticas — toast some, alerta fica: 
  - "Conta criada! Enviamos um link de confirmação para `email@x.com`. Verifique sua caixa de entrada e spam."
  - "Este email não está autorizado. Peça liberação ao administrador."
  - "Email ou senha incorretos."
- Trocar mensagens de erro pelo `friendlyAuthError` já existente + tratar explicitamente `user_already_registered` → "Este email já tem conta, use Entrar ou 'Esqueceu?'".

### 2. Tela de "cadastro concluído — confirme seu email"
Após signup bem-sucedido sem sessão, trocar o formulário por uma tela de confirmação com:
- Ícone + "Enviamos um link para **email**"
- Botão **Reenviar email de confirmação** (usa `supabase.auth.resend({ type: 'signup', email })`)
- Botão **Voltar para login**
- Instrução clara sobre checar spam

### 3. Fluxo end-to-end do primeiro acesso (documentado + testado)
```text
1. Admin adiciona email em Configurações → Acessos (tabela allowed_emails)
2. Usuário abre /auth → aba Cadastrar → nome + email + senha
3. Front chama checkEmailAllowed(email)
    ├─ não autorizado → alerta vermelho persistente + toast
    └─ autorizado → supabase.auth.signUp()
        ├─ retorna session   → toast sucesso → /onboarding
        └─ sem session (confirm ON) → tela "confirme seu email" (item 2)
4. Usuário clica no link do email → volta em /auth com sessão ativa
5. useEffect em /auth detecta sessão → checkEmailAllowed novamente (defesa)
    └─ ok → navega para nextPath (/dashboard)
6. _authenticated/route.tsx checa usuarios_perfil.grupo_id
    ├─ SEM grupo (primeiro do grupo) → /onboarding → cria grupo + matriz → vira admin (grupos.owner_id=user.id)
    └─ COM grupo → /dashboard direto
7. Usuários subsequentes (adicionados por admin em allowed_emails):
   fazem signup, NÃO passam por onboarding, precisam ser vinculados a empresa
   em Configurações → Acessos (usuarios_empresas)
```

### 4. Checagens necessárias no Supabase Dashboard (fora do código)
Não posso alterar isso via código — precisa ser feito no dashboard do Supabase externo:
- **Authentication → URL Configuration → Redirect URLs**: adicionar `https://dre.rotadascarnes.com/**`, `https://meat-metrics.lovable.app/**` e a preview URL. **Sem isso o link do email quebra.**
- **Authentication → Providers → Email → Confirm email**: manter ON (mais seguro, allowlist é a barreira principal) OU desligar para MVP (login imediato após signup).
- **Authentication → SMTP**: o SMTP default do Supabase entrega ~3 emails/hora. Para produção configurar Resend/SendGrid. **Se não configurar, o link pode nem chegar** — outro sintoma de "não abre nada".
- **Site URL**: apontar para `https://dre.rotadascarnes.com`.

### 5. Melhorias na criação de usuários subsequentes (Configurações → Acessos)
Já existe a aba de Acessos e a tabela `allowed_emails`. Adicionar:
- Ao inserir um email na allowlist, **enviar convite** via `supabase.auth.admin.inviteUserByEmail(email)` numa server function admin (usa `supabaseAdmin`) — assim o usuário recebe email com link para definir senha, sem precisar clicar em "Cadastrar" sozinho.
- Após o usuário aceitar, permitir na mesma tela **vincular a empresas** (`usuarios_empresas`) — hoje esse vínculo não tem UI.

---

## Arquivos afetados

- `src/components/auth/LoginSignupForm.tsx` — Toaster local, alerta inline persistente, tela pós-signup com reenvio, tratamento de erros extras.
- `src/routes/auth.tsx` (verificar / adicionar Toaster de segurança).
- `src/lib/auth-allowlist.functions.ts` — adicionar `inviteUser` (server function admin).
- `src/components/settings/AccessTab.tsx` — botão "Enviar convite" ao adicionar email + UI de vinculação a empresas.

## Fora do escopo desta iteração
- Alterações no dashboard do Supabase (item 4) — instruções passadas ao usuário.
- Custom SMTP.

---

## Perguntas antes de implementar

1. **Confirmação de email**: manter ON (mais seguro, exige clicar no link) ou desligar (login imediato após cadastro, mais rápido para MVP)?
2. **Convite automático** ao adicionar email em Acessos: implementar agora (`inviteUserByEmail` via admin) ou deixar o próprio usuário se cadastrar via `/auth`?
3. **UI de vincular usuário a empresas** em Configurações → Acessos: entra nesta iteração?