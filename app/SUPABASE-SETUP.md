# MusicControl 1.6.1 — preparação do servidor

1. Crie um projeto no Supabase.
2. No SQL Editor, execute `supabase/schema.sql` **uma única vez** em um projeto novo.
3. Em Authentication, habilite Email/Password e configure URLs permitidas de redirecionamento.
4. O bucket `music-files` é privado; cada arquivo deverá usar o caminho `<user_id>/<uuid>.<ext>`.
5. Configure as variáveis públicas `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` **somente depois** de integrar o cliente Supabase. Nunca coloque a `service_role` no frontend.
6. A aplicação ainda usa IndexedDB. Cadastro/login/upload na nuvem **não estão conectados** nesta entrega. Não remova dados locais.
7. Antes de sincronizar, implemente migração opt-in com confirmação, progresso, detecção de duplicados e recuperação de falhas.
8. Revise limites, custos, direitos de uso e políticas de retenção dos arquivos.
