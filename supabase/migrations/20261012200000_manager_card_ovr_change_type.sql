-- Manager Card "week one", migration 1 of 2: the notification type for a
-- rating change, alone. A new enum value cannot be used in the transaction
-- that adds it, so its text, the moments and the calculation that creates it
-- are in the next migration (20261012200100).
--
-- The type is for "your Curva rating went up / went down" after a finished
-- gameweek (owner decision, 2026-10-12). Nothing can create one yet and
-- nothing a reader can see changes.
alter type app.notification_type add value if not exists 'manager_card_ovr_change';
