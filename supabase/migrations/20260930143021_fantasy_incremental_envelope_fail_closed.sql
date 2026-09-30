-- Tighten envelope validation only; preserve all scoring values and valid legacy delegation.
set local lock_timeout = '5s';
create or replace function app_private.fantasy_validate_scoring_document(p_document jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if jsonb_typeof(p_document) is distinct from 'object' then
    raise exception using errcode='PT409',message='fantasy_scoring_input_incomplete';
  end if;
  if p_document ? 'incremental' and jsonb_typeof(p_document->'incremental') is distinct from 'boolean' then
    raise exception using errcode='PT409',message='fantasy_scoring_input_incomplete';
  end if;
  if coalesce((p_document->>'incremental')::boolean,false) then
    -- Check types before lengths: absent values produce SQL NULL, not FALSE.
    if jsonb_typeof(p_document->'fixtures') is distinct from 'array'
      or jsonb_typeof(p_document->'players') is distinct from 'array'
      or jsonb_typeof(p_document->'playerFixtures') is distinct from 'array'
      or jsonb_typeof(p_document->'pendingFixtures') is distinct from 'array' then
      raise exception using errcode='PT409',message='fantasy_scoring_input_incomplete';
    end if;
    if jsonb_array_length(p_document->'fixtures')=0 then
      if jsonb_array_length(p_document->'pendingFixtures') not between 1 and 64
        or jsonb_array_length(p_document->'players') not between 1 and 2000
        or jsonb_array_length(p_document->'playerFixtures')<>0 then
        raise exception using errcode='PT409',message='fantasy_scoring_input_incomplete';
      end if;
      return;
    end if;
  end if;
  perform app_private.fantasy_validate_scoring_document_before_live(p_document);
end $$;
