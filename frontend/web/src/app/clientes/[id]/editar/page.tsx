import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth";
import { getClientById } from "@/lib/data";
import { ClientCreateForm } from "../../novo/client-form";

type EditClientPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditClientPage({ params }: EditClientPageProps) {
  await requirePermission("client:create");

  const { id } = await params;
  const clientId = Number(id);

  if (!Number.isInteger(clientId) || clientId <= 0) {
    notFound();
  }

  const result = await getClientById(clientId);

  if (!result.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Clientes"
          title="Editar cliente"
          description="Nao foi possivel carregar os dados do cliente."
          action={<ButtonLink href="/clientes">Voltar para clientes</ButtonLink>}
        />

        <section className="panel detail-panel">
          <div className="inline-error">{result.message}</div>
        </section>
      </>
    );
  }

  const { client } = result;

  return (
    <>
      <PageHeader
        eyebrow="Clientes"
        title={`Editar ${client.name}`}
        description="Atualize os dados cadastrais e operacionais do cliente."
        action={<ButtonLink href={`/clientes/${client.id}`}>Voltar ao cliente</ButtonLink>}
      />

      <section className="panel" style={{ padding: 18 }}>
        <ClientCreateForm
          clientId={client.id}
          initialValues={{
            name: client.name,
            company: client.company,
            phone: client.phone,
            email: client.email,
            city: client.city,
            segment: client.segment,
            status: client.status
          }}
          mode="edit"
        />
      </section>
    </>
  );
}
