-- PostgreSQL requires the new value to commit before it is used in templates.
alter type app.notification_type add value if not exists 'gameweek_opened';
