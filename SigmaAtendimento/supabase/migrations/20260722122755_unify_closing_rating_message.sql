update public."Settings"
set
  "closingMessage" = case
    when position(
      coalesce(nullif(btrim(satisfaction_prompt), ''), 'De 1 a 10, qual nota você dá para este atendimento? Responda apenas com um número.')
      in coalesce("closingMessage", '')
    ) > 0 then "closingMessage"
    else concat_ws(
      E'\n\n',
      nullif(btrim("closingMessage"), ''),
      coalesce(nullif(btrim(satisfaction_prompt), ''), 'De 1 a 10, qual nota você dá para este atendimento? Responda apenas com um número.')
    )
  end,
  satisfaction_prompt = null;
