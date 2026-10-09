-- Manager Card (BG-0158), part 2: the account erasure holds the card's lock.
--
-- app_private.account_deletion_erase (20261006143700) takes, without waiting,
-- the advisory lock of every tick that writes rows it erases, and refuses
-- (account_deletion_writer_busy) when one is running. The Manager Card tick
-- (20261008123200) writes app.manager_cards and its season and history rows,
-- which the erasure removes by cascade, so it takes the same kind of lock:
--
--   pg_try_advisory_xact_lock(hashtextextended('botolago:manager-card', 0))
--
-- This migration adds that lock to the erasure, in the same condition and with
-- the same failure behaviour as the four existing ones (the worker releases
-- the request for the next hourly run). The function is patched in place: its
-- exact text is replaced once, and the migration stops if the anchor is not
-- found exactly once or if the definition would not change. CREATE OR REPLACE
-- keeps the function's owner and grants.

do $lock$
declare
  definition text;
  old_text text;
  new_text text;
begin
  definition := pg_get_functiondef('app_private.account_deletion_erase(uuid,integer)'::regprocedure);
  old_text := '    or not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(''botolago.fantasy_prize_evaluation'', 0))
';
  new_text := old_text
    || '    or not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(''botolago:manager-card'', 0))
';
  if (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'manager card erase lock: the erasure is not the 20261006143700 version';
  end if;
  if replace(definition, old_text, new_text) = definition then
    raise exception 'manager card erase lock: the definition would not change';
  end if;
  execute replace(definition, old_text, new_text);
end;
$lock$;
