import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { hasPermission } from "@/lib/access-control";
import { requirePermission } from "@/lib/auth";
import { getAttendancesByClientId, getClientById } from "@/lib/data";
import { formatDateTime, statusTone } from "@/lib/format";

type ClientDetailPageProps = {
  params: Promise<{ id: string }>;
};

function DetailItem({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value || "Nao informado"}</strong>
    </div>
  );
}

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const currentUser = await requirePermission("route:clients");

  const { id } = await params;
  const clientId = Number(id);

  if (!Number.isInteger(clientId) || clientId <= 0) {
    notFound();
  }

  const [clientResult, attendances] = await Promise.all([
    getClientById(clientId),
    getAttendancesByClientId(clientId)
  ]);

  if (!clientResult.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Clientes"
          title="Cliente indisponivel"
          description="Nao foi possivel carregar os dados deste cliente."
          action={<ButtonLink href="/clientes">Voltar para clientes</ButtonLink>}
        />

        <section className="panel detail-panel">
          <div className="inline-error">{clientResult.message}</div>
        </section>
      </>
    );
  }

  const { client } = clientResult;
  const completed = attendances.filter((item) => item.status === "Concluído").length;
  const open = attendances.length - completed;

  return (
    <>
      <PageHeader
        eyebrow="Cliente"
        title={client.name}
        description={client.company}
        action={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {hasPermission(currentUser.role, "client:create") ? (
              <ButtonLink href={`/clientes/${client.id}/editar`} variant="primary">
                Editar cliente
              </ButtonLink>
            ) : null}
            <ButtonLink href="/clientes">Voltar para clientes</ButtonLink>
          </div>
        }
      />

      <section className="metrics-grid">
        <MetricCard label="Atendimentos" value={attendances.length} />
        <MetricCard label="Em aberto" value={open} />
        <MetricCard label="Concluídos" value={completed} />
        <MetricCard label="Horas" value={attendances.reduce((sum, item) => sum + item.timeSpentHours, 0)} />
      </section>

      <section className="detail-layout">
        <div className="panel detail-panel">
          <div className="detail-header">
            <div>
              <span className="detail-kicker">Cadastro</span>
              <div className="detail-status-row">
                <Badge tone={statusTone(client.status)}>{client.status}</Badge>
                <Badge tone="info">{client.segment}</Badge>
              </div>
            </div>
          </div>

          <div className="detail-grid">
            <DetailItem label="Empresa" value={client.company} />
            <DetailItem label="Contato" value={client.name} />
            <DetailItem label="Telefone" value={client.phone} />
            <DetailItem label="E-mail" value={client.email} />
            <DetailItem label="Cidade" value={client.city} />
            <DetailItem label="Segmento" value={client.segment} />
          </div>
        </div>

        <aside className="panel detail-panel">
          <div className="panel-header compact-panel-header">
            <h2>Operação</h2>
          </div>
          <div className="detail-grid single-column">
            <DetailItem label="Último atendimento" value={attendances[0] ? formatDateTime(attendances[0].openedAt) : undefined} />
            <DetailItem label="Prioridade mais recente" value={attendances[0]?.priority} />
            <DetailItem label="Status mais recente" value={attendances[0]?.status} />
          </div>
        </aside>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Histórico de atendimentos</h2>
          <span className="result-summary" style={{ margin: 0 }}>
            {attendances.length} registros
          </span>
        </div>

        <DataTable
          rows={attendances}
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
            { key: "technician", label: "Técnico" },
            { key: "status", label: "Status", render: (row) => <Badge tone={statusTone(String(row.status))}>{String(row.status)}</Badge> },
            { key: "priority", label: "Prioridade", render: (row) => <Badge tone={statusTone(String(row.priority))}>{String(row.priority)}</Badge> },
            { key: "openedAt", label: "Abertura", render: (row) => formatDateTime(String(row.openedAt)) }
          ]}
        />

        {!attendances.length ? (
          <div className="muted-box" style={{ margin: 14 }}>
            Nenhum atendimento registrado para este cliente.
          </div>
        ) : null}
      </section>
    </>
  );
}
