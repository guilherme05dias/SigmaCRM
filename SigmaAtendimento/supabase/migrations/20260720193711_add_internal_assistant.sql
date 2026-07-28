CREATE TYPE public."AssistantTaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'DISMISSED');
CREATE TYPE public."AssistantTaskSource" AS ENUM ('MANUAL', 'AI');
CREATE TYPE public."AssistantAnalysisScope" AS ENUM ('OVERVIEW', 'TICKET');

ALTER TYPE public."NotificationType" ADD VALUE IF NOT EXISTS 'ASSISTANT_TASK_DUE';

CREATE TABLE public."AssistantAnalysis" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
  requested_by_user_id text NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
  scope public."AssistantAnalysisScope" NOT NULL DEFAULT 'OVERVIEW',
  ticket_id text REFERENCES public."Ticket"(id) ON DELETE SET NULL,
  model text NOT NULL,
  summary text NOT NULL,
  result jsonb NOT NULL,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."AssistantTask" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
  created_by_user_id text NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
  assigned_user_id text REFERENCES public."User"(id) ON DELETE SET NULL,
  analysis_id text REFERENCES public."AssistantAnalysis"(id) ON DELETE SET NULL,
  ticket_id text REFERENCES public."Ticket"(id) ON DELETE SET NULL,
  conversation_id text REFERENCES public."Conversation"(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  priority public."TicketPriority" NOT NULL DEFAULT 'MEDIUM',
  status public."AssistantTaskStatus" NOT NULL DEFAULT 'PENDING',
  source public."AssistantTaskSource" NOT NULL DEFAULT 'MANUAL',
  due_at timestamptz,
  reminded_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "AssistantAnalysis_companyId_createdAt_idx"
  ON public."AssistantAnalysis" (company_id, created_at);
CREATE INDEX "AssistantAnalysis_requestedByUserId_idx"
  ON public."AssistantAnalysis" (requested_by_user_id);
CREATE INDEX "AssistantAnalysis_ticketId_idx"
  ON public."AssistantAnalysis" (ticket_id);

CREATE INDEX "AssistantTask_companyId_status_dueAt_idx"
  ON public."AssistantTask" (company_id, status, due_at);
CREATE INDEX "AssistantTask_assignedUserId_status_dueAt_idx"
  ON public."AssistantTask" (assigned_user_id, status, due_at);
CREATE INDEX "AssistantTask_createdByUserId_idx"
  ON public."AssistantTask" (created_by_user_id);
CREATE INDEX "AssistantTask_analysisId_idx"
  ON public."AssistantTask" (analysis_id);
CREATE INDEX "AssistantTask_ticketId_idx"
  ON public."AssistantTask" (ticket_id);
CREATE INDEX "AssistantTask_conversationId_idx"
  ON public."AssistantTask" (conversation_id);

ALTER TABLE public."AssistantAnalysis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AssistantTask" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_assistant_analysis
  ON public."AssistantAnalysis"
  FOR ALL
  USING (company_id = (SELECT current_setting('app.current_company_id', true)))
  WITH CHECK (company_id = (SELECT current_setting('app.current_company_id', true)));

CREATE POLICY tenant_isolation_assistant_task
  ON public."AssistantTask"
  FOR ALL
  USING (company_id = (SELECT current_setting('app.current_company_id', true)))
  WITH CHECK (company_id = (SELECT current_setting('app.current_company_id', true)));
