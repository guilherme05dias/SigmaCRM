-- Configure an explicit tenant-owned entry department for new conversations.
ALTER TABLE public."Company"
  ADD COLUMN IF NOT EXISTS default_department_id TEXT;

-- Preserve and reuse an existing support department; create it only when the
-- active company does not have one yet.
INSERT INTO public."Department" (
  id,
  company_id,
  nome,
  descricao,
  ativo,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid()::text,
  company.id,
  'Suporte Técnico',
  'Setor padrão para novos atendimentos',
  true,
  now(),
  now()
FROM public."Company" AS company
WHERE company.ativo = true
  AND NOT EXISTS (
    SELECT 1
    FROM public."Department" AS department
    WHERE department.company_id = company.id
      AND lower(trim(department.nome)) IN ('suporte técnico', 'suporte tecnico')
  );

UPDATE public."Company" AS company
SET default_department_id = (
  SELECT department.id
  FROM public."Department" AS department
  WHERE department.company_id = company.id
    AND lower(trim(department.nome)) IN ('suporte técnico', 'suporte tecnico')
  ORDER BY department.ativo DESC, department.created_at ASC
  LIMIT 1
)
WHERE company.default_department_id IS NULL;

ALTER TABLE public."Company"
  DROP CONSTRAINT IF EXISTS "Company_default_department_id_fkey";

ALTER TABLE public."Company"
  ADD CONSTRAINT "Company_default_department_id_fkey"
  FOREIGN KEY (default_department_id)
  REFERENCES public."Department"(id)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Company_defaultDepartmentId_idx"
  ON public."Company" (default_department_id);

-- Bring current work into the support queue without rewriting closed history.
UPDATE public."Conversation" AS conversation
SET
  "departmentId" = company.default_department_id,
  "updatedAt" = now()
FROM public."Company" AS company
WHERE conversation."companyId" = company.id
  AND conversation."departmentId" IS NULL
  AND conversation.status <> 'CLOSED'::public."ConversationStatus"
  AND company.default_department_id IS NOT NULL;
