begin;
select extensions.plan(11);
select extensions.is(app_private.ai_home_story_rail_label('{"match":{"home":"Raja Casablanca","away":"Wydad Casablanca"}}'), 'RCA V WAC', 'exact short matchup format');
select extensions.is(app_private.ai_home_story_rail_label('{"match":{"home":"Maghreb Fès","away":"Raja Casablanca"}}'), 'MAS V RCA', 'existing draw');
select extensions.is(app_private.ai_home_story_rail_label('{"match":{"home":"FAR Rabat","away":"Widad Témara"}}'), 'FAR V WST', 'Temara never becomes Casablanca');
select extensions.is(app_private.ai_home_story_rail_label('{"match":{"home":"CR Khemis Zemamra","away":"Hassania Agadir"}}'), 'RCAZ V HUSA', 'verified home-away order');
select extensions.is(app_private.ai_home_story_rail_label('{"clubs":["Raja Casablanca","Wydad Casablanca"]}'), 'RCA', 'two mentions without a verified match do not invent a fixture');
select extensions.is(app_private.ai_home_story_rail_label('{"match":{"home":"Unknown club","away":"Another unknown"}}'), 'ACTU', 'unknown subjects stay short without invented codes');
select extensions.is(app_private.ai_home_story_rail_label('{"match":{"home":"Raja Casablanca","away":"Raja Casablanca"}}'), 'RCA', 'no self-versus-self matchup');
select extensions.ok(not has_function_privilege('anon','app_private.ai_home_story_rail_label(jsonb)','execute') and not has_function_privilege('authenticated','app_private.ai_story_club_code(text)','execute'), 'private helpers remain inaccessible');
select extensions.is(app_private.ai_home_story_rail_label('{"match":{"home":"RSB Berkane","away":"UTS Rabat"}}'), 'RSB V UTS', 'canonical club-name matchup');
select extensions.is(app_private.ai_home_story_rail_label('{"match":{"home":"Amal Tiznit","away":"CODM Meknès"}}'), 'AMT V CODM', 'other current-season canonical names');
select extensions.ok((select bool_and(app_private.ai_story_club_code(name)=code) from (values
 ('Amal Tiznit','AMT'),('Chabab Mohammédia','SCCM'),('CODM Meknès','CODM'),('CR Khemis Zemamra','RCAZ'),
 ('Difaâ El Jadida','DHJ'),('FAR Rabat','FAR'),('FUS Rabat','FUS'),('Hassania Agadir','HUSA'),
 ('Ittihad Tanger','IRT'),('JS Soualem','JSS'),('Kawkab Marrakech','KACM'),('Maghreb Fès','MAS'),
 ('Moghreb Tétouan','MAT'),('Olympic Safi','OCS'),('Olympique Dcheïra','OD'),('Raja Casablanca','RCA'),
 ('RSB Berkane','RSB'),('UTS Rabat','UTS'),('Widad Témara','WST'),('Wydad Casablanca','WAC'),('Yacoub El Mansour','YEM')
 ) clubs(name,code)), 'all 21 current production club names have compact labels');
select * from extensions.finish();
rollback;
