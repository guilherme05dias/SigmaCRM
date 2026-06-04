import { DataTable } from "@/components/data-table";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { getWhatsappConversations } from "@/lib/data";
import { formatDateTime, statusTone } from "@/lib/format";
import type { WhatsappConversation } from "@/lib/types";

export const dynamic = "force-dynamic";

type WhatsappPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    linked?: string;
  }>;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function filterConversations(
  conversations: WhatsappConversation[],
  filters: { q: string; status: string; linked: string }
) {
  const query = normalize(filters.q);

  return conversations.filter((conversation) => {
    const matchesQuery = query
      ? [conversation.contactName, conversation.contactNumber, conversation.linkedProtocol ?? ""].some((value) =>
          normalize(value).includes(query)
        )
      : true;
    const matchesStatus = filters.status ? conversation.status === filters.status : true;
    const matchesLinked =
      filters.linked === "sim"
        ? Boolean(conversation.linkedAttendanceId)
        : filters.linked === "nao"
          ? !conversation.linkedAttendanceId
          : true;

    return matchesQuery && matchesStatus && matchesLinked;
  });
}

export default async function WhatsappPage({ searchParams }: WhatsappPageProps) {
  await requirePermission("route:whatsapp");
  const params = await searchParams;
  const filters = {
    q: params.q ?? "",
    status: params.status ?? "",
    linked: params.linked ?? ""
  };

  const whatsappConversations = await getWhatsappConversations();
  const filteredConversations = filterConversations(whatsappConversations, filters);

  return (
    <>
      <PageHeader
        eyebrow="WhatsApp"
        title="Conversas vinculadas"
        description="Acompanhamento de conversas capturadas pelo bridge, com vínculo para atendimentos do CRM."
      />

      <section className="metrics-grid">
        <MetricCard label="Conversas" value={whatsappConversations.length} />
        <MetricCard label="Mensagens" value={whatsappConversations.reduce((sum, item) => sum + item.messageCount, 0)} />
        <MetricCard label="Resolvidas" value={whatsappConversations.filter((item) => item.status === "resolvido").length} />
        <MetricCard label="Vinculadas" value={whatsappConversations.filter((item) => item.linkedProtocol).length} />
      </section>

      <form action="/whatsapp" className="filter-panel">
        <label>
          Busca
          <input defaultValue={filters.q} name="q" placeholder="Contato, número ou protocolo" type="search" />
        </label>

        <label>
          Status
          <select defaultValue={filters.status} name="status">
            <option value="">Todos</option>
            <option value="aberto">aberto</option>
            <option value="em_andamento">em_andamento</option>
            <option value="resolvido">resolvido</option>
          </select>
        </label>

        <label>
          Vínculo
          <select defaultValue={filters.linked} name="linked">
            <option value="">Todos</option>
            <option value="sim">Com atendimento</option>
            <option value="nao">Sem atendimento</option>
          </select>
        </label>

        <div className="filter-actions">
          <Button type="submit" variant="primary">Filtrar</Button>
          <ButtonLink href="/whatsapp">Limpar</ButtonLink>
        </div>
      </form>

      <div className="result-summary">
        {filteredConversations.length} de {whatsappConversations.length} conversas exibidas.
      </div>

      <DataTable
        rows={filteredConversations}
        columns={[
          {
            key: "contactName",
            label: "Contato",
            render: (row) => (
              <ButtonLink href={`/whatsapp/${String(row.id)}`}>
                {String(row.contactName)}
              </ButtonLink>
            )
          },
          { key: "contactNumber", label: "Número" },
          { key: "status", label: "Status", render: (row) => <Badge tone={statusTone(String(row.status))}>{String(row.status)}</Badge> },
          { key: "messageCount", label: "Mensagens" },
          {
            key: "linkedProtocol",
            label: "Atendimento",
            render: (row) =>
              row.linkedAttendanceId ? (
                <ButtonLink href={`/atendimentos/${String(row.linkedAttendanceId)}`}>
                  {String(row.linkedProtocol)}
                </ButtonLink>
              ) : (
                "Sem vinculo"
              )
          },
          { key: "lastMessageAt", label: "Última mensagem", render: (row) => formatDateTime(String(row.lastMessageAt)) }
        ]}
      />

      {!filteredConversations.length ? (
        <div className="muted-box" style={{ marginTop: 14 }}>
          Nenhuma conversa encontrada para os filtros selecionados.
        </div>
      ) : null}
    </>
  );
}
