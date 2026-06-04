import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { getClients, getTechnicians } from "@/lib/data";
import { AttendanceForm } from "./attendance-form";

export default async function NewAttendancePage() {
  await requirePermission("attendance:create");

  const [clients, technicians] = await Promise.all([getClients(), getTechnicians()]);

  return (
    <>
      <PageHeader
        eyebrow="Atendimentos"
        title="Novo atendimento"
        description="Abra um novo chamado vinculando cliente e tecnico ja cadastrados. Em caso de bloqueio no Supabase, o formulario exibe o erro sem interromper a tela."
        action={<ButtonLink href="/atendimentos">Voltar para a fila</ButtonLink>}
      />

      <section className="panel" style={{ padding: 18 }}>
        <AttendanceForm
          clients={clients}
          technicians={technicians}
          mode="create"
        />
      </section>
    </>
  );
}
