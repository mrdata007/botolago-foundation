-- BotolaGO Production V2
-- Club news email, migration 1 of 2: the daily digest's notification type,
-- alone. A new enum value cannot be used in the transaction that adds it, so
-- the templates, planner and pipeline lines that use it are in the next
-- migration (docs/backend/CLUB_NEWS_EMAIL.md).
alter type app.notification_type add value if not exists 'club_news_digest';
