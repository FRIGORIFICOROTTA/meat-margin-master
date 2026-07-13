## Diagnóstico

Ao trocar de empresa ou período, alguma das páginas (`/dashboard`, `/dre`, `/despesas`, `/fiscal`, `/estoque`) estava lançando exceção em render/query e caindo no error boundary da raiz — por isso aparecia "Esta página não carregou" para tudo. Não tínhamos rastro do erro capturado (console/rede vazios) porque:

- As rotas filhas autenticadas não definiram `errorComponent`, então qualquer exceção subia até `__root.tsx` e não era logada com contexto.
- O layout autenticado (`_authenticated/route.tsx`) também não tinha `errorComponent`, então erros no próprio cabeçalho/empresas caíam no fallback global.
- Vários `useQuery` ignoravam `error` do Supabase (`const { data } = await …`) — se desse 401/403/RLS, `data` ficava `null` e o render seguia para `Number(undefined)`.
- Requisição vista: `POST /auth/v1/token?grant_type=refresh_token → 400 refresh_token_not_found`. Sessão expirada não era tratada corretamente e derrubava as queries.

## Objetivo
Deixar o app resiliente à troca de empresa/período: nenhuma página deve mais derrubar o app inteiro, e o erro real precisa aparecer em log/toast para sabermos a causa raiz se voltar a ocorrer.

## Passos implementados

1. **Error boundary por rota autenticada**  
   Adicionar `errorComponent` em `dashboard.tsx`, `dre.tsx`, `despesas.tsx`, `fiscal.tsx`, `estoque.tsx`, `configuracoes.tsx`, `importar.tsx`, `onboarding.tsx`. Ele:
   - Mostra card "Não foi possível carregar esta página" com botão *Tentar novamente* (chama `router.invalidate()` + `reset()`).
   - Loga o erro com `console.error` e `reportLovableError` para termos rastro.
   - Mantém o header (empresas/período) funcionando — apenas o conteúdo da página é substituído.

2. **Error boundary no layout autenticado**  
   Adicionar `errorComponent` em `_authenticated/route.tsx` e tratamento explícito de `empresasQ.error` dentro de `AuthLayout`, para que erros no carregamento das empresas não caiam no fallback global.

3. **Fallback global com mensagem real**  
   Configurar `defaultErrorComponent` no `router.tsx` para que, se alguma rota sem boundary quebrar, o usuário veja a mensagem de erro real e possa tentar novamente.

4. **Sessão expirada → redirect suave para `/auth`**  
   Em `_authenticated/route.tsx`, escutar `onAuthStateChange` para `SIGNED_OUT`/refresh falho e redirecionar para `/auth` sem quebrar. Detectar erro "refresh_token" nos queries e disparar `supabase.auth.signOut()` seguido de redirect.

5. **Queries defensivas**  
   Em cada `queryFn` das páginas de dashboard/dre/despesas/fiscal/estoque:
   - Passar a lançar quando `error` do Supabase vier (para o error boundary pegar com mensagem real, em vez de render quebrar em `Number(undefined)`).
   - Guardar acessos a campos numéricos com `Number(x ?? 0)` onde ainda faltar.
   - Em `dre.tsx`, garantir que `lancamentos` sempre exista (o early-return em `!dre` retorna sem `lancamentos`, e o destructuring depois pode ser `undefined`).

## Validação
- Build passou sem erros.
- Teste visual no preview depende de login ativo (autenticação externa não gerenciada; não é possível injetar sessão automaticamente). Solicitar ao usuário que faça login e tente trocar empresa/período novamente; se aparecer algum card de erro, a mensagem real será visível e poderá ser corrigida.

## Fora do escopo
- Não vou reescrever lógica de negócio (fiscal, DRE, memorial). Só blindagem de erro e defensivas.
- Não vou mexer em RLS / migrations agora — se aparecer erro de permissão, ele vai virar visível para decidirmos juntos.
