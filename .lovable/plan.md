## Problema

Hoje `allowed_emails` só libera o login. Quando um convidado (ex: `alysonhbatista@gmail.com`) entra pela 1ª vez, ele não tem `usuarios_perfil` nem `usuarios_empresas` → o gate do onboarding manda ele criar um novo grupo em vez de entrar no grupo que o convidou.

## Solução

Ao autorizar um email, o sistema já sabe qual grupo é (o do admin que autorizou). No 1º login desse convidado, vamos criar automaticamente:
- `usuarios_perfil` com `papel = 'colaborador'` e `grupo_id` do admin que autorizou
- `usuarios_empresas` para **todas** as empresas ativas desse grupo

Assim ele cai direto no dashboard vendo Formosa + Planaltina.

## Passos

### 1. Migração no Supabase

- Garantir que `allowed_emails.added_by` (uuid do admin) esteja preenchido — já está no seu caso.
- Criar função `public.link_invited_user()` (SECURITY DEFINER) que:
  1. Recebe o `user_id` autenticado atual (`auth.uid()`) e o email do JWT.
  2. Procura em `allowed_emails` pelo email (case-insensitive).
  3. Se achar e `added_by` existir, pega o `grupo_id` do owner e:
     - Faz `INSERT ... ON CONFLICT DO NOTHING` em `usuarios_perfil` (`papel='colaborador'`, `nome` = do metadata do Google se houver, senão email).
     - Faz `INSERT ... ON CONFLICT DO NOTHING` em `usuarios_empresas` para toda empresa ativa (`deleted_at IS NULL`) do grupo.
  4. Retorna `{ grupo_id, empresas_vinculadas }` ou `null` se não houver convite.
- Grants: `EXECUTE ... TO authenticated`.

### 2. Onboarding gate

No `src/routes/_authenticated/onboarding.tsx`, dentro do `useEffect` de gate, ANTES de decidir mostrar o formulário:
- Chamar `supabase.rpc('link_invited_user')`.
- Se retornar dados (foi vinculado), setar `empresaSelecionada` na primeira empresa retornada e `router.navigate({ to: '/dashboard' })`.
- Se retornar null, continuar com a lógica atual (perfil? → dashboard; senão → mostra form de criar grupo).

Isso resolve para novos convidados sem precisar mudar o fluxo de auth global.

### 3. Corrigir Alyson agora (dados existentes)

Rodar um insert manual para vincular `alysonhbatista@gmail.com` (`2a9432c9-…`) ao grupo `Grupo Rota das Carnes` (`529fa05a-…`):
- `usuarios_perfil`: nome "Alyson Batista", papel `colaborador`, grupo_id do grupo Rota
- `usuarios_empresas`: linhas para Formosa (`e987a555…`) e Planaltina (`d5759116…`)

Depois disso ela consegue fazer logout/login e cair direto no dashboard.

### 4. UX opcional (não vou fazer agora, só sinalizando)

O `AccessTab` mostra a lista de emails autorizados mas não indica se cada um já se cadastrou/vinculou. Se você quiser, num próximo passo posso adicionar uma coluna "Status: pendente / vinculado".

## Decisões pendentes

Nenhuma — respostas já coletadas (todas empresas do grupo + papel `colaborador`).
