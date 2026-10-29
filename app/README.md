# MusicControl 1.6.0 — Etapa 1: estabilização

Base: redesign 1.5 do MusicControl, preservando o armazenamento IndexedDB `musiccontrol-library` (versão de esquema 1).

## Iniciar

```bash
npm install
npm run build
npm run dev
```

## Importante para quem já usa MusicControl

- Faça um commit/backup antes de atualizar.
- O conteúdo da biblioteca fica no **IndexedDB do navegador**, não no ZIP nem no GitHub.
- **Não limpe os dados do site** e mantenha a mesma origem (domínio e porta) se quiser acessar os arquivos já importados.
- Se a origem mudar, os arquivos antigos não serão migrados automaticamente.
- Este ZIP é um projeto Vite completo, mas a compatibilidade com sua configuração real no Codespaces deve ser validada.

## Checklist manual de estabilização

1. Abrir o site e confirmar carregamento sem erros no console.
2. Importar um MP3 e reproduzi-lo, pausar, avançar e retroceder.
3. Recarregar a página e confirmar que o áudio e metadados continuam na biblioteca.
4. Criar playlist, adicionar e remover música, recarregar e confirmar persistência.
5. Editar título, artista, álbum e capa; recarregar e confirmar alterações.
6. Verificar busca, artistas, modal com Escape e foco visível.
7. Testar navegação em celular e desktop.
8. Verificar estados sem músicas e mensagens de erro de armazenamento.

## Próximas entregas

- 1.6.1: Biblioteca 2.0
- 1.6.2: Player avançado
- 1.6.3: Playlists 2.0
- 1.6.4: PWA

Não há migração de banco de dados nesta etapa.
