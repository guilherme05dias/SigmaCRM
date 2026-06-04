import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { hasPermission } from "@/lib/access-control";
import { requirePermission } from "@/lib/auth";
import { getAttendances, getClients, getTechnicians, getWhatsappConversationById, getWhatsappMessages } from "@/lib/data";
import { formatDateTime, statusTone } from "@/lib/format";
import { createAttendanceFromConversationAction, linkConversationAction, unlinkConversationAction } from "./actions";

type WhatsappConversationPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function WhatsappConversationPage({ params, searchParams }: WhatsappConversationPageProps) {
  const currentUser = await requirePermission("route:whatsapp");

  const { id } = await params;
  const { error } = await searchParams;
  const conversationId = Number(id);

  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    notFound();
  }

  const [conversationResult, messages, attendances, clients, technicians] = await Promise.all([
    getWhatsappConversationById(conversationId),
    getWhatsappMessages(conversationId),
    getAttendances(),
    getClients(),
    getTechnicians()
  ]);

  if (!conversationResult.ok) {
    return (
      <>
        <PageHeader
          eyebrow="WhatsApp"
          title="Conversa indisponivel"
          description="Nao foi possivel carregar esta conversa."
          action={<ButtonLink href="/whatsapp">Voltar para conversas</ButtonLink>}
        />

        <section className="panel detail-panel">
          <div className="inline-error">{conversationResult.message}</div>
        </section>
      </>
    );
  }

  const { conversation } = conversationResult;
  const canCreateAttendance = hasPermission(currentUser.role, "attendance:create");

  return (
    <>
      <PageHeader
        eyebrow="WhatsApp"
        title={conversation.contactName}
        description={`${conversation.contactNumber} - ${conversation.messageCount} mensagens registradas`}
        action={<ButtonLink href="/whatsapp">Voltar para conversas</ButtonLink>}
      />

      {error ? (
        <div className="inline-error" style={{ marginBottom: 18 }}>
          Nao foi possivel concluir a acao solicitada. Confira os campos e se `SUPABASE_SERVICE_ROLE_KEY` esta configurada.
        </div>
      ) : null}

      <section className="detail-layout">
        <div className="panel detail-panel">
          <div className="detail-header">
            <div>
              <span className="detail-kicker">Conversa</span>
              <div className="detail-status-row">
                <Badge tone={statusTone(conversation.status)}>{conversation.status}</Badge>
                {conversation.linkedProtocol ? <Badge tone="info">{conversation.linkedProtocol}</Badge> : <Badge tone="muted">Sem atendimento</Badge>}
              </div>
            </div>
            {conversation.linkedAttendanceId ? (
              <ButtonLink href={`/atendimentos/${conversation.linkedAttendanceId}`} variant="primary">
                Abrir atendimento
              </ButtonLink>
            ) : null}
          </div>

          {messages.length ? (
            <div className="whatsapp-thread">
              {messages.map((message) => (
                <article className={`message-bubble message-bubble-${message.direction}`} key={message.id}>
                  <p>{message.body}</p>
                  <time>{formatDateTime(message.timestamp)}</time>
                </article>
              ))}
            </div>
          ) : (
            <div className="muted-box">
              Nenhuma mensagem esta disponivel para esta conversa. Se houver mensagens no Supabase, configure `SUPABASE_SERVICE_ROLE_KEY` no servidor para leitura segura.
            </div>
          )}
        </div>

        <aside className="panel detail-panel">
          <div className="panel-header compact-panel-header">
            <h2>Resumo</h2>
          </div>

          <div className="detail-grid single-column">
            <div className="detail-item">
              <span>Contato</span>
              <strong>{conversation.contactName}</strong>
            </div>
            <div className="detail-item">
              <span>Numero</span>
              <strong>{conversation.contactNumber}</strong>
            </div>
            <div className="detail-item">
              <span>Ultima mensagem</span>
              <strong>{formatDateTime(conversation.lastMessageAt)}</strong>
            </div>
          </div>

          <div className="detail-section">
            <span>Vinculo com atendimento</span>
            {conversation.linkedAttendanceId ? (
              <form action={unlinkConversationAction.bind(null, conversation.id)} className="stack-form">
                <p>{conversation.linkedProtocol}</p>
                <Button type="submit">Desvincular conversa</Button>
              </form>
            ) : (
              <form action={linkConversationAction.bind(null, conversation.id)} className="stack-form">
                <select name="attendanceId" required>
                  <option value="">Selecione um atendimento</option>
                  {attendances.map((attendance) => (
                    <option key={attendance.id} value={attendance.id}>
                      {attendance.protocol} - {attendance.title}
                    </option>
                  ))}
                </select>
                <Button disabled={!attendances.length} type="submit">Vincular</Button>
              </form>
            )}
          </div>

          {canCreateAttendance && !conversation.linkedAttendanceId ? (
            <div className="detail-section">
              <span>Criar atendimento pela conversa</span>
              <form action={createAttendanceFromConversationAction.bind(null, conversation.id)} className="stack-form">
                <input
                  defaultValue={`WhatsApp - ${conversation.contactName}`}
                  name="title"
                  placeholder="Titulo do atendimento"
                  required
                />
                <select name="clientId" required>
                  <option value="">Cliente</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
                <select name="technicianId" required>
                  <option value="">Tecnico</option>
                  {technicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>
                      {technician.name}
                    </option>
                  ))}
                </select>
                <select defaultValue="Média" name="priority">
                  <option value="Baixa">Baixa</option>
                  <option value="Média">Média</option>
                  <option value="Alta">Alta</option>
                  <option value="Crítica">Crítica</option>
                </select>
                <textarea
                  defaultValue="Responder cliente e qualificar a solicitação recebida pelo WhatsApp."
                  name="nextAction"
                  required
                  rows={3}
                />
                <Button disabled={!clients.length || !technicians.length} type="submit" variant="primary">
                  Criar e vincular
                </Button>
              </form>
            </div>
          ) : null}
        </aside>
      </section>
    </>
  );
}
