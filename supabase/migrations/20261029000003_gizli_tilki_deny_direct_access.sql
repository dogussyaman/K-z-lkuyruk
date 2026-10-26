-- Defense in depth: direct table reads/writes remain denied even if grants change later.
revoke all on public.gizli_tilki_sessions, public.gizli_tilki_private_roles,
  public.gizli_tilki_actions, public.gizli_tilki_votes from public, anon, authenticated;

do $policies$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gizli_tilki_sessions' and policyname='gizli_tilki_sessions_deny_client_access') then
    create policy gizli_tilki_sessions_deny_client_access on public.gizli_tilki_sessions
      for all to anon, authenticated using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gizli_tilki_private_roles' and policyname='gizli_tilki_private_roles_deny_client_access') then
    create policy gizli_tilki_private_roles_deny_client_access on public.gizli_tilki_private_roles
      for all to anon, authenticated using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gizli_tilki_actions' and policyname='gizli_tilki_actions_deny_client_access') then
    create policy gizli_tilki_actions_deny_client_access on public.gizli_tilki_actions
      for all to anon, authenticated using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gizli_tilki_votes' and policyname='gizli_tilki_votes_deny_client_access') then
    create policy gizli_tilki_votes_deny_client_access on public.gizli_tilki_votes
      for all to anon, authenticated using (false) with check (false);
  end if;
end
$policies$;
