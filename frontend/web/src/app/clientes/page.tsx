import { DataTable } from "@/components/data-table";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { hasPermission } from "@/lib/access-control";
import { requirePermission } from "@/lib/auth";
import { getClients } from "@/lib/data";
import { statusTone } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const currentUser = await requirePermission("route:clients");

  const clients = await getClients();

  return (
    <>
      <PageHeader
        eyebrow="Clientes"
        title="Base de clientes"
        description="Cadastro comercial e operacional dos clientes atendidos pela equipe técnica."
        action={
          hasPermission(currentUser.role, "client:create") ? (
            <ButtonLink href="/clientes/novo" variant="primary">Novo cliente</ButtonLink>
          ) : null
        }
      />

      <section className="metrics-grid">
        <MetricCard label="Clientes" value={clients.length} />
        <MetricCard label="Ativos" value={clients.filter((item) => item.status === "Ativo").length} />
        <MetricCard label="Em negociação" value={clients.filter((item) => item.status === "Em negociação").length} />
        <MetricCard label="Cidades" value={new Set(clients.map((item) => item.city)).size} />
      </section>

      <DataTable
        rows={clients}
        columns={[
          {
            key: "name",
            label: "Cliente",
            render: (row) => (
              <ButtonLink href={`/clientes/${String(row.id)}`}>
                {String(row.name)}
              </ButtonLink>
            )
          },
          { key: "company", label: "Empresa" },
          { key: "phone", label: "Telefone" },
          { key: "email", label: "E-mail" },
          { key: "city", label: "Cidade" },
          { key: "segment", label: "Segmento" },
          { key: "status", label: "Status", render: (row) => <Badge tone={statusTone(String(row.status))}>{String(row.status)}</Badge> }
        ]}
      />
    </>
  );
}
