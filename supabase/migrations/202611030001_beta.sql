create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.members (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member','admin')),
  suspended boolean not null default false,
  joined_at timestamptz not null default now(), last_invite_at timestamptz
);
create table public.documents (
  owner uuid primary key references public.members(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0), mutation_id text,
  data jsonb, updated_at timestamptz not null default now()
);
create table public.invitations (
  id uuid primary key default gen_random_uuid(), owner uuid not null references public.members(id) on delete cascade,
  code_hash text not null unique, created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  uses integer not null default 0 check (uses between 0 and 10), revoked boolean not null default false
);
create table public.rate_limits (
  actor uuid not null references auth.users(id) on delete cascade, action text not null,
  started_at timestamptz not null default now(), attempts integer not null default 0,
  primary key(actor,action)
);
create table public.catalog (
  id uuid primary key default gen_random_uuid(), author uuid references auth.users(id) on delete set null,
  body jsonb not null, revision bigint not null default 1,
  hidden boolean not null default false, created_at timestamptz not null default now()
);
create table public.proposals (
  id uuid primary key default gen_random_uuid(), author uuid references auth.users(id) on delete set null,
  target uuid references public.catalog(id), target_revision bigint,
  body jsonb not null, created_at timestamptz not null default now(),
  status text not null default 'pending' check(status in ('pending','accepted','rejected','hidden')),
  reason text, published_id uuid references public.catalog(id)
);
create table public.votes (
  proposal uuid not null references public.proposals(id) on delete cascade,
  voter uuid not null references public.members(id) on delete cascade,
  favorable boolean not null, primary key(proposal,voter)
);
create table public.reports (
  id uuid primary key default gen_random_uuid(), reporter uuid references auth.users(id) on delete set null,
  kind text not null check(kind in ('catalog','proposal','member')), target uuid not null,
  reason text not null check(length(reason) between 3 and 2000), created_at timestamptz not null default now()
);
create table public.moderation (
  id uuid primary key default gen_random_uuid(), actor uuid references auth.users(id) on delete set null,
  kind text not null, target uuid not null, reason text not null, created_at timestamptz not null default now()
);

create function public.is_member() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.members where id = auth.uid() and not suspended)
$$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.members where id = auth.uid() and role = 'admin' and not suspended)
$$;
create function public.require_member() returns void language plpgsql security definer set search_path = '' as $$
begin if not public.is_member() then raise exception 'Accès réservé aux membres actifs'; end if; end $$;
create function public.take_rate(action_name text, maximum integer, period interval) returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if auth.uid() is null then return false; end if;
  insert into public.rate_limits(actor,action,attempts) values(auth.uid(),action_name,1)
  on conflict(actor,action) do update set
    attempts = case when public.rate_limits.started_at <= now()-period then 1 else public.rate_limits.attempts+1 end,
    started_at = case when public.rate_limits.started_at <= now()-period then now() else public.rate_limits.started_at end
  returning attempts into n;
  return n <= maximum;
end $$;

-- Structured document validation at the trust boundary. Invalid casts are rejected.
create function public.valid_exercise(body jsonb) returns boolean language plpgsql immutable set search_path = '' as $$
begin
  return coalesce(jsonb_typeof(body) = 'object'
    and jsonb_typeof(body->'name') = 'string' and length(trim(body->>'name')) between 2 and 100
    and jsonb_typeof(body->'description') = 'string' and length(trim(body->>'description')) between 2 and 2000
    and body->>'measure' in ('load','reps','duration')
    and (body->>'measure' <> 'load' or body->>'convention' in ('bar','dumbbell','machine'))
    and length(coalesce(body->>'muscle','')) <= 100 and length(coalesce(body->>'equipment','')) <= 100
    and length(coalesce(body->>'aliases','')) <= 300
    and (not body ? 'muscle' or jsonb_typeof(body->'muscle') = 'string')
    and (not body ? 'equipment' or jsonb_typeof(body->'equipment') = 'string')
    and (not body ? 'aliases' or jsonb_typeof(body->'aliases') = 'string')
    and (not body ? 'archived' or jsonb_typeof(body->'archived') = 'boolean')
    and (not body ? 'shared' or jsonb_typeof(body->'shared') = 'boolean'), false);
