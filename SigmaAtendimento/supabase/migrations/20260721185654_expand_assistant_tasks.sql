ALTER TYPE public."AssistantTaskStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE public."AssistantTaskStatus" ADD VALUE IF NOT EXISTS 'WAITING';

ALTER TYPE public."AssistantTaskSource" ADD VALUE IF NOT EXISTS 'CONVERSATION';
ALTER TYPE public."AssistantTaskSource" ADD VALUE IF NOT EXISTS 'TICKET';
ALTER TYPE public."AssistantTaskSource" ADD VALUE IF NOT EXISTS 'VISIT';

ALTER TYPE public."NotificationType" ADD VALUE IF NOT EXISTS 'ASSISTANT_TASK_ASSIGNED';

DO $$
BEGIN
  CREATE TYPE public."AssistantTaskActivityType" AS ENUM (
    'CREATED',
    'UPDATED',
    'STATUS_CHANGED',
    'ASSIGNED',
    'COMPLETED',
    'REOPENED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE public."AssistantTask"
  ADD COLUMN IF NOT EXISTS customer_id text,
  ADD COLUMN IF NOT EXISTS field_service_id text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssistantTask_customer_id_fkey') THEN
    ALTER TABLE public."AssistantTask" ADD CONSTRAINT "AssistantTask_customer_id_fkey"
      FOREIGN KEY (customer_id) REFERENCES public."Customer"(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssistantTask_field_service_id_fkey') THEN
    ALTER TABLE public."AssistantTask" ADD CONSTRAINT "AssistantTask_field_service_id_fkey"
      FOREIGN KEY (field_service_id) REFERENCES public."TicketFieldService"(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "AssistantTask_customerId_idx"
  ON public."AssistantTask" (customer_id);
CREATE INDEX IF NOT EXISTS "AssistantTask_fieldServiceId_idx"
  ON public."AssistantTask" (field_service_id);

CREATE TABLE IF NOT EXISTS public."AssistantTaskActivity" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
  task_id text NOT NULL REFERENCES public."AssistantTask"(id) ON DELETE CASCADE,
  actor_user_id text REFERENCES public."User"(id) ON DELETE SET NULL,
  type public."AssistantTaskActivityType" NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "AssistantTaskActivity_companyId_createdAt_idx"
  ON public."AssistantTaskActivity" (company_id, created_at);
CREATE INDEX IF NOT EXISTS "AssistantTaskActivity_taskId_createdAt_idx"
  ON public."AssistantTaskActivity" (task_id, created_at);
CREATE INDEX IF NOT EXISTS "AssistantTaskActivity_actorUserId_idx"
  ON public."AssistantTaskActivity" (actor_user_id);

ALTER TABLE public."AssistantTaskActivity" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_assistant_task_activity ON public."AssistantTaskActivity";
CREATE POLICY tenant_isolation_assistant_task_activity
  ON public."AssistantTaskActivity"
  FOR ALL
  USING (company_id = (SELECT current_setting('app.current_company_id', true)))
  WITH CHECK (company_id = (SELECT current_setting('app.current_company_id', true)));
