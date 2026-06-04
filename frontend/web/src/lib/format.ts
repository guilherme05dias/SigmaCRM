export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function statusTone(status: string) {
  if (status === "Concluído" || status === "resolvido" || status === "Ativo") return "success";
  if (status === "Alta" || status === "Crítica" || status === "Cancelado") return "danger";
  if (status === "Em andamento" || status === "em_andamento" || status === "Em negociação") return "info";
  return "muted";
}
