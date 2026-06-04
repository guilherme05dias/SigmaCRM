import { DataTable } from "@/components/data-table";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { getAttendances } from "@/lib/data";
import { statusTone } from "@/lib/format";

export const dynamic = "force-dynamic";

type DailySummaryPageProps = {
  searchParams: Promise<{ date?: string }>;
};

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

export default async function DailySummaryPage({ searchParams }: DailySummaryPageProps) {
  await requirePermission("route:summary");

  const { date } = await searchParams;
  const selectedDate = date || todayDateInput();
  const attendances = await getAttendances();
  const todayRows = attendances.filter((item) => item.openedAt.startsWith(selectedDate));
  const completed = todayRows.filter((item) => item.status === "Concluído").length;

  return (
    <>
      <PageHeader
        eyebrow="Resumo"
        title="Resumo por data"
        description={`Visão operacional de ${selectedDate}, com volume, pendências, técnicos e atendimentos registrados.`}
      />

      <form action="/resumo" className="filter-panel">
        <label>
          Data
          <input defaultValue={selectedDate} name="date" type="date" />
        </label>
        <div className="filter-actions">
          <Button type="submit" variant="primary">Aplicar</Button>
          <ButtonLink href={`/resumo/export?date=${encodeURIComponent(selectedDate)}`}>Exportar CSV</ButtonLink>
        </div>
      </form>

      <section className="metrics-grid">
        <MetricCard label="Atendimentos do dia" value={todayRows.length} />
        <MetricCard label="Concluídos" value={completed} />
        <MetricCard label="Pendentes" value={todayRows.length - completed} />
        <MetricCard label="Técnicos envolvidos" value={new Set(todayRows.map((item) => item.technician)).size} />
      </section>

      <DataTable
        rows={todayRows}
        columns={[
          { key: "protocol", label: "Protocolo" },
          { key: "title", label: "Título" },
          { key: "technician", label: "Técnico" },
          { key: "client", label: "Cliente" },
          { key: "status", label: "Status", render: (row) => <Badge tone={statusTone(String(row.status))}>{String(row.status)}</Badge> },
          { key: "resolution", label: "Resolução" }
        ]}
      />
    </>
  );
}
