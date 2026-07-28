alter table public."Settings"
  add column if not exists inactivity_closing_message text,
  add column if not exists satisfaction_prompt text;

update public."Settings"
set
  inactivity_closing_message = coalesce(
    inactivity_closing_message,
    'Encerramos este atendimento por falta de resposta. Quando precisar, envie uma nova mensagem e retomaremos o atendimento.'
  ),
  satisfaction_prompt = coalesce(
    satisfaction_prompt,
    'De 1 a 10, qual nota você dá para este atendimento? Responda apenas com um número.'
  );
