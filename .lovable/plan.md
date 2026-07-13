## Objetivo

Na aba **Configurações → Acessos**, o admin (dono do grupo) poderá ver todos os usuários já vinculados ao seu grupo e alterar o papel deles entre:
- **admin_grupo** — acesso total, inclusive gerenciar acessos
- **gestor_empresa** — operador (padrão dos convidados)
- **visualizador** — somente leitura

## Mudanças

### 1. Banco (migração)

- Nova função `public.list_grupo_usuarios()` (SECURITY DEFINER) — retorna, para o grupo do admin autenticado, a lista de `{ user_id, nome, email, papel, created_at }` juntando `usuarios_perfil` + `auth.users` (email). Só executa se `auth.uid()` for owner de algum grupo.
- Nova função `public.update_usuario_papel(_user_id uuid, _papel papel_usuario)` (SECURITY DEFINER) — muda o papel de um usuário, validando que:
  - o chamador é owner do grupo do usuário-alvo
  - o alvo pertence ao mesmo grupo
  - o alvo não é o próprio owner (não pode se rebaixar via essa tela)
- `GRANT EXECUTE ... TO authenticated` nas duas.

### 2. Server functions (`src/lib/auth-allowlist.functions.ts` ou novo `users.functions.ts`)

- `listGrupoUsuarios` — chama a RPC acima via `requireSupabaseAuth`.
- `updateUsuarioPapel({ user_id, papel })` — idem.

### 3. UI (`src/components/settings/AccessTab.tsx`)

Adicionar, abaixo da tabela atual de emails autorizados, um bloco **"Usuários vinculados"** com:
- Tabela: Nome · Email · Papel (Select editável) · Vinculado em
- Ao trocar o Select, chama `updateUsuarioPapel` e mostra toast.
- O próprio admin aparece marcado como "Dono" e o Select fica desabilitado.

## Fora do escopo

- Remover usuário do grupo (só mudar papel por enquanto).
- Editar nome/email do usuário.
- Convidado escolher empresas específicas — continua vinculando todas do grupo.

## Detalhes técnicos

Enum existente `papel_usuario`: `admin_grupo`, `gestor_empresa`, `visualizador`. Owner do grupo é identificado por `grupos.owner_id = auth.uid()`. A leitura de email vem de `auth.users` (por isso as duas funções são `SECURITY DEFINER` com `search_path` fixo).
