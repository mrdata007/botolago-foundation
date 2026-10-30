select md5(string_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' || md5(p.prosrc), E'\n' order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))), count(*)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('app', 'app_private', 'api');
