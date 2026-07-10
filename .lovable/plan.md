# Redesign da tela de login — Premium Noir Finance

Aplicar a direção "Premium noir finance" na `LoginSignupForm`, usando a **imagem real do logo Rota das Carnes** como marca d'água no fundo (não o SVG de touro genérico do protótipo).

## Mudanças

**`src/components/auth/LoginSignupForm.tsx`** (reescrita da tela):
- Remover o layout de duas colunas atual (painel escuro com logo em card + card branco à direita).
- Novo layout: fundo `#050505` full-screen, formulário único centralizado (`max-w-[400px]`), sem card branco.
- **Marca d'água**: `<img>` do `logo-rota.png` centralizado, largura ~800px, `opacity-[0.04]`, `mix-blend-luminosity` para descolorir levemente, `pointer-events-none`, `select-none`.
- Glow radial vermelho discreto (`bg-[#c8102e] blur-[160px] opacity-[0.04]`) atrás do formulário.
- Header: wordmark "ROTA DAS CARNES" tipografado (não a imagem em card) + subtítulo "DRE Inteligente".
- Toggle pill Entrar/Cadastrar em `rounded-full`.
- Inputs `bg-zinc-900/40` com foco vermelho, labels uppercase tracking-wider.
- Botão primário vermelho `#c8102e` com sombra glow.
- Divider "OU CONTINUE COM" + botão Google outline (mantém condicional em `googleEnabled`).
- Rodapé: pill "Acesso Restrito" + texto discreto (substitui o alerta grande atual).

**Preservado**:
- Lógica de allowlist (`checkEmailAllowed`), signup, signIn, Google OAuth condicional, toast de erro pós-callback, toggle mostrar senha, link "Esqueceu?".
- Rota `/auth`, `/definir-senha`.

**Fora de escopo**:
- Não muda tokens de `src/styles.css` (paleta vermelho+preto já está aplicada).
- Não muda watermark do sistema autenticado nem do PDF.
- Não muda backend / allowlist / OAuth.

## Detalhes técnicos

- Importar `logoRota` de `@/assets/logo-rota.png.asset.json` e usar `logoRota.url` no `<img>` de watermark.
- Fonte Inter já disponível via projeto; se necessário, garantir peso 700 no `__root.tsx`.
- Manter todos os handlers (`handleSignIn`, `handleSignUp`, `handleGoogleLogin`, `useEffect` do allowlist pós-OAuth) exatamente como estão — só troca JSX/estilos.
