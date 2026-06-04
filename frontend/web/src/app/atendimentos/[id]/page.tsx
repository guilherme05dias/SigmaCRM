import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { hasPermission } from "@/lib/access-control";
import { requirePermission } from "@/lib/auth";
import { getAttendanceById, getAttendanceLogs, getWhatsappConversationForAttendance, getWhatsappMessages } from "@/lib/data";
import { formatDateTime, statusTone } from "@/lib/format";
import { updateAttendanceStatusAction } from "./actions";

type AttendanceDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

const quickStatuses = ["Em andamento", "Aguardando cliente", "Concluído", "Cancelado"] as const;

function DetailItem({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value || "Nao informado"}</strong>
    </div>
  );
}

export default async function AttendanceDetailPage({ params, searchParams }: AttendanceDetailPageProps) {
  const currentUser = await requirePermission("route:attendances");
  const { id } = await params;
  const { error } = await searchParams;
  const attendanceId = Number(id);

  if (!Number.isInteger(attendanceId) || attendanceId <= 0) {
    notFound();
  }

  const [attendanceResult, logs, whatsappConversation] = await Promise.all([
    getAttendanceById(attendanceId),
    getAttendanceLogs(attendanceId),
    getWhatsappConversationForAttendance(attendanceId)
  ]);

  if (!attendanceResult.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Atendimentos"
          title="Atendimento indisponivel"
          description="Nao foi possivel carregar os dados deste atendimento."
          action={<ButtonLink href="/atendimentos">Voltar para a fila</ButtonLink>}
        />

        <section className="panel detail-panel">
          <div className="inline-error">{attendanceResult.message}</div>
        </section>
      </>
    );
  }

  const { attendance } = attendanceResult;
  const canUpdate = hasPermission(currentUser.role, "attendance:update");
  const whatsappMessages = whatsappConversation ? await getWhatsappMessages(whatsappConversation.id) : [];

  return (
    <>
      <PageHeader
        eyebrow="Atendimento"
        title={attendance.protocol}
        description={attendance.title}
        action={<ButtonLink href="/atendimentos">Voltar para a fila</ButtonLink>}
      />

      {error ? (
        <div className="inline-error" style={{ marginBottom: 18 }}>
          Nao foi possivel aplicar a acao solicitada. Tente novamente ou confira as permissoes do Supabase.
        </div>
      ) : null}

      <section className="detail-layout">
        <div className="panel detail-panel">
          <div className="detail-header">
            <div>
              <span className="detail-kicker">Status atual</span>
              <div className="detail-status-row">
                <Badge tone={statusTone(attendance.status)}>{attendance.status}</Badge>
                <Badge tone={statusTone(attendance.priority)}>{attendance.priority}</Badge>
              </div>
            </div>
            <ButtonLink href={`/atendimentos/${attendance.id}/editar`} variant="primary">
              Editar atendimento
            </ButtonLink>
          </div>

          <div className="detail-grid">
            <DetailItem label="Cliente" value={attendance.client} />
            <DetailItem label="Telefone do cliente" value={attendance.clientPhone} />
            <DetailItem label="Tecnico responsavel" value={attendance.technician} />
            <DetailItem label="Canal" value={attendance.channel} />
            <DetailItem label="Tipo" value={attendance.serviceType} />
            <DetailItem label="Abertura" value={formatDateTime(attendance.openedAt)} />
            <DetailItem label="Prazo" value={attendance.dueDate ? formatDateTime(attendance.dueDate) : undefined} />
            <DetailItem label="Horas registradas" value={`${attendance.timeSpentHours}h`} />
          </div>

          <div className="detail-section">
            <span>Proxima acao</span>
            <p>{attendance.nextAction || "Nenhuma proxima acao registrada."}</p>
          </div>

          <div className="detail-section">
            <span>Resolucao</span>
            <p>{attendance.resolution || "Ainda sem resolucao registrada."}</p>
          </div>
        </div>

        <aside className="panel detail-panel">
          <div className="panel-header compact-panel-header">
            <h2>Acoes rapidas</h2>
          </div>

          <div className="quick-actions">
            {canUpdate ? (
              quickStatuses.map((status) => (
                <form action={updateAttendanceStatusAction.bind(null, attendance.id)} key={status}>
                  <input name="status" type="hidden" value={status} />
                  <Button disabled={attendance.status === status} type="submit" variant={status === "Concluído" ? "primary" : "secondary"}>
                    {status}
                  </Button>
                </form>
              ))
            ) : (
              <div className="muted-box">Seu perfil pode visualizar este atendimento, mas nao alterar o status.</div>
            )}
          </div>
        </aside>
      </section>

      {whatsappConversation ? (
        <section className="panel detail-panel">
          <div className="panel-header compact-panel-header">
            <h2>Mensagens do WhatsApp</h2>
            <ButtonLink href={`/whatsapp/${whatsappConversation.id}`}>Abrir conversa</ButtonLink>
          </div>

          {whatsappMessages.length ? (
            <div className="whatsapp-thread compact-thread">
              {whatsappMessages.slice(-6).map((message) => (
                <article className={`message-bubble message-bubble-${message.direction}`} key={message.id}>
                  <p>{message.body}</p>
                  <time>{formatDateTime(message.timestamp)}</time>
                </article>
              ))}
            </div>
          ) : (
            <div className="muted-box">
              Conversa vinculada, mas as mensagens ainda nao estao disponiveis para leitura.
            </div>
          )}
        </section>
      ) : null}

      <section className="panel detail-panel">
        <div className="panel-header compact-panel-header">
          <h2>Log de alteracoes</h2>
        </div>

        {logs.length ? (
          <div className="timeline-list">
            {logs.map((log) => (
              <article className="timeline-item" key={log.id}>
                <div>
                  <strong>{log.message}</strong>
                  <span>{log.actorName} ({log.actorRole})</span>
                </div>
                <time>{formatDateTime(log.createdAt)}</time>
              </article>
            ))}
          </div>
        ) : (
          <div className="muted-box">Nenhuma alteracao registrada ainda para este atendimento.</div>
        )}
      </section>
    </>
  );
}
