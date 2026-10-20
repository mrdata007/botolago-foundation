-- Forward correction: a scheduled selection window cannot accept action,
-- regardless of the manager-email switch. Preserve its dedup key until open.
do $patch$ declare original text;changed text;
begin
 original:=pg_get_functiondef('app_private.notification_email_plan(timestamptz)'::regprocedure);
 changed:=replace(original,$old$      and gameweek.status in ('scheduled', 'open')
      and (not app_private.notification_manager_emails_enabled() or gameweek.status='open')$old$,
 $new$      and gameweek.status='open'$new$);
 if changed=original then raise exception 'actionable_deadline_planner_patch_mismatch';end if;
 execute changed;
end $patch$;
