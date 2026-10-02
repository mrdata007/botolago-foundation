-- BotolaGO — read back the signed-in user's match reminders.
--
-- The "remind me" bell saves a reminder with
-- `api.set_my_notification_subscription('match', fixture, true)`, but nothing
-- returned the list, so the bell could not show its state on a new phone.
-- This adds the read: the fixture ids the caller has an enabled match
-- reminder on, newest change first, at most 200. Additive; no table or
-- existing function changes.

create or replace function api.list_my_match_reminders()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid(); result jsonb;
begin
  -- Like every account read: an account with a second factor must have used it.
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then
    raise exception using errcode = 'PT401', message = 'notification_access_denied';
  end if;
  select coalesce(jsonb_agg(reminder.fixture_id order by reminder.updated_at desc, reminder.id), '[]'::jsonb)
  into result
  from (
    select subscription.id, subscription.fixture_id, subscription.updated_at
    from app.notification_subscriptions subscription
    where subscription.user_id = current_user_id
      and subscription.kind = 'match'
      and subscription.enabled
      and subscription.fixture_id is not null
    order by subscription.updated_at desc, subscription.id
    limit 200
  ) reminder;
  return result;
end;
$$;

revoke all on function api.list_my_match_reminders()
from public, anon, authenticated, service_role;
grant execute on function api.list_my_match_reminders() to authenticated;
