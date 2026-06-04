import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth";
import { UserForm } from "./user-form";

export default async function NewUserPage() {
  await requirePermission("user:manage");

  return (
    <>
      <PageHeader
        eyebrow="Acesso"
        title="Novo usuário"
        description="Crie um acesso operacional com perfil padrão de permissões."
        action={<ButtonLink href="/usuarios">Voltar para usuários</ButtonLink>}
      />

      <section className="panel" style={{ padding: 18 }}>
        <UserForm />
      </section>
    </>
  );
}
