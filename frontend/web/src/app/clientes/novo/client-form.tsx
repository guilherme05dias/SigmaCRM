"use client";

import { useActionState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import type { ClientCreateFormState, ClientCreateFormValues } from "@/lib/types";
import { createClientAction, updateClientAction } from "./actions";

const emptyValues: ClientCreateFormValues = {
  name: "",
  company: "",
  phone: "",
  email: "",
  city: "",
  segment: "",
  status: "Ativo"
};

function buildState(values: ClientCreateFormValues): ClientCreateFormState {
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

export function ClientCreateForm({
  clientId,
  initialValues = emptyValues,
  mode = "create"
}: {
  clientId?: number;
  initialValues?: ClientCreateFormValues;
  mode?: "create" | "edit";
}) {
  const action = mode === "edit" && clientId ? updateClientAction.bind(null, clientId) : createClientAction;
  const [state, formAction, pending] = useActionState(action, buildState(initialValues));
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

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          Nome do cliente
          <input defaultValue={state.values.name} name="name" placeholder="Ex.: Marina Souza" style={fieldStyles(Boolean(state.fieldErrors?.name))} />
          <FieldError message={state.fieldErrors?.name} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          Empresa
          <input defaultValue={state.values.company} name="company" placeholder="Ex.: Empresa A Ltda" style={fieldStyles(Boolean(state.fieldErrors?.company))} />
          <FieldError message={state.fieldErrors?.company} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          Telefone
          <input defaultValue={state.values.phone} name="phone" placeholder="Ex.: (11) 3000-1000" style={fieldStyles(Boolean(state.fieldErrors?.phone))} />
          <FieldError message={state.fieldErrors?.phone} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          E-mail
          <input defaultValue={state.values.email} name="email" placeholder="Ex.: contato@empresa-a.com.br" style={fieldStyles(Boolean(state.fieldErrors?.email))} />
          <FieldError message={state.fieldErrors?.email} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          Cidade
          <input defaultValue={state.values.city} name="city" placeholder="Ex.: São Paulo" style={fieldStyles(Boolean(state.fieldErrors?.city))} />
          <FieldError message={state.fieldErrors?.city} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          Segmento
          <input defaultValue={state.values.segment} name="segment" placeholder="Ex.: Varejo" style={fieldStyles(Boolean(state.fieldErrors?.segment))} />
          <FieldError message={state.fieldErrors?.segment} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          Status
          <select defaultValue={state.values.status} name="status" style={fieldStyles(Boolean(state.fieldErrors?.status))}>
            <option value="Ativo">Ativo</option>
            <option value="Em negociação">Em negociação</option>
            <option value="Inativo">Inativo</option>
          </select>
          <FieldError message={state.fieldErrors?.status} />
        </label>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <Button disabled={pending} type="submit" variant="primary">
          {pending ? "Gravando..." : isEdit ? "Salvar cliente" : "Criar cliente"}
        </Button>
        <ButtonLink href="/clientes">Cancelar</ButtonLink>
      </div>
    </form>
  );
}
