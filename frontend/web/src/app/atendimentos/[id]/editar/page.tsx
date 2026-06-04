import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { getAttendanceForEdit, getAttendanceLogs, getClients, getTechnicians } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { AttendanceForm } from "../../novo/attendance-form";

type EditAttendancePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditAttendancePage({ params }: EditAttendancePageProps) {
  await requirePermission("attendance:update");

  const { id } = await params;
  const attendanceId = Number(id);

  if (!Number.isInteger(attendanceId) || attendanceId <= 0) {
    notFound();
  }

  const [attendanceResult, clients, technicians, logs] = await Promise.all([
    getAttendanceForEdit(attendanceId),
    getClients(),
    getTechnicians(),
    getAttendanceLogs(attendanceId)
  ]);

  if (!attendanceResult.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Atendimentos"
          title="Editar atendimento"
          description="Nao foi possivel carregar os dados do atendimento para edicao."
          action={<ButtonLink href="/atendimentos">Voltar para a fila</ButtonLink>}
        />

        <section className="panel" style={{ padding: 18 }}>
          <div
            style={{
              borderRadius: 10,
              border: "1px solid #f1b4b4",
              background: "#fde8e8",
              color: "#b42318",
              padding: "12px 14px",
              fontWeight: 700
            }}
          >
            {attendanceResult.message}
          </div>
        </section>
      </>
    );
  }

  const { record } = attendanceResult;

  return (
    <>
      <PageHeader
        eyebrow="Atendimentos"
        title={`Editar atendimento ${record.protocol}`}
        description={`Atualize os dados operacionais do chamado. Status atual: ${record.status}.`}
        action={<ButtonLink href="/atendimentos">Voltar para a fila</ButtonLink>}
      />

      <section className="panel" style={{ padding: 18 }}>
        <AttendanceForm
          attendanceId={record.id}
          clients={clients}
          initialValues={record.values}
          mode="edit"
          technicians={technicians}
        />
      </section>

      <section className="panel" style={{ padding: 18, display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <strong style={{ fontSize: 18 }}>Log de alterações</strong>
          <span style={{ color: "#657384" }}>
            Histórico automático das mudanças feitas neste atendimento.
          </span>
        </div>

        {logs.length ? (
          <div style={{ display: "grid", gap: 12 }}>
            {logs.map((log) => (
              <article
                key={log.id}
                style={{
                  border: "1px solid #dce3ea",
                  borderRadius: 12,
                  padding: "14px 16px",
                  background: "#fff"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <strong>{log.message}</strong>
                  <span style={{ color: "#657384", fontSize: 13 }}>{formatDateTime(log.createdAt)}</span>
                </div>
                <div style={{ marginTop: 8, color: "#657384", fontSize: 13 }}>
                  {log.actorName} ({log.actorRole})
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div
            style={{
              borderRadius: 10,
              border: "1px solid #dce3ea",
              background: "#f8fafc",
              color: "#657384",
              padding: "12px 14px"
            }}
          >
            Nenhuma alteração registrada ainda para este atendimento.
          </div>
        )}
      </section>
    </>
  );
}
