## Causa do erro

O onboarding falha com HTTP 409 na criação da empresa:

```
duplicate key value violates unique constraint "empresas_cnpj_key"
CNPJ 63667080000153 → já pertence à empresa "Nova Rota Ltda - Formosa"
                      no grupo antigo "Grupo Rota das Carnes" (529fa05a…)
```

Esse CNPJ (e o 63667080000234 da Planaltina) já foi cadastrado em uma tentativa anterior. Como o `cnpj` da tabela `empresas` tem constraint UNIQUE global, qualquer novo onboarding com o mesmo CNPJ estoura 409.

Efeitos colaterais que também precisam ser resolvidos:
- Cada clique em "Concluir setup" cria um `grupos` novo antes de falhar → hoje há 3 grupos órfãos "Grupo Rotta" sem empresa nem perfil vinculado.
- A mensagem no toast só diz "Erro ao criar grupo/empresa", sem mostrar o motivo real (CNPJ duplicado).

## O que fazer

### 1. Limpar o estado sujo do banco
- Apagar os 3 grupos órfãos criados hoje (`7f4f399f…`, `9fc51a9e…`, `f799cb6e…`) — nenhum tem empresa/perfil vinculado.
- Decidir o que fazer com o grupo antigo "Grupo Rota das Carnes" (`529fa05a…`) que já contém as empresas Formosa + Planaltina do mesmo owner. Duas opções:
  - **(A) Reaproveitar**: renomear para "Grupo Rotta", criar `usuarios_perfil` do owner apontando pra ele, e mandar direto para `/dashboard`. Não precisa refazer onboarding.
  - **(B) Recomeçar do zero**: apagar as empresas antigas + o grupo antigo, e deixar o onboarding rodar limpo.

### 2. Corrigir o formulário de onboarding
- **Remover o campo "Regime de DRE"** conforme pedido. A tabela `empresas.regime_tributario` já tem default `'gerencial'`, e as duas visões (Gerencial e Lucro Real) ficam disponíveis por padrão no DRE.
- Melhorar a mensagem de erro: detectar código Postgres `23505` no CNPJ e mostrar "Já existe uma empresa cadastrada com este CNPJ. Peça acesso ao administrador ou use outro CNPJ."
- Envolver as 4 operações (grupo → perfil → empresa → vínculo) de forma que, se qualquer passo posterior falhar, **o grupo recém-criado seja apagado** — evita voltar a gerar órfãos.
- Trim/normalização do CNPJ (só dígitos) antes de enviar, pra evitar duplicatas por formatação.

### 3. Onboarding para o segundo usuário
O onboarding só deveria rodar para quem cria o grupo. O segundo usuário (adicionado via Configurações → Acessos) já entra via convite e não deve ver a tela de onboarding — ele deve ser mandado para `/dashboard` (ou uma tela "aguardando vínculo de empresa" se ainda não tiver `usuarios_empresas`). Esse gate precisa existir no `_authenticated/route.tsx` ou no próprio `onboarding.tsx` (checar se já existe `usuarios_perfil` para o user → se sim, redirecionar).

## Decisões pendentes (preciso da sua resposta)

1. **Grupo antigo "Grupo Rota das Carnes" com as empresas Formosa + Planaltina já cadastradas**: reaproveitar (opção A) ou apagar tudo e recomeçar (opção B)?
2. Confirmação: quero remover totalmente o campo "Regime de DRE" do onboarding e deixar o default `gerencial` no banco, certo?

## Detalhes técnicos

Arquivos afetados:
- `src/routes/_authenticated/onboarding.tsx` — remover campo Select de regime, adicionar tratamento de erro `23505`, adicionar rollback do grupo criado, normalizar CNPJ, checar se usuário já tem perfil e pular onboarding.
- Migração SQL — limpar grupos órfãos (e, se opção B, também empresas + grupo antigo).
- (opcional) `src/routes/_authenticated/route.tsx` ou loader do onboarding — redirecionar quem já tem `usuarios_perfil` diretamente para `/dashboard`.

Nenhuma mudança de schema é necessária — a constraint UNIQUE no `cnpj` faz sentido e deve continuar.
