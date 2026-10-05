-- Push alerts, the remaining moments, migration 1 of 2: the "goal cancelled"
-- notification type, alone. A new enum value cannot be used in the
-- transaction that adds it, so its text, its place in the push rules and the
-- planner that creates it are in the next migration (20261005130000).
--
-- The type is for the correction that follows a goal alert when the goal is
-- later ruled out (a VAR decision): the phone that was told "goal" is told it
-- does not stand. Nothing can create one yet and nothing a reader can see
-- changes.
alter type app.notification_type add value if not exists 'goal_cancelled';