exception when others then return false; end $$;
create function public.valid_number(v jsonb, low numeric, high numeric) returns boolean language plpgsql immutable set search_path = '' as $$
begin return coalesce(jsonb_typeof(v) = 'number' and (v#>>'{}')::numeric between low and high,false);
exception when others then return false; end $$;
create function public.valid_config(c jsonb) returns boolean language plpgsql immutable set search_path = '' as $$
begin
 return coalesce(public.valid_exercise(c->'exercise') and length(c->>'id') between 1 and 100
   and jsonb_typeof(c->'id') = 'string'
   and public.valid_number(c->'sets',1,30) and public.valid_number(c->'load',0,5000)
   and public.valid_number(c->'min',1,500) and public.valid_number(c->'max',1,500)
   and public.valid_number(c->'increment',0.000001,100) and public.valid_number(c->'rest',0,3600)
   and (c->>'sets')::numeric between 1 and 30 and (c->>'sets')::numeric = trunc((c->>'sets')::numeric)
   and (c->>'load')::numeric between 0 and 5000
   and (c->>'min')::numeric between 1 and 500 and (c->>'max')::numeric between (c->>'min')::numeric and 500
   and (c->>'min')::numeric = trunc((c->>'min')::numeric) and (c->>'max')::numeric = trunc((c->>'max')::numeric)
   and (c->>'increment')::numeric > 0 and (c->>'increment')::numeric <= 100
   and (c->>'rest')::numeric between 0 and 3600 and (c->>'rest')::numeric = trunc((c->>'rest')::numeric)
   and (c->'mode' = 'null'::jsonb or c->>'mode' in ('last','gentle','standard','strong')), false);
exception when others then return false; end $$;
create function public.valid_document(d jsonb) returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb; e jsonb; t jsonb;
begin
 if d is null or jsonb_typeof(d) is distinct from 'object' or d->'version' is distinct from '1'::jsonb or octet_length(d::text) > 8388608 then return false; end if;
 if jsonb_typeof(d->'exercises') is distinct from 'array' or jsonb_typeof(d->'templates') is distinct from 'array' or jsonb_typeof(d->'sessions') is distinct from 'array' or jsonb_typeof(d->'favorites') is distinct from 'array' then return false; end if;
 if jsonb_array_length(d->'exercises') > 10000 or jsonb_array_length(d->'templates') > 1000 or jsonb_array_length(d->'sessions') > 10000 or jsonb_array_length(d->'favorites') > 1000 then return false; end if;
 for item in select value from jsonb_array_elements(d->'favorites') loop if jsonb_typeof(item) is distinct from 'string' or length(item#>>'{}') not between 1 and 100 then return false; end if; end loop;
 for item in select value from jsonb_array_elements(d->'exercises') loop if not public.valid_exercise(item) or jsonb_typeof(item->'id') is distinct from 'string' or coalesce(length(item->>'id'),0) not between 1 and 100 then return false; end if; end loop;
 for item in select value from jsonb_array_elements(d->'templates') loop
   if coalesce(length(item->>'id'),0) not between 1 and 100 or coalesce(length(trim(item->>'name')),0) not between 1 and 100 or coalesce(item->>'mode','') not in ('last','gentle','standard','strong') or jsonb_typeof(item->'autoRest') is distinct from 'boolean' then return false; end if;
   if jsonb_typeof(item->'exercises') is distinct from 'array' or jsonb_array_length(item->'exercises') not between 1 and 50 then return false; end if;
   for e in select value from jsonb_array_elements(item->'exercises') loop if not public.valid_config(e) then return false; end if; end loop;
 end loop;
 for item in select value from jsonb_array_elements(d->'sessions') loop
   if coalesce(length(item->>'id'),0) not between 1 and 100 or coalesce(length(item->>'templateId'),0) not between 1 and 100 or coalesce(length(item->>'name'),0) not between 1 and 100 or jsonb_typeof(item->'autoRest') is distinct from 'boolean' then return false; end if;
   if jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'templateId') is distinct from 'string' or jsonb_typeof(item->'name') is distinct from 'string' or jsonb_typeof(item->'startedAt') is distinct from 'string' or (item->>'startedAt') !~ '^\d{4}-\d{2}-\d{2}T.*Z$' then return false; end if;
   perform (item->>'startedAt')::timestamptz;
   if not item ? 'finishedAt' or not item ? 'restEndsAt' then return false; end if;
   if item->>'finishedAt' is not null then
     if jsonb_typeof(item->'finishedAt') is distinct from 'string' or (item->>'finishedAt') !~ '^\d{4}-\d{2}-\d{2}T.*Z$' then return false; end if;
     perform (item->>'finishedAt')::timestamptz;
   end if;
   if item->'restEndsAt' <> 'null'::jsonb and not public.valid_number(item->'restEndsAt',0,9999999999999) then return false; end if;
   if jsonb_typeof(item->'exercises') is distinct from 'array' or jsonb_array_length(item->'exercises') > 50 then return false; end if;
   for e in select value from jsonb_array_elements(item->'exercises') loop
     if not public.valid_config(e->'config') or coalesce(e->>'mode','') not in ('last','gentle','standard','strong') or jsonb_typeof(e->'sets') is distinct from 'array' or jsonb_array_length(e->'sets') > 60 then return false; end if;
     for t in select value from jsonb_array_elements(e->'sets') loop
       if coalesce(length(t->>'id'),0) not between 1 and 100 or jsonb_typeof(t->'warmup') is distinct from 'boolean' or jsonb_typeof(t->'done') is distinct from 'boolean' then return false; end if;
       if not public.valid_number(t->'load',0,5000) or not public.valid_number(t->'targetLoad',0,5000) or not public.valid_number(t->'reps',0.000001,86400) or not public.valid_number(t->'targetReps',0.000001,86400) then return false; end if;
     end loop;
   end loop;
 end loop;
 return true;
exception when others then return false; end $$;
alter table public.documents add constraint valid_body check (data is null or public.valid_document(data));
alter table public.catalog add constraint valid_body check (public.valid_exercise(body));
alter table public.proposals add constraint valid_body check (public.valid_exercise(body));

create function public.create_invite() returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.members; raw text; invitation public.invitations;
begin
 perform public.require_member();
 select * into m from public.members where id = auth.uid() for update;
 if m.last_invite_at > now()-interval '24 hours' then raise exception 'Un seul code par période de 24 heures'; end if;
 raw := encode(extensions.gen_random_bytes(16),'hex');
 insert into public.invitations(owner,code_hash) values(auth.uid(),encode(extensions.digest(raw,'sha256'),'hex')) returning * into invitation;
 update public.members set last_invite_at = now() where id = auth.uid();
 return jsonb_build_object('id',invitation.id,'code',raw,'expires_at',invitation.expires_at);
end $$;
create function public.revoke_invite(invitation_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin perform public.require_member(); update public.invitations set revoked = true where id = invitation_id and owner = auth.uid(); end $$;
create function public.redeem_invite(code text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare invitation public.invitations;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'error','Connexion requise'); end if;
 if not public.take_rate('redeem',5,interval '15 minutes') then return jsonb_build_object('ok',false,'error','Trop de tentatives. Réessayez dans 15 minutes.'); end if;
 -- Serialize redemption for both the recipient and the shared code.
 perform 1 from auth.users where id = auth.uid() and email_confirmed_at is not null for update;
 if not found then return jsonb_build_object('ok',false,'error','Vérifiez votre adresse e-mail'); end if;
 if exists(select 1 from public.members where id = auth.uid()) then return jsonb_build_object('ok',public.is_member()); end if;
 select * into invitation from public.invitations where code_hash = encode(extensions.digest(lower(trim(code)),'sha256'),'hex') for update;
 if not found or invitation.revoked or invitation.expires_at <= now() or invitation.uses >= 10
   or not exists(select 1 from public.members where id = invitation.owner and not suspended)
 then return jsonb_build_object('ok',false,'error','Code invalide, expiré, révoqué ou épuisé'); end if;
 insert into public.members(id) values(auth.uid());
 update public.invitations set uses = uses+1 where id = invitation.id;
 return jsonb_build_object('ok',true);
end $$;

create function public.sync_document(expected_revision bigint, mutation_id text, document jsonb default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_doc public.documents;
begin
 perform public.require_member();
 insert into public.documents(owner) values(auth.uid()) on conflict do nothing;
 select * into current_doc from public.documents where owner = auth.uid() for update;
 if document is not null then
   if length(mutation_id) not between 1 and 100 or not public.valid_document(document) then raise exception 'Document invalide'; end if;
   if current_doc.mutation_id = sync_document.mutation_id then
     if current_doc.data is distinct from document then raise exception 'Identifiant de mutation déjà utilisé'; end if;
     return jsonb_build_object('revision',current_doc.revision,'data',current_doc.data);
   end if;
   if current_doc.revision <> expected_revision then return jsonb_build_object('conflict',true,'revision',current_doc.revision,'data',current_doc.data); end if;
   update public.documents set data = document, revision = revision+1, mutation_id = sync_document.mutation_id, updated_at = now() where owner = auth.uid() returning * into current_doc;
 end if;
 return jsonb_build_object('revision',current_doc.revision,'data',current_doc.data);
end $$;

create function public.submit_proposal(body jsonb, target_id uuid default null) returns uuid language plpgsql security definer set search_path = '' as $$
declare target_row public.catalog; result uuid;
begin
 perform public.require_member();
 if not public.valid_exercise(body) then raise exception 'Fiche invalide'; end if;
 if not public.take_rate('proposal',10,interval '24 hours') then raise exception 'Dix propositions maximum par jour'; end if;
 if target_id is not null then
   select * into target_row from public.catalog where id = target_id and not hidden;
   if not found then raise exception 'Exercice indisponible'; end if;
   if body->>'measure' is distinct from target_row.body->>'measure' or body->>'convention' is distinct from target_row.body->>'convention' then raise exception 'Créez une variante pour changer la mesure ou la convention'; end if;
 end if;
 insert into public.proposals(author,target,target_revision,body) values(auth.uid(),target_id,target_row.revision,body) returning id into result;
 return result;
end $$;
create function public.settle_proposal(proposal_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare p public.proposals; yes_count integer; no_count integer; published uuid;
begin
 select * into p from public.proposals where id = proposal_id for update;
 if not found or p.status <> 'pending' or p.created_at > now()-interval '24 hours' then return; end if;
 select count(*) filter(where favorable),count(*) filter(where not favorable) into yes_count,no_count from public.votes where proposal = p.id;
 if yes_count+no_count = 0 then return; end if;
 if yes_count > no_count then
   if p.target is null then
     insert into public.catalog(author,body) values(p.author,p.body) returning id into published;
   else
     update public.catalog set body = p.body, revision = revision+1 where id = p.target and revision = p.target_revision and not hidden returning id into published;
     if not found then update public.proposals set status = 'rejected',reason = 'Fiche modifiée ou masquée depuis cette proposition' where id = p.id; return; end if;
   end if;
   update public.proposals set status = 'accepted',published_id = published where id = p.id;
 else update public.proposals set status = 'rejected',reason = 'Absence de majorité favorable' where id = p.id;
 end if;
end $$;
create function public.settle_proposals() returns void language plpgsql security definer set search_path = '' as $$
declare p record;
begin perform public.require_member(); for p in select id from public.proposals where status = 'pending' and created_at <= now()-interval '24 hours' order by created_at loop perform public.settle_proposal(p.id); end loop; end $$;
create function public.cast_vote(proposal_id uuid, favorable boolean) returns void language plpgsql security definer set search_path = '' as $$
declare p public.proposals;
begin
 perform public.require_member();
 select * into p from public.proposals where id = proposal_id for update;
 if not found then raise exception 'Proposition inconnue'; end if;
 perform public.settle_proposal(p.id);
 select * into p from public.proposals where id = proposal_id;
 if p.status <> 'pending' then raise exception 'Vote clôturé'; end if;
 if p.author = auth.uid() then raise exception 'Pas de vote sur sa propre proposition'; end if;
 insert into public.votes(proposal,voter,favorable) values(proposal_id,auth.uid(),cast_vote.favorable)
 on conflict(proposal,voter) do update set favorable = excluded.favorable;
 perform public.settle_proposal(p.id);
end $$;
create function public.report_content(kind text, target_id uuid, reason text) returns void language plpgsql security definer set search_path = '' as $$
begin perform public.require_member();
 if not public.take_rate('report',10,interval '24 hours') then raise exception 'Dix signalements maximum par jour'; end if;
 insert into public.reports(reporter,kind,target,reason) values(auth.uid(),report_content.kind,target_id,reason);
end $$;
create function public.moderate(kind text, target_id uuid, reason text, hidden boolean default true) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'Administration requise'; end if;
 if length(trim(reason)) not between 3 and 2000 then raise exception 'Motif requis'; end if;
 if kind = 'catalog' then update public.catalog set hidden = moderate.hidden where id = target_id;
 elsif kind = 'proposal' then update public.proposals set status = 'hidden',reason = moderate.reason where id = target_id;
 elsif kind = 'member' then
   if target_id = auth.uid() then raise exception 'Impossible de suspendre son propre compte'; end if;
   update public.members set suspended = moderate.hidden where id = target_id;
 else raise exception 'Type inconnu'; end if;
 if not found then raise exception 'Cible inconnue'; end if;
 insert into public.moderation(actor,kind,target,reason) values(auth.uid(),moderate.kind,target_id,moderate.reason);
end $$;

alter table public.members enable row level security;
alter table public.documents enable row level security;
alter table public.invitations enable row level security;
alter table public.rate_limits enable row level security;
alter table public.catalog enable row level security;
alter table public.proposals enable row level security;
alter table public.votes enable row level security;
alter table public.reports enable row level security;
alter table public.moderation enable row level security;
create policy member_read on public.members for select to authenticated using(id = auth.uid() or public.is_admin());
create policy document_read on public.documents for select to authenticated using(owner = auth.uid() and public.is_member());
create policy invitation_read on public.invitations for select to authenticated using(owner = auth.uid() and public.is_member());
create policy catalog_read on public.catalog for select to authenticated using(public.is_member() and (not hidden or public.is_admin()));
create policy proposal_read on public.proposals for select to authenticated using(public.is_member() and (status <> 'hidden' or author = auth.uid() or public.is_admin()));
create policy vote_read on public.votes for select to authenticated using(public.is_member());
create policy report_read on public.reports for select to authenticated using(public.is_admin());
create policy moderation_read on public.moderation for select to authenticated using(public.is_admin());
revoke all on public.members,public.documents,public.invitations,public.rate_limits,public.catalog,public.proposals,public.votes,public.reports,public.moderation from anon,authenticated;
grant select on public.members,public.documents,public.invitations,public.catalog,public.proposals,public.votes,public.reports,public.moderation to authenticated;
-- Hashes are not needed by clients, even though the codes have 128 bits of entropy.
revoke select on public.invitations from authenticated;
grant select(id,owner,created_at,expires_at,uses,revoked) on public.invitations to authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.is_member(),public.is_admin(),public.create_invite(),public.revoke_invite(uuid),public.redeem_invite(text),public.sync_document(bigint,text,jsonb),public.submit_proposal(jsonb,uuid),public.settle_proposals(),public.cast_vote(uuid,boolean),public.report_content(text,uuid,text),public.moderate(text,uuid,text,boolean) to authenticated;
