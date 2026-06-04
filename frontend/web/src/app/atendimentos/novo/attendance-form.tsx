"use client";

import { useActionState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import type { AttendanceCreateFormState, AttendanceCreateFormValues, AttendanceFormMode, Client, Technician } from "@/lib/types";
import { createAttendanceAction, updateAttendanceAction } from "./actions";

const emptyValues: AttendanceCreateFormValues = {
  title: "",
  clientId: "",
  technicianId: "",
  priority: "Média",
  channel: "WhatsApp",
  serviceType: "Remoto",
  dueDate: "",
  nextAction: "",
  status: "Novo",
  resolution: "",
  timeSpentHours: "0"
};

type AttendanceFormProps = {
  clients: Client[];
  technicians: Technician[];
  mode?: AttendanceFormMode;
  attendanceId?: number;
  initialValues?: AttendanceCreateFormValues;
};

function buildState(values: AttendanceCreateFormValues): AttendanceCreateFormState {
  return {
    error: null,
    fieldErrors: {},
    values
  };
}

function fieldStyles(hasError: boolean): React.CSSProperties {
  return {
    width: "100%",
    minHeight: 44,
    borderRadius: 10,
    border: `1px solid ${hasError ? "#b42318" : "#c8d2dc"}`,
    padding: "10px 12px",
    background: "#fff"
  };
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <span style={{ color: "#b42318", fontSize: 12, fontWeight: 700 }}>
      {message}
    </span>
  );
}

export function AttendanceForm({ clients, technicians, mode = "create", attendanceId, initialValues = emptyValues }: AttendanceFormProps) {
  const initialState = buildState(initialValues);
  const action = mode === "edit" && attendanceId ? updateAttendanceAction.bind(null, attendanceId) : createAttendanceAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const canSubmit = clients.length > 0 && technicians.length > 0 && !pending;
  const isEdit = mode === "edit";

  return (
    <form action={formAction} style={{ display: "grid", gap: 18 }}>
      {state.error ? (
        <div
          style={{
            borderRadius: 10,
            border: "1px solid #f1b4b4",
            background: "#fde8e8",
            color: "#b42318",
            padding: "12px 14px",
            fontWeight: 700
          }}
        >
          {state.error}
        </div>
      ) : null}

      {!clients.length || !technicians.length ? (
        <div
          style={{
            borderRadius: 10,
            border: "1px solid #dce3ea",
            background: "#f8fafc",
            color: "#657384",
            padding: "12px 14px",
            lineHeight: 1.5
          }}
        >
          Para {isEdit ? "editar" : "criar"} um atendimento, a lista de clientes e tecnicos precisa estar disponivel.
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <label style={{ display: "grid", gap: 8, fontWeight: 700, gridColumn: "1 / -1" }}>
          Titulo
          <input defaultValue={state.values.title} name="title" placeholder="Ex.: PDV sem emissao de cupom" style={fieldStyles(Boolean(state.fieldErrors?.title))} />
          <FieldError message={state.fieldErrors?.title} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          Cliente
          <select defaultValue={state.values.clientId} name="clientId" style={fieldStyles(Boolean(state.fieldErrors?.clientId))}>
            <option value="">Selecione</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <FieldError message={state.fieldErrors?.clientId} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          Tecnico
          <select defaultValue={state.values.technicianId} name="technicianId" style={fieldStyles(Boolean(state.fieldErrors?.technicianId))}>
            <option value="">Selecione</option>
            {technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.name}
              </option>
            ))}
          </select>
          <FieldError message={state.fieldErrors?.technicianId} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          Prioridade
          <select defaultValue={state.values.priority} name="priority" style={fieldStyles(Boolean(state.fieldErrors?.priority))}>
            <option value="Baixa">Baixa</option>
            <option value="Média">Média</option>
            <option value="Alta">Alta</option>
            <option value="Crítica">Crítica</option>
          </select>
          <FieldError message={state.fieldErrors?.priority} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          Canal
          <select defaultValue={state.values.channel} name="channel" style={fieldStyles(Boolean(state.fieldErrors?.channel))}>
            <option value="WhatsApp">WhatsApp</option>
            <option value="Telefone">Telefone</option>
            <option value="E-mail">E-mail</option>
            <option value="Portal">Portal</option>
          </select>
          <FieldError message={state.fieldErrors?.channel} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          Tipo de atendimento
          <select defaultValue={state.values.serviceType} name="serviceType" style={fieldStyles(Boolean(state.fieldErrors?.serviceType))}>
            <option value="Remoto">Remoto</option>
            <option value="Presencial">Presencial</option>
            <option value="Hibrido">Hibrido</option>
          </select>
          <FieldError message={state.fieldErrors?.serviceType} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          Prazo
          <input defaultValue={state.values.dueDate} name="dueDate" type="date" style={fieldStyles(Boolean(state.fieldErrors?.dueDate))} />
          <FieldError message={state.fieldErrors?.dueDate} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700, gridColumn: "1 / -1" }}>
          Proxima acao
          <textarea
            defaultValue={state.values.nextAction}
            name="nextAction"
            placeholder="Descreva o proximo passo operacional."
            rows={4}
            style={{ ...fieldStyles(Boolean(state.fieldErrors?.nextAction)), minHeight: 112, resize: "vertical" }}
          />
          <FieldError message={state.fieldErrors?.nextAction} />
        </label>

        {isEdit ? (
          <>
            <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
              Status
              <select defaultValue={state.values.status} name="status" style={fieldStyles(Boolean(state.fieldErrors?.status))}>
                <option value="Novo">Novo</option>
                <option value="Em andamento">Em andamento</option>
                <option value="Aguardando cliente">Aguardando cliente</option>
                <option value="Aguardando retorno">Aguardando retorno</option>
                <option value="Concluído">Concluído</option>
                <option value="Cancelado">Cancelado</option>
              </select>
              <FieldError message={state.fieldErrors?.status} />
            </label>

            <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
              Horas gastas
              <input
                defaultValue={state.values.timeSpentHours}
                min="0"
                name="timeSpentHours"
                step="0.25"
                type="number"
                style={fieldStyles(Boolean(state.fieldErrors?.timeSpentHours))}
              />
              <FieldError message={state.fieldErrors?.timeSpentHours} />
            </label>

            <label style={{ display: "grid", gap: 8, fontWeight: 700, gridColumn: "1 / -1" }}>
              Resolucao
              <textarea
                defaultValue={state.values.resolution}
                name="resolution"
                placeholder="Descreva a resolucao ou observacoes de encerramento."
                rows={4}
                style={{ ...fieldStyles(Boolean(state.fieldErrors?.resolution)), minHeight: 112, resize: "vertical" }}
              />
              <FieldError message={state.fieldErrors?.resolution} />
            </label>
          </>
        ) : null}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <Button disabled={!canSubmit} type="submit" variant="primary">
          {pending ? "Gravando..." : isEdit ? "Salvar alteracoes" : "Criar atendimento"}
        </Button>
        <ButtonLink href="/atendimentos">Cancelar</ButtonLink>
      </div>
    </form>
  );
}
