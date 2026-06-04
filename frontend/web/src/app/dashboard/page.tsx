import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { getAttendances, getClients, getTechnicians } from "@/lib/data";
import { formatDateTime, statusTone } from "@/lib/format";
import { requirePermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requirePermission("route:dashboard");

  const [attendances, clients, technicians] = await Promise.all([
    getAttendances(),
    getClients(),
    getTechnicians()
  ]);
  const completed = attendances.filter((item) => item.status === "Concluído").length;
  const pending = attendances.length - completed;
  const recent = attendances.slice(0, 5);

  return (
    <>
      <PageHeader
        eyebrow="Painel operacional"
        title="Dashboard"
        description="Visão executiva da operação técnica, com volume de chamados, pendências, clientes e equipe."
        action={<ButtonLink href="/atendimentos" variant="primary">Novo atendimento</ButtonLink>}
      />

      <section className="metrics-grid">
        <MetricCard label="Atendimentos" value={attendances.length} />
        <MetricCard label="Concluídos" value={completed} />
        <MetricCard label="Pendentes" value={pending} />
        <MetricCard label="Clientes" value={clients.length} />
      </section>

      <section className="split-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>Atendimentos recentes</h2>
            <ButtonLink href="/atendimentos">Ver lista</ButtonLink>
          </div>
          <DataTable
            rows={recent}
            columns={[
              { key: "protocol", label: "Protocolo" },
              {
                key: "title",
                label: "Título",
                render: (row) => (
                  <ButtonLink href={`/atendimentos/${String(row.id)}`}>
                    {String(row.title)}
                  </ButtonLink>
                )
              },
              { key: "client", label: "Cliente" },
              { key: "status", label: "Status", render: (row) => <Badge tone={statusTone(String(row.status))}>{String(row.status)}</Badge> },
              { key: "openedAt", label: "Abertura", render: (row) => formatDateTime(String(row.openedAt)) }
            ]}
          />
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Equipe ativa</h2>
            <Badge tone="info">{technicians.filter((item) => item.active).length} ativos</Badge>
          </div>
          <DataTable
            rows={technicians}
            columns={[
              { key: "name", label: "Técnico" },
              { key: "specialty", label: "Especialidade" },
              { key: "active", label: "Status", render: (row) => <Badge tone={row.active ? "success" : "muted"}>{row.active ? "Ativo" : "Inativo"}</Badge> }
            ]}
          />
        </div>
      </section>
    </>
  );
}
