import type { Attendance, Client, Technician, UserAccount, WhatsappConversation } from "./types";

export const technicians: Technician[] = [
  { id: 1, name: "André", specialty: "Suporte técnico", phone: "(11) 98888-1001", email: "andre@servicocrm.local", active: true },
  { id: 2, name: "Bruna", specialty: "Redes e infraestrutura", phone: "(11) 98888-1002", email: "bruna@servicocrm.local", active: true },
  { id: 3, name: "Carlos", specialty: "Sistemas fiscais", phone: "(11) 98888-1003", email: "carlos@servicocrm.local", active: true },
  { id: 4, name: "Fernanda", specialty: "PDV e impressoras", phone: "(11) 98888-1004", email: "fernanda@servicocrm.local", active: false }
];

export const clients: Client[] = [
  { id: 1, name: "Empresa A", company: "Empresa A Ltda", phone: "(11) 3000-1000", email: "ti@empresa-a.local", city: "São Paulo", segment: "Varejo", status: "Ativo" },
  { id: 2, name: "Empresa B", company: "Empresa B Serviços", phone: "(11) 3000-2000", email: "suporte@empresa-b.local", city: "Osasco", segment: "Serviços", status: "Ativo" },
  { id: 3, name: "Empresa C", company: "Empresa C Comércio", phone: "(11) 3000-3000", email: "admin@empresa-c.local", city: "Guarulhos", segment: "Comércio", status: "Em negociação" }
];

export const attendances: Attendance[] = [
  {
    id: 1,
    protocol: "ATD20260601-001",
    title: "PDV sem emissão de cupom",
    technician: "André",
    client: "Empresa A",
    clientPhone: "(11) 3000-1000",
    status: "Concluído",
    priority: "Alta",
    channel: "WhatsApp",
    serviceType: "Remoto",
    openedAt: "2026-06-01T08:40:00",
    dueDate: "2026-06-01",
    timeSpentHours: 1,
    resolution: "Serviço normalizado e cupom emitido em teste.",
    nextAction: ""
  },
  {
    id: 2,
    protocol: "ATD20260601-002",
    title: "Impressora sem comunicação",
    technician: "Bruna",
    client: "Empresa B",
    clientPhone: "(11) 3000-2000",
    status: "Em andamento",
    priority: "Média",
    channel: "Telefone",
    serviceType: "Presencial",
    openedAt: "2026-06-01T10:05:00",
    dueDate: "2026-06-01",
    timeSpentHours: 0.5,
    resolution: "",
    nextAction: "Trocar cabo USB e validar porta."
  },
  {
    id: 3,
    protocol: "ATD20260531-001",
    title: "Lentidão no sistema",
    technician: "Carlos",
    client: "Empresa C",
    clientPhone: "(11) 3000-3000",
    status: "Aguardando cliente",
    priority: "Baixa",
    channel: "E-mail",
    serviceType: "Remoto",
    openedAt: "2026-05-31T15:10:00",
    dueDate: "2026-06-02",
    timeSpentHours: 1.5,
    resolution: "Orientado fechamento de processos ociosos.",
    nextAction: "Aguardar janela autorizada para reinício."
  }
];

export const users: UserAccount[] = [
  { id: 1, username: "teste_gerente", fullName: "Teste Gerente", role: "gerente", isActive: true },
  { id: 2, username: "teste_atendente", fullName: "Teste Atendente", role: "atendente", isActive: true },
  { id: 3, username: "teste_tecnico", fullName: "Teste Técnico", role: "tecnico", isActive: true }
];

export const whatsappConversations: WhatsappConversation[] = [
  { id: 1, contactName: "Marina - Empresa A", contactNumber: "5511999991000", status: "resolvido", lastMessageAt: "2026-06-01T09:28:00", messageCount: 4, linkedProtocol: "ATD20260601-001" },
  { id: 2, contactName: "Roberto - Empresa B", contactNumber: "5511988882000", status: "em_andamento", lastMessageAt: "2026-06-01T10:18:00", messageCount: 3, linkedProtocol: "ATD20260601-002" }
];
