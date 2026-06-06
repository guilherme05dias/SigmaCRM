import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/password';

// Seed do schema convergente (M2). Cria DUAS empresas (tenants) para validar o
// isolamento por companyId (ADR-02 / vertical slice ADR-09).
// C1: senhas DEV ('123456') agora gravadas como hash bcrypt (devPasswordHash).

const prisma = new PrismaClient();

const businessHours = [
  { status: 'OPEN', startTime: '09:00', endTime: '18:00' },
  { status: 'OPEN', startTime: '09:00', endTime: '18:00' },
  { status: 'OPEN', startTime: '09:00', endTime: '18:00' },
  { status: 'OPEN', startTime: '09:00', endTime: '18:00' },
  { status: 'OPEN', startTime: '09:00', endTime: '18:00' },
  { status: 'CLOSED', startTime: '00:00', endTime: '00:00' },
  { status: 'CLOSED', startTime: '00:00', endTime: '00:00' },
];

const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const protocolScope = `ATD-${ymd}`;
const protocol = (seq: number) => `ATD${ymd}-${String(seq).padStart(3, '0')}`;

async function setMessageSignature(userId: string, signature: string) {
  await prisma.$executeRawUnsafe(
    'UPDATE "User" SET message_signature = $1 WHERE id = $2',
    signature,
    userId
  );
}

async function clear() {
  // Ordem respeitando FKs
  await prisma.ticketTimeline.deleteMany();
  await prisma.ticketEvaluation.deleteMany();
  await prisma.ticketFieldService.deleteMany();
  await prisma.message.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.counter.deleteMany();
  await prisma.whatsAppOutbox.deleteMany();
  await prisma.whatsAppInboundEvent.deleteMany();
  await prisma.settings.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  await prisma.company.deleteMany();
}

