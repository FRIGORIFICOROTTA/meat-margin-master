## Objetivo
Deixar o SEO do sistema validado e "OK" para que ele apareça em buscas no navegador (Google/Bing) quando pesquisado.

## Contexto
- O app é um sistema privado de gestão (DRE Rota das Carnes) — todas as rotas úteis ficam atrás de login (`/_authenticated/*`).
- Domínio ativo: `https://dre.rotadascarnes.com`.
- `__root.tsx` já tem title, description, Open Graph e Twitter Card configurados.
- Não existe `robots.txt` nem `sitemap.xml` no projeto ainda.

## Passos

1. **Rodar scan de SEO** no projeto (`seo_chat--trigger_scan`) e ler os achados (`seo_chat--list_findings`) para saber exatamente o que o scanner considera pendente.

2. **Criar `public/robots.txt`** permitindo indexação da home/login e apontando para o sitemap:
   ```
   User-agent: *
   Allow: /
   Disallow: /_authenticated/
   Sitemap: https://dre.rotadascarnes.com/sitemap.xml
   ```

3. **Criar sitemap dinâmico** em `src/routes/sitemap[.]xml.ts` com as rotas públicas (`/`, `/auth`) usando `BASE_URL = "https://dre.rotadascarnes.com"`. Rotas autenticadas ficam fora (não devem ser indexadas).

4. **Adicionar canonical + og:url** na rota `/auth` (única rota pública além da home) via `head()` — o `__root.tsx` já cobre o resto.

5. **Adicionar JSON-LD do tipo Organization** em `__root.tsx` (nome, URL, logo) para melhorar como o Google exibe o resultado.

6. **Corrigir findings restantes** que o scanner reportar (ex.: ajustes de title/description) e marcá-los como fixed com `seo_chat--update_findings`.

7. **Orientar publicação**: mudanças de SEO só ficam visíveis para o Google após republicar o app; depois, submeter a URL no Google Search Console acelera a indexação (isso é passo manual seu, fora do Lovable).

## Fora do escopo
- Não vou expor rotas internas do sistema (dashboard, DRE, etc.) na busca — são privadas por natureza.
- Não vou criar landing page nova de marketing (só ajustar o SEO do que existe). Se quiser uma landing page pública descrevendo o produto para atrair buscas, me avise que planejo separado.
