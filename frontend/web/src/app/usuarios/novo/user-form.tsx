"use client";

import { useActionState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import type { UserAccountFormState, UserAccountFormValues } from "@/lib/types";
import { createUserAction, updateUserAction } from "./actions";

const emptyValues: UserAccountFormValues = {
  username: "",
  fullName: "",
  role: "atendente",
  password: "",
  isActive: "true"
};

function buildState(values: UserAccountFormValues): UserAccountFormState {
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

  return <span style={{ color: "#b42318", fontSize: 12, fontWeight: 700 }}>{message}</span>;
}

export function UserForm({
  userId,
  initialValues = emptyValues,
  mode = "create"
}: {
  userId?: number;
  initialValues?: UserAccountFormValues;
  mode?: "create" | "edit";
}) {
  const action = mode === "edit" && userId ? updateUserAction.bind(null, userId) : createUserAction;
  const [state, formAction, pending] = useActionState(action, buildState(initialValues));
  const isEdit = mode === "edit";

  return (
    <form action={formAction} style={{ display: "grid", gap: 18 }}>
      {state.error ? <div className="inline-error">{state.error}</div> : null}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          Login
          <input defaultValue={state.values.username} name="username" placeholder="Ex.: joao.silva" style={fieldStyles(Boolean(state.fieldErrors?.username))} />
          <FieldError message={state.fieldErrors?.username} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          Nome completo
          <input defaultValue={state.values.fullName} name="fullName" placeholder="Ex.: João Silva" style={fieldStyles(Boolean(state.fieldErrors?.fullName))} />
          <FieldError message={state.fieldErrors?.fullName} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          Perfil
          <select defaultValue={state.values.role} name="role" style={fieldStyles(Boolean(state.fieldErrors?.role))}>
            <option value="gerente">Gerente</option>
            <option value="atendente">Atendente</option>
            <option value="tecnico">Técnico</option>
          </select>
          <FieldError message={state.fieldErrors?.role} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
          Status
          <select defaultValue={state.values.isActive} name="isActive" style={fieldStyles(Boolean(state.fieldErrors?.isActive))}>
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
          <FieldError message={state.fieldErrors?.isActive} />
        </label>

        <label style={{ display: "grid", gap: 8, fontWeight: 700, gridColumn: "1 / -1" }}>
          {isEdit ? "Nova senha" : "Senha"}
          <input
            name="password"
            placeholder={isEdit ? "Preencha apenas se quiser alterar a senha" : "Senha inicial"}
            style={fieldStyles(Boolean(state.fieldErrors?.password))}
            type="password"
          />
          <FieldError message={state.fieldErrors?.password} />
        </label>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <Button disabled={pending} type="submit" variant="primary">
          {pending ? "Gravando..." : isEdit ? "Salvar usuário" : "Criar usuário"}
        </Button>
        <ButtonLink href="/usuarios">Cancelar</ButtonLink>
      </div>
    </form>
  );
}
