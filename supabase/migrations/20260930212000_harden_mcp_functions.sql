revoke execute on function public.mcp_consume_rate_limit(uuid,text,text,text,integer,integer) from public, anon, authenticated;
revoke execute on function public.mcp_create_note_idempotent(uuid,text,text,text,timestamptz,text,text) from public, anon, authenticated;
revoke execute on function public.mcp_update_note(uuid,text,uuid,timestamptz,text,boolean,text,boolean,text,text) from public, anon, authenticated;
revoke execute on function public.mcp_archive_note(uuid,text,uuid,timestamptz,text,text) from public, anon, authenticated;
revoke execute on function public.mcp_restore_note(uuid,text,uuid,timestamptz,text,text) from public, anon, authenticated;
revoke execute on function public.mcp_exchange_authorization_code(text,text,text,text,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke execute on function public.mcp_rotate_refresh_token(text,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;

create or replace function public.mcp_rotate_refresh_token(
  p_refresh_token_hash text,p_client_id text,p_new_access_token_hash text,p_new_refresh_token_hash text,
  p_access_expires_at timestamptz,p_refresh_expires_at timestamptz
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare old public.mcp_oauth_refresh_tokens%rowtype;
begin
  select * into old from public.mcp_oauth_refresh_tokens where token_hash=p_refresh_token_hash for update;
  if not found or old.revoked_at is not null or old.rotated_at is not null or old.expires_at<=now() or old.client_id<>p_client_id then raise exception 'INVALID_GRANT'; end if;
  if exists (select 1 from public.mcp_oauth_grants where user_id=old.user_id and client_id=old.client_id and revoked_at is not null) then raise exception 'INVALID_GRANT'; end if;
  update public.mcp_oauth_refresh_tokens set rotated_at=now(),replaced_by_hash=p_new_refresh_token_hash where token_hash=p_refresh_token_hash;
  insert into public.mcp_oauth_tokens(token_hash,client_id,user_id,scopes,resource,expires_at) values(p_new_access_token_hash,old.client_id,old.user_id,old.scopes,old.resource,p_access_expires_at);
  insert into public.mcp_oauth_refresh_tokens(token_hash,client_id,user_id,scopes,resource,expires_at) values(p_new_refresh_token_hash,old.client_id,old.user_id,old.scopes,old.resource,p_refresh_expires_at);
  return jsonb_build_object('user_id',old.user_id,'client_id',old.client_id,'scopes',old.scopes,'resource',old.resource);
end;
$$;

grant execute on function public.mcp_consume_rate_limit(uuid,text,text,text,integer,integer) to service_role;
grant execute on function public.mcp_create_note_idempotent(uuid,text,text,text,timestamptz,text,text) to service_role;
grant execute on function public.mcp_update_note(uuid,text,uuid,timestamptz,text,boolean,text,boolean,text,text) to service_role;
grant execute on function public.mcp_archive_note(uuid,text,uuid,timestamptz,text,text) to service_role;
grant execute on function public.mcp_restore_note(uuid,text,uuid,timestamptz,text,text) to service_role;
grant execute on function public.mcp_exchange_authorization_code(text,text,text,text,text,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.mcp_rotate_refresh_token(text,text,text,text,timestamptz,timestamptz) to service_role;