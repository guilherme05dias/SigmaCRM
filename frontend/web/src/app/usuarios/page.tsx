import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { getUsers } from "@/lib/data";

export const dynamic = "force-dynamic";

const roleLabel = {
  gerente: "Gerente",
  atendente: "Atendente",
  tecnico: "Técnico"
};

export default async function UsersPage() {
  await requirePermission("route:users");

  const users = await getUsers();

  return (
    <>
      <PageHeader
        eyebrow="Acesso"
        title="Usuários e permissões"
        description="Perfis operacionais do sistema e acessos configurados para a equipe."
        action={<ButtonLink href="/usuarios/novo" variant="primary">Novo usuário</ButtonLink>}
      />

      <DataTable
        rows={users}
        columns={[
          {
            key: "username",
            label: "Login",
            render: (row) => (
              <div style={{ display: "grid", gap: 6 }}>
                <span>{String(row.username)}</span>
                <ButtonLink href={`/usuarios/${String(row.id)}/editar`}>Editar</ButtonLink>
              </div>
            )
          },
          { key: "fullName", label: "Nome" },
          { key: "role", label: "Perfil", render: (row) => <Badge tone="info">{roleLabel[row.role]}</Badge> },
          { key: "isActive", label: "Status", render: (row) => <Badge tone={row.isActive ? "success" : "muted"}>{row.isActive ? "Ativo" : "Inativo"}</Badge> }
        ]}
      />
    </>
  );
}
