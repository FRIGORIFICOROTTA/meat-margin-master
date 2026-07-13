## Diagnóstico

Ao trocar de empresa ou período, alguma das páginas (`/dashboard`, `/dre`, `/despesas`, `/fiscal`, `/estoque`) está lançando exceção em render/query e caindo no error boundary da raiz — por isso aparece "Esta página não carregou" para tudo. Não temos rastro do erro capturado (console/rede vazios) porque:

- Nenhuma rota autenticada define `errorComponent`, então qualquer exceção sobe até `__root.tsx` e não é logada com contexto.
- Vários `useQuery` ignoram `error` do Supabase (`const { data } = await …`) — se der 401/403/RLS, `data` fica `null` e o render segue pra `Number(dre.total_vendas)` etc.
- Requisição vista: `POST /auth/v1/token?grant_type=refresh_token → 400 refresh_token_not_found`. Sessão expirada não sendo tratada corretamente também derruba as queries.

## Objetivo
Deixar o app resiliente à troca de empresa/período: nenhuma página deve mais derrubar o app inteiro, e o erro real precisa aparecer em log/toast pra sabermos causa raiz se voltar a ocorrer.

## Passos

1. **Error boundary por rota autenticada**  
   Adicionar `errorComponent` em `dashboard.tsx`, `dre.tsx`, `despesas.tsx`, `fiscal.tsx`, `estoque.tsx`, `configuracoes.tsx`, `importar.tsx`. Ele:
   - Mostra card "Não foi possível carregar esta página" com botão *Tentar novamente* (chama `router.invalidate()` + `reset()`).
   - Loga o erro com `console.error` e `reportLovableError` para termos rastro.
   - Mantém o header (empresas/período) funcionando — apenas o conteúdo da página é substituído.

2. **Sessão expirada → redirect suave para `/auth`**  
   Em `_authenticated/route.tsx`, escutar `onAuthStateChange` para `SIGNED_OUT`/refresh falho e redirecionar para `/auth` sem quebrar. Detectar erro "refresh_token" nos queries e disparar `supabase.auth.signOut()` seguido de redirect.

3. **Queries defensivas**  
   Em cada `queryFn` das páginas de dashboard/dre/despesas/fiscal/estoque:
   - Passar a lançar quando `error` do Supabase vier (para o error boundary pegar com mensagem real, em vez de render quebrar em `Number(undefined)`).
   - Guardar acessos a campos numéricos com `Number(x ?? 0)` onde ainda faltar.
   - Em `dre.tsx`, garantir que `lancamentos` sempre exista (hoje o early-return em `!dre` retorna sem `lancamentos`, e o destructuring depois pode ser `undefined`).

4. **Reproduzir no preview com Playwright** trocando empresa/mês/ano em cada página e capturando screenshots + console pra confirmar que:
   - Nenhuma página cai no fallback global de novo.
   - Se houver erro real (RLS, dado inconsistente), aparece o card por página com o motivo, e o header continua utilizável.

## Fora do escopo
- Não vou reescrever lógica de negócio (fiscal, DRE, memorial). Só blindagem de erro e defensivas.
- Não vou mexer em RLS / migrations agora — se aparecer erro de permissão, ele vai virar visível pra decidirmos juntos.