async function main() {
  console.log('Seeding (multi-tenant: 2 empresas)...');
  await clear();

  // C1: hash único da senha DEV reusado em todos os usuários do seed.
  const devPasswordHash = await hashPassword('123456');

  // ───────────────────── EMPRESA A — DragonByte ─────────────────────
  const companyA = await prisma.company.create({
    data: { name: 'DragonByte Solutions', legalName: 'DragonByte Tecnologia Ltda' },
  });
  await prisma.settings.create({
    data: {
      companyId: companyA.id,
      businessHours,
      welcomeMessage: 'Olá! Bem-vindo ao atendimento da DragonByte. Como podemos ajudar?',
      awayMessage: 'Atendemos de seg a sex, 09:00–18:00. Deixe sua mensagem.',
      closingMessage: 'Atendimento encerrado por um de nossos técnicos.',
    },
  });

  const aSupport = await prisma.department.create({
    data: { companyId: companyA.id, name: 'Suporte Técnico', description: 'N1 e manutenção geral' },
  });
  const aN2 = await prisma.department.create({
    data: { companyId: companyA.id, name: 'N2 Infraestrutura', description: 'Redes e servidores' },
  });

  const aAdmin = await prisma.user.create({
    data: { companyId: companyA.id, name: 'Guilherme', email: 'admin@dragonbyte.com', passwordHash: devPasswordHash, role: 'ADMIN', departmentId: aSupport.id },
  });
  await setMessageSignature(aAdmin.id, 'Guilherme Dias | Suporte tecnico');
  const aSupervisor = await prisma.user.create({
    data: { companyId: companyA.id, name: 'Marina Supervisora', email: 'supervisor@dragonbyte.com', passwordHash: devPasswordHash, role: 'SUPERVISOR', departmentId: aSupport.id },
  });
  await setMessageSignature(aSupervisor.id, 'Marina Supervisora | Suporte tecnico');
  const aAgent = await prisma.user.create({
    data: { companyId: companyA.id, name: 'Ana Suporte', email: 'ana@dragonbyte.com', passwordHash: devPasswordHash, role: 'AGENT', departmentId: aSupport.id },
  });
  await setMessageSignature(aAgent.id, 'Ana Suporte | Suporte tecnico');
  const aRafael = await prisma.user.create({
    data: { companyId: companyA.id, name: 'Rafael Atendimento', email: 'rafael@dragonbyte.com', passwordHash: devPasswordHash, role: 'AGENT', departmentId: aSupport.id },
  });
  await setMessageSignature(aRafael.id, 'Rafael Atendimento | Suporte tecnico');
  const aTech = await prisma.user.create({
    data: { companyId: companyA.id, name: 'Carlos Técnico', email: 'carlos@dragonbyte.com', passwordHash: devPasswordHash, role: 'AGENT', specialty: 'Redes e Cabeamento', departmentId: aN2.id },
  });
  await setMessageSignature(aTech.id, 'Carlos Tecnico | Suporte tecnico');
  const aJulia = await prisma.user.create({
    data: { companyId: companyA.id, name: 'Julia Infra', email: 'julia@dragonbyte.com', passwordHash: devPasswordHash, role: 'AGENT', specialty: 'Servidores Linux', departmentId: aN2.id },
  });
  await setMessageSignature(aJulia.id, 'Julia Infra | Suporte tecnico');
  await prisma.user.create({
    data: { companyId: companyA.id, name: 'Usuario Inativo', email: 'inativo@dragonbyte.com', passwordHash: devPasswordHash, role: 'AGENT', departmentId: aSupport.id, active: false },
  });

  const aCustomer = await prisma.customer.create({
    data: { companyId: companyA.id, name: 'Padaria Pão Quente', document: '12.345.678/0001-90', segment: 'Varejo', city: 'São Paulo', status: 'ATIVO' },
  });
  const aContact = await prisma.contact.create({
    data: { companyId: companyA.id, customerId: aCustomer.id, name: 'Roberto (Gerente)', phone: '5511999991111', email: 'roberto@paoquente.com' },
  });

  const aConv = await prisma.conversation.create({
    data: { companyId: companyA.id, contactId: aContact.id, status: 'ASSIGNED', assignedUserId: aAgent.id, departmentId: aSupport.id, startedAt: new Date() },
  });
  await prisma.message.create({
    data: { companyId: companyA.id, conversationId: aConv.id, direction: 'INBOUND', type: 'TEXT', body: 'A internet da loja caiu.' },
  });
  await prisma.message.create({
    data: { companyId: companyA.id, conversationId: aConv.id, direction: 'OUTBOUND', type: 'TEXT', body: 'Olá Roberto! Vamos enviar um técnico.', userId: aAgent.id },
  });

  const aTicket = await prisma.ticket.create({
    data: {
      companyId: companyA.id,
      protocol: protocol(1),
      contactId: aContact.id,
      customerId: aCustomer.id,
      conversationId: aConv.id,
      title: 'Troca de switch na loja',
      description: 'Switch principal sem sinal; necessária visita técnica.',
      category: 'Rede',
      channel: 'WHATSAPP',
      priority: 'HIGH',
      status: 'SCHEDULED_FIELD_SERVICE',
      assignedUserId: aAgent.id,
      departmentId: aN2.id,
    },
  });
  await prisma.counter.create({ data: { companyId: companyA.id, scope: protocolScope, value: 1 } });

  await prisma.ticketFieldService.create({
    data: {
      companyId: companyA.id,
      ticketId: aTicket.id,
      technicianId: aTech.id,
      serviceType: 'PRESENCIAL',
      equipment: 'Switch 24 portas',
      onSiteRequired: true,
      visitAddress: 'Av. Paulista, 1000',
      visitWindowStart: new Date(Date.now() + 2 * 3600 * 1000),
      visitWindowEnd: new Date(Date.now() + 4 * 3600 * 1000),
    },
  });
  await prisma.ticketTimeline.create({
    data: { companyId: companyA.id, ticketId: aTicket.id, type: 'CREATED', actorUserId: aAdmin.id, payload: { protocol: aTicket.protocol } },
  });
  await prisma.ticketTimeline.create({
    data: { companyId: companyA.id, ticketId: aTicket.id, type: 'STATUS_CHANGE', actorUserId: aAgent.id, payload: { from: 'NEW', to: 'SCHEDULED_FIELD_SERVICE' } },
  });

  // ───────────────────── EMPRESA B — Acme (isolamento) ─────────────────────
  const companyB = await prisma.company.create({
    data: { name: 'Acme Tech', legalName: 'Acme Tecnologia ME' },
  });
  await prisma.settings.create({
    data: { companyId: companyB.id, businessHours, welcomeMessage: 'Bem-vindo à Acme!' },
  });
  const bDept = await prisma.department.create({
    data: { companyId: companyB.id, name: 'Atendimento', description: 'Geral' },
  });
  const bField = await prisma.department.create({
    data: { companyId: companyB.id, name: 'Campo', description: 'Serviços presenciais' },
  });
  const bAdmin = await prisma.user.create({
    data: { companyId: companyB.id, name: 'Bia Admin', email: 'admin@acme.com', passwordHash: devPasswordHash, role: 'ADMIN', departmentId: bDept.id },
  });
  await prisma.user.create({
    data: { companyId: companyB.id, name: 'Pedro Supervisor', email: 'supervisor@acme.com', passwordHash: devPasswordHash, role: 'SUPERVISOR', departmentId: bDept.id },
  });
  await prisma.user.create({
    data: { companyId: companyB.id, name: 'Lia Atendimento', email: 'lia@acme.com', passwordHash: devPasswordHash, role: 'AGENT', departmentId: bDept.id },
  });
  await prisma.user.create({
    data: { companyId: companyB.id, name: 'Mauro Técnico', email: 'mauro@acme.com', passwordHash: devPasswordHash, role: 'AGENT', specialty: 'Instalação e manutenção', departmentId: bField.id },
  });
  await prisma.user.create({
    data: { companyId: companyB.id, name: 'Conta Inativa', email: 'inativo@acme.com', passwordHash: devPasswordHash, role: 'AGENT', departmentId: bDept.id, active: false },
  });
  const bCustomer = await prisma.customer.create({
    data: { companyId: companyB.id, name: 'Mercado Central', segment: 'Varejo', city: 'Campinas', status: 'ATIVO' },
  });
  const bContact = await prisma.contact.create({
    data: { companyId: companyB.id, customerId: bCustomer.id, name: 'Sandra', phone: '5519988882222' },
  });
  const bTicket = await prisma.ticket.create({
    data: {
      companyId: companyB.id,
      protocol: protocol(1), // contador é POR EMPRESA → B também começa em 001
      contactId: bContact.id,
      customerId: bCustomer.id,
      title: 'Configurar e-mail corporativo',
      category: 'E-mail',
      channel: 'WHATSAPP',
      priority: 'MEDIUM',
      status: 'NEW',
      departmentId: bDept.id,
    },
  });
  await prisma.counter.create({ data: { companyId: companyB.id, scope: protocolScope, value: 1 } });
  await prisma.ticketTimeline.create({
    data: { companyId: companyB.id, ticketId: bTicket.id, type: 'CREATED', actorUserId: bAdmin.id, payload: { protocol: bTicket.protocol } },
  });

  console.log('Seed OK.');
  console.log(`  Empresa A: ${companyA.name} (${companyA.id}) — ticket ${aTicket.protocol}`);
  console.log(`  Empresa B: ${companyB.name} (${companyB.id}) — ticket ${bTicket.protocol}`);
  console.log('  Logins dev (senha 123456):');
  console.log('    DragonByte: admin@dragonbyte.com, supervisor@dragonbyte.com, ana@dragonbyte.com, rafael@dragonbyte.com, carlos@dragonbyte.com, julia@dragonbyte.com');
  console.log('    Acme: admin@acme.com, supervisor@acme.com, lia@acme.com, mauro@acme.com');
  console.log('    Inativos: inativo@dragonbyte.com, inativo@acme.com');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
