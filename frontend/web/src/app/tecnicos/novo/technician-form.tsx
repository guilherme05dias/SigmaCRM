"use client";

import { useActionState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import type { TechnicianCreateFormState, TechnicianCreateFormValues } from "@/lib/types";
import { createTechnicianAction, updateTechnicianAction } from "./actions";

const emptyValues: TechnicianCreateFormValues = {
  name: "",
  specialty: "",
  phone: "",
  email: "",
  active: "true"
};

function buildState(values: TechnicianCreateFormValues): TechnicianCreateFormState {
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

export function TechnicianCreateForm({
  technicianId,
  initialValues = emptyValues,
  mode = "create"
}: {
  technicianId?: number;
  initialValues?: TechnicianCreateFormValues;
  mode?: "create" | "edit";
}) {
  const action = mode === "edit" && technicianId ? updateTechnicianAction.bind(null, technicianId) : createTechnicianAction;
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
          Nome do tecnico
          <input defaultValue={state.values.name} name="name" placeholder="Ex.: Rafael Costa" style={fieldStyles(Boolean(state.fieldErrors?.name))} />
          <FieldError message={state.fieldErrors?.name} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          Especialidade
          <input defaultValue={state.values.specialty} name="specialty" placeholder="Ex.: Infraestrutura" style={fieldStyles(Boolean(state.fieldErrors?.specialty))} />
          <FieldError message={state.fieldErrors?.specialty} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          Telefone
          <input defaultValue={state.values.phone} name="phone" placeholder="Ex.: (11) 98888-0000" style={fieldStyles(Boolean(state.fieldErrors?.phone))} />
          <FieldError message={state.fieldErrors?.phone} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          E-mail
          <input defaultValue={state.values.email} name="email" placeholder="Ex.: rafael@empresa.com.br" style={fieldStyles(Boolean(state.fieldErrors?.email))} />
          <FieldError message={state.fieldErrors?.email} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          Status
          <select defaultValue={state.values.active} name="active" style={fieldStyles(Boolean(state.fieldErrors?.active))}>
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
          <FieldError message={state.fieldErrors?.active} />
        </label>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <Button disabled={pending} type="submit" variant="primary">
          {pending ? "Gravando..." : isEdit ? "Salvar tecnico" : "Criar tecnico"}
        </Button>
        <ButtonLink href="/tecnicos">Cancelar</ButtonLink>
      </div>
    </form>
  );
}
