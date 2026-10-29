# MusicControl 2.0 — instalação

## Antes
- Faça commit/backup do projeto e preserve o arquivo `.env.local` (não o envie).
- **Não apague dados do navegador**: músicas e playlists continuam no IndexedDB.

## Atualizar no Codespaces
1. Extraia o ZIP no computador.
2. Copie a pasta `src` do ZIP para `app/src` (mesclando e substituindo arquivos), copie `public/favicon.svg` para `app/public/favicon.svg` e substitua `app/index.html`.
3. No terminal:

```bash
cd /workspaces/musiccontrol/app
npm install gsap lenis three
npm install -D @types/three
npm run build
npm run dev
```

4. Teste login, biblioteca, importação, reprodução e playlists antes de publicar.
5. Publique:

```bash
cd /workspaces/musiccontrol
git add app/src app/public/favicon.svg app/index.html app/package.json app/package-lock.json
git commit -m "MusicControl 2.0 - rebranding e animacoes"
git push
```

## Escopo
- Identidade visual unificada entre login e app; favicon; hero renovado.
- Three.js, GSAP ScrollTrigger e Lenis carregados dinamicamente na página inicial em desktop; fallback CSS em celular, WebGL indisponível e movimento reduzido.
- Preserva autenticação e banco de dados existentes; não altera o armazenamento local.
- A função Supabase `admin-create-user` precisa existir e validar o papel admin no servidor; a interface sozinha não garante segurança.
- O efeito ScrollTrigger depende do contêiner de rolagem real; ajuste se o layout mudar.
