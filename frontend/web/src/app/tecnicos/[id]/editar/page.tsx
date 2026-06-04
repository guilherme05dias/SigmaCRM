import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth";
import { getTechnicianById } from "@/lib/data";
import { TechnicianCreateForm } from "../../novo/technician-form";

type EditTechnicianPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditTechnicianPage({ params }: EditTechnicianPageProps) {
  await requirePermission("technician:create");

  const { id } = await params;
  const technicianId = Number(id);

  if (!Number.isInteger(technicianId) || technicianId <= 0) {
    notFound();
  }

  const result = await getTechnicianById(technicianId);

  if (!result.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Técnicos"
          title="Editar técnico"
          description="Nao foi possivel carregar os dados do tecnico."
          action={<ButtonLink href="/tecnicos">Voltar para tecnicos</ButtonLink>}
        />

        <section className="panel detail-panel">
          <div className="inline-error">{result.message}</div>
        </section>
      </>
    );
  }

  const { technician } = result;

  return (
    <>
      <PageHeader
        eyebrow="Técnicos"
        title={`Editar ${technician.name}`}
        description="Atualize os dados de contato, especialidade e disponibilidade do técnico."
        action={<ButtonLink href="/tecnicos">Voltar para tecnicos</ButtonLink>}
      />

      <section className="panel" style={{ padding: 18 }}>
        <TechnicianCreateForm
          initialValues={{
            name: technician.name,
            specialty: technician.specialty,
            phone: technician.phone,
            email: technician.email,
            active: technician.active ? "true" : "false"
          }}
          mode="edit"
          technicianId={technician.id}
        />
      </section>
    </>
  );
}
