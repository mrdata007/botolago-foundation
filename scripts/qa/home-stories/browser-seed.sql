-- Disposable local fixture only. Run once after run-db.sh --keep.
insert into auth.users values
 ('91000000-0000-4000-8000-000000000001','editor@example.test',now()),
 ('91000000-0000-4000-8000-000000000002','publisher@example.test',now());
insert into auth.sessions values
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',now()),
 ('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002',now());
insert into auth.mfa_factors values
 ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','verified'),
 ('93000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002','verified');
insert into app_private.staff_principals(auth_user_id) select id from auth.users;
insert into app_private.staff_role_assignments(staff_principal_id,role_id,grant_reason)
 select p.id,r.id,'Home stories isolated test' from app_private.staff_principals p
 join app_private.admin_roles r on r.name=case when p.auth_user_id::text like '%001' then 'editor' else 'publisher' end;
insert into app_private.staff_role_assignments(staff_principal_id,role_id,grant_reason)
 select p.id,r.id,'Local browser publisher fixture' from app_private.staff_principals p
 cross join app_private.admin_roles r where p.auth_user_id='91000000-0000-4000-8000-000000000001' and r.name='publisher';
