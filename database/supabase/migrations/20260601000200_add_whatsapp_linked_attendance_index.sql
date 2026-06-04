-- ServiçoCRM — índice para FK de vínculo WhatsApp -> atendimento.

create index if not exists idx_waconv_linked_attendance_id
    on public.whatsapp_conversations (linked_attendance_id);
