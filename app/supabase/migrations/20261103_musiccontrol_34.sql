-- MusicControl 3.4 — execute no SQL Editor do Supabase antes de usar a aba Nuvem.
-- Sem dados de música públicos. Os arquivos pertencem exclusivamente ao usuário autenticado.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create or replace function public.mc_new_user_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,role) values (new.id,'user')
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists mc_create_profile on auth.users;
create trigger mc_create_profile after insert on auth.users
for each row execute function public.mc_new_user_profile();
insert into public.profiles(id,role)
select id,'user' from auth.users on conflict (id) do nothing;

create table if not exists public.cloud_songs (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  artist text not null,
  album text,
  file_path text not null,
  cover_path text,
  file_size bigint not null default 0,
  mime_type text not null default 'audio/mpeg',
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id,user_id)
);
create index if not exists cloud_songs_user_id_idx on public.cloud_songs(user_id);
alter table public.cloud_songs enable row level security;
drop policy if exists "Owner reads cloud songs" on public.cloud_songs;
drop policy if exists "Owner inserts cloud songs" on public.cloud_songs;
drop policy if exists "Owner updates cloud songs" on public.cloud_songs;
drop policy if exists "Owner deletes cloud songs" on public.cloud_songs;
create policy "Owner reads cloud songs" on public.cloud_songs for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Owner inserts cloud songs" on public.cloud_songs for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Owner updates cloud songs" on public.cloud_songs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owner deletes cloud songs" on public.cloud_songs for delete to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.cloud_playlists (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  song_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (id,user_id),
  constraint cloud_playlists_song_ids_array check (jsonb_typeof(song_ids) = 'array')
);
alter table public.cloud_playlists enable row level security;
drop policy if exists "Owner reads cloud playlists" on public.cloud_playlists;
drop policy if exists "Owner inserts cloud playlists" on public.cloud_playlists;
drop policy if exists "Owner updates cloud playlists" on public.cloud_playlists;
drop policy if exists "Owner deletes cloud playlists" on public.cloud_playlists;
create policy "Owner reads cloud playlists" on public.cloud_playlists for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Owner inserts cloud playlists" on public.cloud_playlists for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Owner updates cloud playlists" on public.cloud_playlists for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owner deletes cloud playlists" on public.cloud_playlists for delete to authenticated
  using (user_id = (select auth.uid()));

-- Os objetos permanecem PRIVADOS. Não use getPublicUrl para arquivos de música.
insert into storage.buckets(id,name,public,file_size_limit)
values ('music-files','music-files',false,52428800)
on conflict(id) do update set public=false,file_size_limit=52428800;

drop policy if exists "Owner reads music files" on storage.objects;
drop policy if exists "Owner inserts music files" on storage.objects;
drop policy if exists "Owner updates music files" on storage.objects;
drop policy if exists "Owner deletes music files" on storage.objects;
create policy "Owner reads music files" on storage.objects for select to authenticated
  using (bucket_id = 'music-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owner inserts music files" on storage.objects for insert to authenticated
  with check (bucket_id = 'music-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owner updates music files" on storage.objects for update to authenticated
  using (bucket_id = 'music-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'music-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owner deletes music files" on storage.objects for delete to authenticated
  using (bucket_id = 'music-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
