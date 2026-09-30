create extension if not exists pgcrypto;

alter table public.documents
  add column if not exists provenance text not null default 'user_created';
alter table public.documents
  add constraint documents_provenance_check
  check (provenance in ('user_created','imported','system_derived','ai_derived'));

alter table public.documents
  add column if not exists search_vector tsvector
  generated always as (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(body,''))) stored;

create index if not exists documents_search_vector_gin_idx on public.documents using gin (search_vector);
create index if not exists documents_user_started_id_idx on public.documents(user_id, started_at desc, id desc);

create table if not exists public.mcp_oauth_clients (
  client_id text primary key,
  client_name text not null,
  redirect_uris text[] not null,
  grant_types text[] not null default array['authorization_code','refresh_token'],
  response_types text[] not null default array['code'],
  token_endpoint_auth_method text not null default 'none',
  client_metadata_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.mcp_oauth_authorization_requests (
  request_id uuid primary key default gen_random_uuid(),
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  redirect_uri text not null,
  user_id uuid references auth.users(id) on delete cascade,
  scopes text[] not null,
  resource text not null,
  code_challenge text not null,
  state text,
  csrf_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mcp_oauth_codes (
  code_hash text primary key,
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scopes text[] not null,
  resource text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.mcp_oauth_grants (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  scopes text[] not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,client_id)
);

create table if not exists public.mcp_oauth_tokens (
  token_hash text primary key,
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scopes text[] not null,
  resource text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.mcp_oauth_refresh_tokens (
  token_hash text primary key,
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scopes text[] not null,
  resource text not null,
  expires_at timestamptz not null,
  rotated_at timestamptz,
  replaced_by_hash text,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.mcp_idempotency (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  tool_name text not null,
  idempotency_key text not null,
  request_hash text not null,
  result_json jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  primary key(user_id,client_id,tool_name,idempotency_key)
);

create table if not exists public.mcp_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  tool_name text not null,
  action text not null check (action in ('READ','WRITE','DELETE')),
  window_start timestamptz not null,
  count integer not null default 0,
  primary key(user_id,client_id,tool_name,action,window_start)
);

create table if not exists public.mcp_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  request_id text not null,
  tool_name text not null,
  tool_version text not null,
  capability_group text not null,
  action text not null check (action in ('READ','WRITE','DELETE')),
  success boolean not null,
  error_code text,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists mcp_audit_events_created_idx on public.mcp_audit_events(created_at desc);
create index if not exists mcp_audit_events_tool_idx on public.mcp_audit_events(tool_name, created_at desc);

alter table public.mcp_oauth_clients enable row level security;
alter table public.mcp_oauth_authorization_requests enable row level security;
alter table public.mcp_oauth_codes enable row level security;
alter table public.mcp_oauth_grants enable row level security;
alter table public.mcp_oauth_tokens enable row level security;
alter table public.mcp_oauth_refresh_tokens enable row level security;
alter table public.mcp_idempotency enable row level security;
alter table public.mcp_rate_limits enable row level security;
alter table public.mcp_audit_events enable row level security;

revoke all on public.mcp_oauth_clients from anon, authenticated;
revoke all on public.mcp_oauth_authorization_requests from anon, authenticated;
revoke all on public.mcp_oauth_codes from anon, authenticated;
revoke all on public.mcp_oauth_grants from anon, authenticated;
revoke all on public.mcp_oauth_tokens from anon, authenticated;
revoke all on public.mcp_oauth_refresh_tokens from anon, authenticated;
revoke all on public.mcp_idempotency from anon, authenticated;
revoke all on public.mcp_rate_limits from anon, authenticated;
revoke all on public.mcp_audit_events from anon, authenticated;

create or replace function public.mcp_consume_rate_limit(
  p_user_id uuid,
  p_client_id text,
  p_tool text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
) returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := date_trunc('minute', now());
  v_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then raise exception 'VALIDATION_ERROR'; end if;
  insert into public.mcp_rate_limits(user_id,client_id,tool_name,action,window_start,count)
  values(p_user_id,p_client_id,p_tool,p_action,v_window,1)
  on conflict(user_id,client_id,tool_name,action,window_start)
  do update set count = public.mcp_rate_limits.count + 1
  returning count into v_count;
  return query select v_count <= p_limit, greatest(p_limit - v_count, 0), v_window + make_interval(secs => p_window_seconds);
end;
$$;

create or replace function public.mcp_create_note_idempotent(
  p_user_id uuid, p_client_id text, p_title text, p_body text, p_started_at timestamptz,
  p_idempotency_key text, p_request_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare existing public.mcp_idempotency%rowtype; created public.documents%rowtype;
begin
  insert into public.mcp_idempotency(user_id,client_id,tool_name,idempotency_key,request_hash)
  values(p_user_id,p_client_id,'create_note',p_idempotency_key,p_request_hash) on conflict do nothing;
  select * into existing from public.mcp_idempotency where user_id=p_user_id and client_id=p_client_id and tool_name='create_note' and idempotency_key=p_idempotency_key for update;
  if existing.request_hash <> p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  if existing.result_json is not null then return existing.result_json || jsonb_build_object('replay',true); end if;
  insert into public.documents(user_id,title,body,started_at,provenance) values(p_user_id,p_title,p_body,coalesce(p_started_at,now()),'user_created') returning * into created;
  insert into public.document_versions(document_id,version_number,title,body) values(created.id,1,created.title,created.body);
  update public.mcp_idempotency set result_json=jsonb_build_object('ok',true,'note',jsonb_build_object('id',created.id,'user_id',created.user_id,'title',created.title,'body',created.body,'started_at',created.started_at,'status',created.status,'created_at',created.created_at,'updated_at',created.updated_at,'archived_at',created.archived_at,'provenance',created.provenance))
  where user_id=p_user_id and client_id=p_client_id and tool_name='create_note' and idempotency_key=p_idempotency_key;
  return (select result_json from public.mcp_idempotency where user_id=p_user_id and client_id=p_client_id and tool_name='create_note' and idempotency_key=p_idempotency_key);
end;
$$;

create or replace function public.mcp_update_note(
  p_user_id uuid,p_client_id text,p_note_id uuid,p_expected_updated_at timestamptz,
  p_title text,p_has_title boolean,p_body text,p_has_body boolean,
  p_idempotency_key text,p_request_hash text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare existing public.mcp_idempotency%rowtype; current public.documents%rowtype; updated public.documents%rowtype; next_version integer;
begin
  insert into public.mcp_idempotency(user_id,client_id,tool_name,idempotency_key,request_hash)
  values(p_user_id,p_client_id,'update_note',p_idempotency_key,p_request_hash) on conflict do nothing;
  select * into existing from public.mcp_idempotency where user_id=p_user_id and client_id=p_client_id and tool_name='update_note' and idempotency_key=p_idempotency_key for update;
  if existing.request_hash <> p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  if existing.result_json is not null then return existing.result_json || jsonb_build_object('replay',true); end if;
  select * into current from public.documents where id=p_note_id and user_id=p_user_id for update;
  if not found or current.status <> 'active' then raise exception 'NOT_FOUND'; end if;
  if current.updated_at <> p_expected_updated_at then raise exception 'CONFLICT'; end if;
  update public.documents set title=case when p_has_title then p_title else title end, body=case when p_has_body then p_body else body end where id=p_note_id and user_id=p_user_id returning * into updated;
  if p_has_body and updated.body <> current.body then
    select coalesce(max(version_number),0)+1 into next_version from public.document_versions where document_id=p_note_id;
    insert into public.document_versions(document_id,version_number,title,body) values(p_note_id,next_version,updated.title,updated.body);
  end if;
  update public.mcp_idempotency set result_json=jsonb_build_object('ok',true,'note',jsonb_build_object('id',updated.id,'user_id',updated.user_id,'title',updated.title,'body',updated.body,'started_at',updated.started_at,'status',updated.status,'created_at',updated.created_at,'updated_at',updated.updated_at,'archived_at',updated.archived_at,'provenance',updated.provenance))
  where user_id=p_user_id and client_id=p_client_id and tool_name='update_note' and idempotency_key=p_idempotency_key;
  return (select result_json from public.mcp_idempotency where user_id=p_user_id and client_id=p_client_id and tool_name='update_note' and idempotency_key=p_idempotency_key);
end;
$$;

create or replace function public.mcp_archive_note(
  p_user_id uuid,p_client_id text,p_note_id uuid,p_expected_updated_at timestamptz,p_idempotency_key text,p_request_hash text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare existing public.mcp_idempotency%rowtype; current public.documents%rowtype; updated public.documents%rowtype;
begin
  insert into public.mcp_idempotency(user_id,client_id,tool_name,idempotency_key,request_hash)
  values(p_user_id,p_client_id,'delete_note',p_idempotency_key,p_request_hash) on conflict do nothing;
  select * into existing from public.mcp_idempotency where user_id=p_user_id and client_id=p_client_id and tool_name='delete_note' and idempotency_key=p_idempotency_key for update;
  if existing.request_hash <> p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  if existing.result_json is not null then return existing.result_json || jsonb_build_object('replay',true); end if;
  select * into current from public.documents where id=p_note_id and user_id=p_user_id for update;
  if not found or current.status <> 'active' then raise exception 'NOT_FOUND'; end if;
  if current.updated_at <> p_expected_updated_at then raise exception 'CONFLICT'; end if;
  update public.documents set status='archived',archived_at=now() where id=p_note_id and user_id=p_user_id returning * into updated;
  update public.mcp_idempotency set result_json=jsonb_build_object('ok',true,'note',jsonb_build_object('id',updated.id,'status',updated.status,'archived_at',updated.archived_at,'updated_at',updated.updated_at))
  where user_id=p_user_id and client_id=p_client_id and tool_name='delete_note' and idempotency_key=p_idempotency_key;
  return (select result_json from public.mcp_idempotency where user_id=p_user_id and client_id=p_client_id and tool_name='delete_note' and idempotency_key=p_idempotency_key);
end;
$$;

create or replace function public.mcp_restore_note(
  p_user_id uuid,p_client_id text,p_note_id uuid,p_expected_updated_at timestamptz,p_idempotency_key text,p_request_hash text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare existing public.mcp_idempotency%rowtype; current public.documents%rowtype; updated public.documents%rowtype;
begin
  insert into public.mcp_idempotency(user_id,client_id,tool_name,idempotency_key,request_hash)
  values(p_user_id,p_client_id,'restore_note',p_idempotency_key,p_request_hash) on conflict do nothing;
  select * into existing from public.mcp_idempotency where user_id=p_user_id and client_id=p_client_id and tool_name='restore_note' and idempotency_key=p_idempotency_key for update;
  if existing.request_hash <> p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  if existing.result_json is not null then return existing.result_json || jsonb_build_object('replay',true); end if;
  select * into current from public.documents where id=p_note_id and user_id=p_user_id for update;
  if not found or current.status <> 'archived' then raise exception 'NOT_FOUND'; end if;
  if current.updated_at <> p_expected_updated_at then raise exception 'CONFLICT'; end if;
  update public.documents set status='active',archived_at=null where id=p_note_id and user_id=p_user_id returning * into updated;
  update public.mcp_idempotency set result_json=jsonb_build_object('ok',true,'note',jsonb_build_object('id',updated.id,'status',updated.status,'updated_at',updated.updated_at))
  where user_id=p_user_id and client_id=p_client_id and tool_name='restore_note' and idempotency_key=p_idempotency_key;
  return (select result_json from public.mcp_idempotency where user_id=p_user_id and client_id=p_client_id and tool_name='restore_note' and idempotency_key=p_idempotency_key);
end;
$$;

create or replace function public.mcp_exchange_authorization_code(
  p_code_hash text,p_client_id text,p_redirect_uri text,p_code_challenge text,p_resource text,
  p_access_token_hash text,p_refresh_token_hash text,p_access_expires_at timestamptz,p_refresh_expires_at timestamptz
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare c public.mcp_oauth_codes%rowtype;
begin
  select * into c from public.mcp_oauth_codes where code_hash=p_code_hash for update;
  if not found or c.expires_at<=now() or c.used_at is not null then raise exception 'INVALID_GRANT'; end if;
  if c.client_id<>p_client_id or c.redirect_uri<>p_redirect_uri or c.code_challenge<>p_code_challenge or c.resource<>p_resource then raise exception 'INVALID_GRANT'; end if;
  update public.mcp_oauth_codes set used_at=now() where code_hash=p_code_hash;
  insert into public.mcp_oauth_grants(user_id,client_id,scopes,revoked_at) values(c.user_id,c.client_id,c.scopes,null)
  on conflict(user_id,client_id) do update set scopes=excluded.scopes,revoked_at=null,updated_at=now();
  insert into public.mcp_oauth_tokens(token_hash,client_id,user_id,scopes,resource,expires_at) values(p_access_token_hash,c.client_id,c.user_id,c.scopes,c.resource,p_access_expires_at);
  insert into public.mcp_oauth_refresh_tokens(token_hash,client_id,user_id,scopes,resource,expires_at) values(p_refresh_token_hash,c.client_id,c.user_id,c.scopes,c.resource,p_refresh_expires_at);
  return jsonb_build_object('user_id',c.user_id,'client_id',c.client_id,'scopes',c.scopes,'resource',c.resource);
end;
$$;

create or replace function public.mcp_rotate_refresh_token(
  p_refresh_token_hash text,p_client_id text,p_new_access_token_hash text,p_new_refresh_token_hash text,p_access_expires_at timestamptz,p_refresh_expires_at timestamptz
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare old public.mcp_oauth_refresh_tokens%rowtype;
begin
  select * into old from public.mcp_oauth_refresh_tokens where token_hash=p_refresh_token_hash for update;
  if not found or old.revoked_at is not null or old.rotated_at is not null or old.expires_at<=now() or old.client_id<>p_client_id then raise exception 'INVALID_GRANT'; end if;
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