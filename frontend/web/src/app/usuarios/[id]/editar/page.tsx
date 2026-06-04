import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth";
import { getUserById } from "@/lib/data";
import { UserForm } from "../../novo/user-form";

type EditUserPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditUserPage({ params }: EditUserPageProps) {
  await requirePermission("user:manage");

  const { id } = await params;
  const userId = Number(id);

  if (!Number.isInteger(userId) || userId <= 0) {
    notFound();
  }

  const result = await getUserById(userId);

  if (!result.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Acesso"
          title="Editar usuário"
          description="Nao foi possivel carregar os dados do usuario."
          action={<ButtonLink href="/usuarios">Voltar para usuários</ButtonLink>}
        />

        <section className="panel detail-panel">
          <div className="inline-error">{result.message}</div>
        </section>
      </>
    );
  }

  const { user } = result;

  return (
    <>
      <PageHeader
        eyebrow="Acesso"
        title={`Editar ${user.fullName}`}
        description="Atualize perfil, status ou senha do usuário."
        action={<ButtonLink href="/usuarios">Voltar para usuários</ButtonLink>}
      />

      <section className="panel" style={{ padding: 18 }}>
        <UserForm
          initialValues={{
            username: user.username,
            fullName: user.fullName,
            role: user.role,
            password: "",
            isActive: user.isActive ? "true" : "false"
          }}
          mode="edit"
          userId={user.id}
        />
      </section>
    </>
  );
}
