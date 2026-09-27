-- BotolaGO Production V2
-- Pépites, migration 6 of the v1 sequence: the weekly email's notification
-- type, alone. A new enum value cannot be used in the transaction that adds
-- it, so the preference, templates and pipeline lines that use it are in the
-- next migration (docs/engineering/PEPITES_ARCHITECTURE.md §5.4 and §10).
alter type app.notification_type add value if not exists 'pepites_weekly';
