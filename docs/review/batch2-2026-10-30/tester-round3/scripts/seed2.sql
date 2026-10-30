set session_replication_role = replica;
insert into app.profiles (id, display_name, username)
select u.id, 'Manager ' || substr(u.email, 5, 8), 'u' || substr(u.id::text,1,8) from auth.users u on conflict do nothing;
insert into app_private.public_ranking_exclusions (user_id, reason, created_by_principal_id)
select ('d8' || lpad(to_hex(i), 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'perf scratch', gen_random_uuid() from generate_series(1, 3) i;
vacuum analyze;
