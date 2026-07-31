begin;

select extensions.no_plan();

select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'app.player_season_ratings'::regclass),
  'player season ratings have RLS enabled'
);
select extensions.ok(
  not has_function_privilege('anon', 'api.news_ingest_provider_article(text,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,integer,text)', 'execute'),
  'anonymous users cannot execute GNews persistence'
);
select extensions.ok(
  has_function_privilege('service_role', 'api.news_ingest_provider_article(text,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,integer,text)', 'execute'),
  'service role can execute GNews persistence'
);
select extensions.ok(
  not has_function_privilege('anon', 'api.ingest_player_season_ratings(text,text,text,jsonb,timestamptz)', 'execute'),
  'anonymous users cannot persist player ratings'
);
select extensions.ok(
  has_function_privilege('anon', 'api.football_player_season_ratings(uuid,text,numeric,uuid,integer)', 'execute'),
  'anonymous users can read finalized player ratings through the bounded API'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select extensions.is(
  api.news_ingest_provider_article(
    'gnews', 'gnews-test-1', 'https://publisher.example/botola-one', repeat('a', 64),
    'fr', 'Une actualité Botola vérifiée',
    'Une description suffisamment longue pour le flux de nouvelles.',
    '<p>Une description suffisamment longue pour le flux de nouvelles.</p><p><a href="https://publisher.example/botola-one" rel="nofollow noopener noreferrer">Lire l’article original sur Publisher Example</a></p>',
    'Publisher Example', 'https://publisher.example/', 'gnews:gnews-test-1:v1',
    statement_timestamp() - interval '1 hour', statement_timestamp() - interval '1 hour',
    1, 'gnews-excerpt-v1'
  ) ->> 'outcome',
  'inserted',
  'the first GNews excerpt creates one canonical public article'
);
select extensions.is(
  api.news_ingest_provider_article(
    'gnews', 'gnews-test-1', 'https://publisher.example/botola-one', repeat('a', 64),
    'fr', 'Une actualité Botola vérifiée',
    'Une description suffisamment longue pour le flux de nouvelles.',
    '<p>Une description suffisamment longue pour le flux de nouvelles.</p><p><a href="https://publisher.example/botola-one" rel="nofollow noopener noreferrer">Lire l’article original sur Publisher Example</a></p>',
    'Publisher Example', 'https://publisher.example/', 'gnews:gnews-test-1:v1',
    statement_timestamp() - interval '1 hour', statement_timestamp() - interval '1 hour',
    1, 'gnews-excerpt-v1'
  ) ->> 'outcome',
  'skipped',
  'an identical retry is idempotently skipped'
);
reset role;
select extensions.is((select count(*)::integer from app.stories), 1, 'one story exists after a retry');
select extensions.is((select count(*)::integer from app.article_editions), 1, 'one edition exists after a retry');
select extensions.is(
  (select count(*)::integer from app_private.news_source_articles),
  1,
  'one private GNews source mapping exists after a retry'
);
select extensions.is(
  (select trust_status::text from app.publishers where slug like 'gnews-source-%'),
  'review_required',
  'the original source is attributed without silently marking it trusted'
);

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is(
  jsonb_array_length(api.news_feed('fr') -> 'items'),
  1,
  'the public French News feed exposes the canonical GNews excerpt'
);
select extensions.throws_ok(
  $$select api.news_ingest_provider_article(
    'gnews', 'denied', 'https://publisher.example/denied', repeat('b', 64),
    'fr', 'Article interdit au client', 'Description suffisamment longue pour être valide.',
    '<p>Description suffisamment longue pour être valide.</p><p><a href="https://publisher.example/denied">Lire l’article original</a></p>',
    'Publisher Example', 'https://publisher.example/', 'gnews:denied:v1',
    statement_timestamp(), statement_timestamp(), 1, 'gnews-excerpt-v1'
  )$$,
  '42501',
  null,
  'anonymous clients cannot call provider persistence'
);
reset role;

-- Create a minimal completed SportsMonks catalog and historical squad.
select api.ingest_football_catalog_entity(
  'sportsmonks', 'competition', 'rating-competition',
  jsonb_build_object(
    'name', 'Rating Competition', 'shortName', 'RTC', 'type', 'league', 'countryCode', 'MA',
    'freshness', jsonb_build_object(
      'updatedAt', statement_timestamp(), 'sourceSequence', 100,
      'sourceVersion', 'sportsmonks:rating-competition:v1'
    )
  )
);
select api.ingest_football_catalog_entity(
  'sportsmonks', 'season', 'rating-season',
  jsonb_build_object(
    'competitionExternalId', 'rating-competition', 'label', 'Rating Season',
    'startsOn', '2025-09-01', 'endsOn', '2026-07-01', 'current', false,
    'freshness', jsonb_build_object(
      'updatedAt', statement_timestamp(), 'sourceSequence', 101,
      'sourceVersion', 'sportsmonks:rating-season:v1'
    )
  )
);
select api.ingest_football_catalog_entity(
  'sportsmonks', 'team', 'rating-team',
  jsonb_build_object(
    'name', 'Rating Team', 'shortName', 'Rating', 'code', 'RAT', 'countryCode', 'MA',
    'freshness', jsonb_build_object(
      'updatedAt', statement_timestamp(), 'sourceSequence', 102,
      'sourceVersion', 'sportsmonks:rating-team:v1'
    )
  )
);
select api.ingest_football_squad(
  'sportsmonks', 'rating-season', 'rating-team',
  jsonb_build_array(
    jsonb_build_object(
      'externalPlayerId', '99001', 'fullName', 'First Rated Forward',
      'displayName', 'First Forward', 'firstName', 'First', 'lastName', 'Forward',
      'dateOfBirth', null, 'position', 'forward', 'preferredFoot', 'unknown',
      'shirtNumber', 9,
      'freshness', jsonb_build_object(
        'updatedAt', statement_timestamp(), 'sourceSequence', 103,
        'sourceVersion', 'sportsmonks:99001:v1'
      )
    ),
    jsonb_build_object(
      'externalPlayerId', '99002', 'fullName', 'Second Rated Forward',
      'displayName', 'Second Forward', 'firstName', 'Second', 'lastName', 'Forward',
      'dateOfBirth', null, 'position', 'forward', 'preferredFoot', 'unknown',
      'shirtNumber', 10,
      'freshness', jsonb_build_object(
        'updatedAt', statement_timestamp(), 'sourceSequence', 104,
        'sourceVersion', 'sportsmonks:99002:v1'
      )
    )
  ),
  statement_timestamp(), 104
);
select set_config(
  'test.rating_season_id',
  (select internal_entity_id::text from app_private.football_provider_mappings
   where provider_name = 'sportsmonks' and entity_type = 'season' and external_id = 'rating-season'),
  true
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  jsonb_array_length(api.football_player_rating_candidates('sportsmonks', 'rating-season')),
  2,
  'the rating runtime receives every mapped historical player exactly once'
);
select extensions.is(
  api.ingest_player_season_ratings(
    'sportsmonks', 'rating-season', 'botolago-preseason-rating-v1',
    '[
      {
        "externalPlayerId":"99001","position":"FWD","appearances":20,"starts":20,"minutes":1800,
        "goals":15,"assists":8,"cleanSheets":0,"goalsConceded":0,"saves":0,
        "penaltiesSaved":0,"penaltiesMissed":0,"yellowCards":1,"redCards":0,
        "secondYellowDismissals":0,"ownGoals":0,"providerRating":8.1,
        "fantasyEquivalentPoints":123,"pointsPer90":6.15,"confidence":1,"rating":10,
        "algorithmVersion":"botolago-preseason-rating-v1"
      },
      {
        "externalPlayerId":"99002","position":"FWD","appearances":20,"starts":18,"minutes":1600,
        "goals":2,"assists":1,"cleanSheets":0,"goalsConceded":0,"saves":0,
        "penaltiesSaved":0,"penaltiesMissed":0,"yellowCards":4,"redCards":0,
        "secondYellowDismissals":0,"ownGoals":0,"providerRating":5.8,
        "fantasyEquivalentPoints":45,"pointsPer90":2.531,"confidence":1,"rating":4,
        "algorithmVersion":"botolago-preseason-rating-v1"
      }
    ]'::jsonb,
    statement_timestamp()
  ) ->> 'inserted',
  '2',
  'a validated rating batch persists both players'
);
select extensions.is(
  api.ingest_player_season_ratings(
    'sportsmonks', 'rating-season', 'botolago-preseason-rating-v1',
    '[{
      "externalPlayerId":"99001","position":"FWD","appearances":20,"starts":20,"minutes":1800,
      "goals":15,"assists":8,"cleanSheets":0,"goalsConceded":0,"saves":0,
      "penaltiesSaved":0,"penaltiesMissed":0,"yellowCards":1,"redCards":0,
      "secondYellowDismissals":0,"ownGoals":0,"providerRating":8.1,
      "fantasyEquivalentPoints":123,"pointsPer90":6.15,"confidence":1,"rating":10,
      "algorithmVersion":"botolago-preseason-rating-v1"
    }]'::jsonb,
    statement_timestamp()
  ) ->> 'skipped',
  '1',
  'an identical rating retry is idempotently skipped'
);
reset role;

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is(
  jsonb_array_length(api.football_player_season_ratings(
    current_setting('test.rating_season_id')::uuid, 'FWD', null, null, 50
  ) -> 'items'),
  2,
  'the public bounded API exposes both versioned ratings'
);
select extensions.throws_ok(
  $$select api.ingest_player_season_ratings(
    'sportsmonks', 'rating-season', 'botolago-preseason-rating-v1', '[]'::jsonb,
    statement_timestamp()
  )$$,
  '42501',
  null,
  'anonymous clients cannot persist ratings'
);
reset role;

select * from extensions.finish();
rollback;
