-- Run only against a disposable local database: psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/mobile_relief.sql
-- Every fixture is rolled back; no network providers are invoked.
begin;
insert into auth.users(id, email) values
 ('11111111-1111-4111-a111-111111111111','relief-owner@example.invalid'),
 ('22222222-2222-4222-a222-222222222222','relief-member@example.invalid'),
 ('33333333-3333-4333-a333-333333333333','relief-outsider@example.invalid');
insert into public.families(id,name,created_by) values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','Relief QA','11111111-1111-4111-a111-111111111111');
insert into public.family_memberships(family_id,user_id) values
 ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','11111111-1111-4111-a111-111111111111'),
 ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','22222222-2222-4222-a222-222222222222') on conflict do nothing;
insert into public.family_members(id,family_id,name,linked_user_id) values
 ('bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','QA member','22222222-2222-4222-a222-222222222222');
insert into public.push_devices(id,user_id,token) values
 ('44444444-4444-4444-a444-444444444444','11111111-1111-4111-a111-111111111111','ExponentPushToken[local-owner]'),
 ('55555555-5555-4555-a555-555555555555','22222222-2222-4222-a222-222222222222','ExponentPushToken[local-member]'),
 ('66666666-6666-4666-a666-666666666666','33333333-3333-4333-a333-333333333333','ExponentPushToken[local-outsider]');
insert into public.documents(id,family_id,uploaded_by,file_url,upload_key) values
 ('cccccccc-cccc-4ccc-accc-cccccccccccc','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','11111111-1111-4111-a111-111111111111','local-only.pdf','retry-key');
update public.documents set status='analyzed' where id='cccccccc-cccc-4ccc-accc-cccccccccccc';
update public.documents set status='analyzed' where id='cccccccc-cccc-4ccc-accc-cccccccccccc';
do $$ begin
 if (select count(*) from public.push_deliveries where document_id='cccccccc-cccc-4ccc-accc-cccccccccccc') <> 2 then raise exception 'Document pushes must dedupe and exclude outsiders'; end if;
 begin
  insert into public.documents(family_id,uploaded_by,file_url,upload_key) values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','11111111-1111-4111-a111-111111111111','duplicate.pdf','retry-key');
  raise exception 'Duplicate upload key accepted';
 exception when unique_violation then null; end;
end $$;
insert into public.tasks(id,family_id,document_id,title,confirmed,assigned_to) values
 ('dddddddd-dddd-4ddd-addd-dddddddddddd','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-accc-cccccccccccc','Synthetic task',true,'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-a111-111111111111',true);
do $$ begin
 begin
  perform public.accept_family_task('dddddddd-dddd-4ddd-addd-dddddddddddd');
  raise exception 'Wrong person accepted task';
 exception when raise_exception then
  if sqlerrm <> 'Nur die zugewiesene Person kann übernehmen' then raise; end if;
 end;
 begin perform * from public.push_devices; raise exception 'Client can read device tokens';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-a222-222222222222',true);
select public.accept_family_task('dddddddd-dddd-4ddd-addd-dddddddddddd');
select public.accept_family_task('dddddddd-dddd-4ddd-addd-dddddddddddd');
reset role;
do $$ begin
 if (select count(*) from public.task_acceptances where task_id='dddddddd-dddd-4ddd-addd-dddddddddddd') <> 1 then raise exception 'Acceptance not idempotent'; end if;
 if (select count(*) from public.push_deliveries where kind='task_accepted' and task_id='dddddddd-dddd-4ddd-addd-dddddddddddd') <> 1 then raise exception 'Acceptance notification not idempotent'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-a333-333333333333',true);
do $$ begin
 if exists(select 1 from public.task_acceptances) then raise exception 'Outsider can read acceptance'; end if;
 begin perform public.accept_family_task('dddddddd-dddd-4ddd-addd-dddddddddddd'); raise exception 'Outsider accepted';
 exception when raise_exception then if sqlerrm <> 'Aufgabe nicht verfügbar' then raise; end if; end;
end $$;
reset role;
update public.tasks set assigned_to=null where id='dddddddd-dddd-4ddd-addd-dddddddddddd';
do $$ declare first_claim integer; second_claim integer; begin
 if exists(select 1 from public.task_acceptances where task_id='dddddddd-dddd-4ddd-addd-dddddddddddd') then raise exception 'Old acceptance survived reassignment'; end if;
 select count(*) into first_claim from public.claim_push_deliveries(100);
 select count(*) into second_claim from public.claim_push_deliveries(100);
 if first_claim=0 or second_claim<>0 then raise exception 'Lease claimed twice'; end if;
 update public.push_deliveries set attempts=8,retry_at=now()-interval '1 minute' where state='sending';
 perform * from public.claim_push_deliveries(100);
 if exists(select 1 from public.push_deliveries where state='sending' and attempts>=8) then raise exception 'Exhausted lease stuck'; end if;
end $$;
rollback;
select 'mobile relief integration: PASS' as result;
