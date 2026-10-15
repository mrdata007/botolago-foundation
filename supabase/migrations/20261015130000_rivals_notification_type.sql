-- BotolaGO+ Rivaux, migration 1 of 3: the notification type for a change of lead, alone.
-- A new enum value cannot be used in the transaction that adds it, so its text, the tables and
-- the tick that creates it are in the next two migrations (20261015130100 and 20261015130200).
--
-- The type is for "your rival now leads you" / "you now lead your rival" after a published
-- journée (owner-approved idea 2, 2026-10-15). Nothing can create one yet and nothing a reader
-- can see changes.
alter type app.notification_type add value if not exists 'rival_lead_change';
