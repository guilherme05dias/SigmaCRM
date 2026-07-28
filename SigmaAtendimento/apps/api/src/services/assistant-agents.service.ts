import { z } from 'zod';

export const AssistantAgentIdSchema = z.enum([
    'REPORT_ANALYST',
    'UNIPLUS_SPECIALIST',
    'SECULLUM_SPECIALIST',
    'GENERAL_TASKS',
    'FOLLOWUP_MASCOT',
]);

export type AssistantAgentId = z.infer<typeof AssistantAgentIdSchema>;

export const AssistantAgentSchema = z.object({
    id: AssistantAgentIdSchema,
    name: z.string().min(1).max(80),
    shortName: z.string().min(1).max(40),
    description: z.string().min(1).max(300),
    capabilities: z.array(z.string().min(1).max(120)).min(1).max(5),
});

export type AssistantAgent = z.infer<typeof AssistantAgentSchema>;

const agentInstructions: Record<AssistantAgentId, string[]> = {
    REPORT_ANALYST: [
        'Você é o Analista de dados do Sigma Atendimento.',
        'Seu foco é transformar os dados operacionais minimizados em prioridades, riscos, problemas recorrentes e sugestões de tarefas para relatórios internos.',
        'Não invente causas, tendências ou relações que não estejam sustentadas pelos dados recebidos.',
    ],
    UNIPLUS_SPECIALIST: [
        'Você é o Especialista Uniplus do Sigma Atendimento.',
        'Seu foco são tarefas do Uniplus Desktop/offline e Uniplus Web, incluindo operação, fiscal, Yoda, servidor, backup, integrações e cadastros.',
        'Diferencie Desktop/offline de Web antes de propor procedimentos específicos.',
    ],
    SECULLUM_SPECIALIST: [
        'Você é o Especialista Secullum do Sigma Atendimento.',
        'Seu foco são tarefas do Secullum Ponto 4/offline e Ponto Web, incluindo relógios, agentes de comunicação, marcações, cálculos, banco de horas, layouts e integrações.',
        'Diferencie Ponto 4/offline de Ponto Web antes de propor procedimentos específicos.',
    ],
    GENERAL_TASKS: [
        'Você é o Especialista em tarefas gerais do Sigma Atendimento.',
        'Seu foco são tarefas dos demais produtos, rotinas internas e problemas operacionais que não pertençam ao Uniplus nem ao Secullum.',
        'Não atribua recursos, telas ou procedimentos do Uniplus ou do Secullum a outros produtos.',
    ],
    FOLLOWUP_MASCOT: [
        'Você é o Mascote operacional do Sigma Atendimento.',
        'Seu foco é lembrar cada usuário sobre clientes aguardando resposta e tarefas vencidas ou antigas que ainda não foram concluídas.',
        'Seja breve, amigável e objetivo; nunca envie mensagens aos clientes e nunca conclua tarefas automaticamente.',
    ],
};

export const assistantAgents: readonly AssistantAgent[] = [
    {
        id: 'REPORT_ANALYST',
        name: 'Analista de dados e relatórios',
        shortName: 'Analista de relatórios',
        description: 'Analisa a operação, encontra padrões e prepara prioridades e sugestões para relatórios internos.',
        capabilities: ['Indicadores operacionais', 'Problemas recorrentes', 'Priorização de chamados'],
    },
    {
        id: 'UNIPLUS_SPECIALIST',
        name: 'Especialista Uniplus',
        shortName: 'Agente Uniplus',
        description: 'Auxilia nas tarefas do Uniplus Desktop/offline e Web com referências técnicas e casos resolvidos.',
        capabilities: ['Uniplus Desktop/offline', 'Uniplus Web', 'Histórico técnico da empresa'],
    },
    {
        id: 'SECULLUM_SPECIALIST',
        name: 'Especialista Secullum',
        shortName: 'Agente Secullum',
        description: 'Auxilia nas tarefas do Secullum Ponto 4/offline e Ponto Web com etapas específicas do produto.',
        capabilities: ['Secullum Ponto 4/offline', 'Secullum Ponto Web', 'Histórico técnico da empresa'],
    },
    {
        id: 'GENERAL_TASKS',
        name: 'Especialista em tarefas gerais',
        shortName: 'Agente geral',
        description: 'Organiza tarefas dos outros produtos e rotinas internas em etapas pequenas e verificáveis.',
        capabilities: ['Demais produtos', 'Rotinas internas', 'Diagnóstico e validação'],
    },
    {
        id: 'FOLLOWUP_MASCOT',
        name: 'Mascote operacional',
        shortName: 'Mascote Sigma',
        description: 'Acompanha clientes aguardando resposta e tarefas não concluídas para lembrar o responsável no momento certo.',
        capabilities: ['Clientes sem resposta', 'Tarefas atrasadas', 'Lembretes internos'],
    },
] as const;

const agentsById = new Map(assistantAgents.map((agent) => [agent.id, agent]));

export function getAssistantAgent(id: AssistantAgentId): AssistantAgent {
    return agentsById.get(id)!;
}

export function getAssistantAgentInstructions(id: AssistantAgentId): string[] {
    return agentInstructions[id];
}

function normalizeAgentContext(parts: Array<string | null | undefined>) {
    return parts
        .filter(Boolean)
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR');
}

export function resolveTaskAssistantAgent(input: {
    title: string;
    description?: string | null;
    context?: string | null;
    serviceTopic?: string | null;
}): AssistantAgent {
    const text = normalizeAgentContext([
        input.serviceTopic,
        input.title,
        input.description,
        input.context,
    ]);

    if (/\b(uniplus|yoda)\b/.test(text)) return getAssistantAgent('UNIPLUS_SPECIALIST');
    if (/\b(secullum|ponto\s*4|ponto\s*web)\b/.test(text)) return getAssistantAgent('SECULLUM_SPECIALIST');
    return getAssistantAgent('GENERAL_TASKS');
}

export function getReportAssistantAgent() {
    return getAssistantAgent('REPORT_ANALYST');
}
