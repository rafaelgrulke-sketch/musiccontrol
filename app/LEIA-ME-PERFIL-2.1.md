# MusicControl 2.1 — Área do usuário

## Instalação
1. Faça backup do projeto atual.
2. Copie `src`, `public` e `index.html` deste pacote para dentro de `/workspaces/musiccontrol/app`, mesclando as pastas (não apague `.env.local`).
3. Execute o SQL `CONFIGURAR-FOTO-PERFIL.sql` no Supabase → SQL Editor. O bucket privado `profile-avatars` e as políticas RLS permitem acesso apenas à foto do próprio usuário.
4. No Supabase → Authentication → URL Configuration, confira Site URL e Redirect URLs de produção. Para mudança de e-mail, o Supabase pode enviar confirmação para os dois endereços, conforme configuração do projeto.
5. Execute `npm run build` e `npm run dev` e teste: foto, nome, e-mail, senha, logout, cadastro admin e player.
6. Só publique depois de validar. Não envie chaves secretas nem o `.env.local`.

## Como funciona
- Foto: JPG/PNG/WebP até 2 MB, em bucket privado com URL assinada temporária. Foto pode precisar ser recarregada após expirar a URL.
- Nome: Supabase Auth `user_metadata.full_name`, sem alterar a tabela `profiles` (que mantém `role`).
- E-mail e senha: `supabase.auth.updateUser`; não são salvos em tabelas próprias.
- Troca de e-mail pode exigir confirmação. Troca de senha pode exigir reautenticação se o projeto ativou proteção de sessão recente.
- O botão do usuário substitui o círculo MC na barra superior. Administradores continuam podendo cadastrar usuários pelo painel de perfil.
- Não altera músicas e playlists no IndexedDB.
