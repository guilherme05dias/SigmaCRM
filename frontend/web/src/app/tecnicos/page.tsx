import { DataTable } from "@/components/data-table";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { hasPermission } from "@/lib/access-control";
import { requirePermission } from "@/lib/auth";
import { getTechnicians } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function TechniciansPage() {
  const currentUser = await requirePermission("route:technicians");

  const technicians = await getTechnicians();

  return (
    <>
      <PageHeader
        eyebrow="Técnicos"
        title="Equipe técnica"
        description="Gestão de disponibilidade, contato e especialidade da equipe responsável pelos atendimentos."
        action={
          hasPermission(currentUser.role, "technician:create") ? (
            <ButtonLink href="/tecnicos/novo" variant="primary">Novo técnico</ButtonLink>
          ) : null
        }
      />

      <section className="metrics-grid">
        <MetricCard label="Técnicos" value={technicians.length} />
        <MetricCard label="Ativos" value={technicians.filter((item) => item.active).length} />
        <MetricCard label="Inativos" value={technicians.filter((item) => !item.active).length} />
        <MetricCard label="Especialidades" value={new Set(technicians.map((item) => item.specialty)).size} />
      </section>

      <DataTable
        rows={technicians}
        columns={[
          {
            key: "name",
            label: "Nome",
            render: (row) => (
              <div style={{ display: "grid", gap: 6 }}>
                <span>{String(row.name)}</span>
                {hasPermission(currentUser.role, "technician:create") ? (
                  <ButtonLink href={`/tecnicos/${String(row.id)}/editar`}>Editar</ButtonLink>
                ) : null}
              </div>
            )
          },
          { key: "specialty", label: "Especialidade" },
          { key: "phone", label: "Telefone" },
          { key: "email", label: "E-mail" },
          { key: "active", label: "Status", render: (row) => <Badge tone={row.active ? "success" : "muted"}>{row.active ? "Ativo" : "Inativo"}</Badge> }
        ]}
      />
    </>
  );
}
