# MusicControl 3.0 — Pink Neon

## Instalação

1. Faça um backup do projeto atual no GitHub.
2. Extraia o ZIP e copie `src/`, `public/` e `index.html` para `/workspaces/musiccontrol/app`, mesclando e substituindo os arquivos de mesmo nome. **Não apague a pasta `src` existente.**
3. Mantenha seu `app/.env.local` e a configuração do Supabase; nunca compartilhe segredos.
4. No terminal do Codespaces:

```bash
cd /workspaces/musiccontrol/app
npm install
npm run build
npm run dev
```

5. Teste login, edição de perfil, biblioteca, importação, reprodução, playlists e scroll no desktop e no celular antes de publicar.
6. Depois de validar: `cd /workspaces/musiccontrol && git add app && git commit -m "MusicControl 3.0 Pink Neon" && git push`.

## O que mudou

- Identidade Pink Neon em login, menu, página inicial, biblioteca, playlists, player e perfil.
- Nova seção **Entre no seu som** com acesso rápido às primeiras faixas da biblioteca, quando houver músicas.
- Nova marcação de versão 3.0, favicon pink, materiais 3D atualizados para pink.
- Rolagem nativa preservada; WebGL permanece opcional e não é carregado em telas pequenas.

## O que foi preservado

- Supabase Auth e painel de perfil da 2.1.
- Banco IndexedDB existente (`musiccontrol-library`), sem migração nem limpeza.
- Importação, reprodução, metadados, capas, artistas e playlists.

**Importante:** este ZIP é uma atualização da interface e NÃO adiciona catálogo de Spotify/Deezer, streaming licenciado, sincronização de MP3 na nuvem ou recursos que dependam de novos serviços. Não execute scripts de limpeza de dados do navegador.
