-- Match the canonical app-table RLS contract, including owner queries.
-- Public and staff access remains through the explicitly granted RPCs.
alter table app.home_stories force row level security;
