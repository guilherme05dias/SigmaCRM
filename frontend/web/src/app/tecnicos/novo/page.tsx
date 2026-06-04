import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { TechnicianCreateForm } from "./technician-form";

export default async function NewTechnicianPage() {
  await requirePermission("technician:create");

  return (
    <>
      <PageHeader
        eyebrow="Técnicos"
        title="Novo técnico"
        description="Cadastre um novo técnico para a equipe operacional. Em caso de bloqueio no Supabase, o formulario exibe o erro sem interromper a tela."
        action={<ButtonLink href="/tecnicos">Voltar para a equipe</ButtonLink>}
      />

      <section className="panel" style={{ padding: 18 }}>
        <TechnicianCreateForm />
      </section>
    </>
  );
}
