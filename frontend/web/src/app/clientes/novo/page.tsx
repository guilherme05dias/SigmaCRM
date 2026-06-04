import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { ClientCreateForm } from "./client-form";

export default async function NewClientPage() {
  await requirePermission("client:create");

  return (
    <>
      <PageHeader
        eyebrow="Clientes"
        title="Novo cliente"
        description="Cadastre um novo cliente para uso comercial e operacional. Em caso de bloqueio no Supabase, o formulario exibe o erro sem interromper a tela."
        action={<ButtonLink href="/clientes">Voltar para a base</ButtonLink>}
      />

      <section className="panel" style={{ padding: 18 }}>
        <ClientCreateForm />
      </section>
    </>
  );
}
