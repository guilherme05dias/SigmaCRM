import { requirePermission } from "@/lib/auth";
import { getAttendances } from "@/lib/data";

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  await requirePermission("route:summary");

  const url = new URL(request.url);
  const selectedDate = url.searchParams.get("date") || todayDateInput();
  const attendances = await getAttendances();
  const rows = attendances.filter((item) => item.openedAt.startsWith(selectedDate));

  const header = [
    "protocolo",
    "titulo",
    "cliente",
    "tecnico",
    "status",
    "prioridade",
    "abertura",
    "horas",
    "resolucao",
    "proxima_acao"
  ];

  const body = rows.map((item) => [
    item.protocol,
    item.title,
    item.client,
    item.technician,
    item.status,
    item.priority,
    item.openedAt,
    item.timeSpentHours,
    item.resolution,
    item.nextAction
  ]);

  const csv = [header, ...body].map((row) => row.map(escapeCsv).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="resumo-${selectedDate}.csv"`
    }
  });
}
