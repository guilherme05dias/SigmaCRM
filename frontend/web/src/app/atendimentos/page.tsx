import { DataTable } from "@/components/data-table";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { hasPermission } from "@/lib/access-control";
import { requirePermission } from "@/lib/auth";
import { getAttendances } from "@/lib/data";
import { formatDateTime, statusTone } from "@/lib/format";
import type { Attendance } from "@/lib/types";

export const dynamic = "force-dynamic";

type AttendancesPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    priority?: string;
  }>;
};

const statusOptions: Array<Attendance["status"]> = [
  "Novo",
  "Em andamento",
  "Aguardando cliente",
  "Aguardando retorno",
  "Concluído",
  "Cancelado"
];

const priorityOptions: Array<Attendance["priority"]> = ["Baixa", "Média", "Alta", "Crítica"];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function filterAttendances(
  attendances: Attendance[],
  filters: { q: string; status: string; priority: string }
) {
  const query = normalize(filters.q);

  return attendances.filter((attendance) => {
    const matchesQuery = query
      ? [
          attendance.protocol,
          attendance.title,
          attendance.client,
          attendance.technician,
          attendance.nextAction
        ].some((value) => normalize(value).includes(query))
      : true;

    const matchesStatus = filters.status ? attendance.status === filters.status : true;
    const matchesPriority = filters.priority ? attendance.priority === filters.priority : true;

    return matchesQuery && matchesStatus && matchesPriority;
  });
}

export default async function AttendancesPage({ searchParams }: AttendancesPageProps) {
  const currentUser = await requirePermission("route:attendances");
  const params = await searchParams;
  const filters = {
    q: params.q ?? "",
    status: params.status ?? "",
    priority: params.priority ?? ""
  };

  const attendances = await getAttendances();
  const filteredAttendances = filterAttendances(attendances, filters);
  const open = attendances.filter((item) => item.status !== "Concluído").length;

  return (
    <>
      <PageHeader
        eyebrow="Atendimentos"
        title="Fila de chamados"
        description="Tabela principal da operação: acompanhe status, prioridade, cliente, técnico e próximos passos."
        action={
          hasPermission(currentUser.role, "attendance:create") ? (
            <ButtonLink href="/atendimentos/novo" variant="primary">Registrar atendimento</ButtonLink>
          ) : null
        }
      />

      <section className="metrics-grid">
        <MetricCard label="Total" value={attendances.length} />
        <MetricCard label="Em aberto" value={open} />
        <MetricCard label="Alta prioridade" value={attendances.filter((item) => item.priority === "Alta" || item.priority === "Crítica").length} />
        <MetricCard label="Horas registradas" value={attendances.reduce((sum, item) => sum + item.timeSpentHours, 0)} />
      </section>

      <form action="/atendimentos" className="filter-panel">
        <label>
          Busca
          <input
            defaultValue={filters.q}
            name="q"
            placeholder="Protocolo, cliente, técnico ou título"
            type="search"
          />
        </label>

        <label>
          Status
          <select defaultValue={filters.status} name="status">
            <option value="">Todos</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <label>
          Prioridade
          <select defaultValue={filters.priority} name="priority">
            <option value="">Todas</option>
            {priorityOptions.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>

        <div className="filter-actions">
          <Button type="submit" variant="primary">Filtrar</Button>
          <ButtonLink href="/atendimentos">Limpar</ButtonLink>
        </div>
      </form>

      <div className="result-summary">
        {filteredAttendances.length} de {attendances.length} atendimentos exibidos.
      </div>

      <DataTable
        rows={filteredAttendances}
        columns={[
          { key: "protocol", label: "Protocolo" },
          {
            key: "title",
            label: "Título",
            render: (row) => (
              <div style={{ display: "grid", gap: 6 }}>
                <span>{String(row.title)}</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <ButtonLink href={`/atendimentos/${String(row.id)}`}>Ver detalhe</ButtonLink>
                  <ButtonLink href={`/atendimentos/${String(row.id)}/editar`}>Editar</ButtonLink>
                </div>
              </div>
            )
          },
          { key: "client", label: "Cliente" },
          { key: "technician", label: "Técnico" },
          { key: "status", label: "Status", render: (row) => <Badge tone={statusTone(String(row.status))}>{String(row.status)}</Badge> },
          { key: "priority", label: "Prioridade", render: (row) => <Badge tone={statusTone(String(row.priority))}>{String(row.priority)}</Badge> },
          { key: "openedAt", label: "Abertura", render: (row) => formatDateTime(String(row.openedAt)) },
          { key: "nextAction", label: "Próxima ação" }
        ]}
      />

      {!filteredAttendances.length ? (
        <div className="muted-box" style={{ marginTop: 14 }}>
          Nenhum atendimento encontrado para os filtros selecionados.
        </div>
      ) : null}
    </>
  );
}
