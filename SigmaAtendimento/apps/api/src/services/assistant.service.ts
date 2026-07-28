import { AssistantAnalysisScope, TicketPriority, TicketStatus } from '@prisma/client';
import { z } from 'zod';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import {
    assistantAgents,
    AssistantAgentSchema,
    getAssistantAgentInstructions,
    getReportAssistantAgent,
    resolveTaskAssistantAgent,
} from './assistant-agents.service';
import type { AssistantKnowledgeReference } from './assistant-knowledge.service';

const PrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

const AssistantModelResultSchema = z.object({
    analysisMode: z.enum(['LOCAL_MODEL', 'LOCAL_RULES']).default('LOCAL_MODEL'),
    summary: z.string().min(1).max(1_500),
    keyRisks: z.array(z.string().min(1).max(300)).max(8),
    prioritizedTickets: z.array(z.object({
        ticketId: z.string(),
        rank: z.number().int().min(1).max(50),
        reason: z.string().min(1).max(500),
        recommendedAction: z.string().min(1).max(500),
    })).max(15),
    taskSuggestions: z.array(z.object({
        suggestionId: z.string().min(1).max(80),
        title: z.string().min(1).max(160),
        description: z.string().max(1_000),
        priority: PrioritySchema,
        dueInDays: z.number().int().min(0).max(30),
        ticketId: z.string().nullable(),
    })).max(12),
    problemClusters: z.array(z.object({
        label: z.string().min(1).max(120),
        description: z.string().min(1).max(400),
        conversationIds: z.array(z.string().min(1).max(80)).max(30),
    })).max(8).default([]),
});

export const AssistantAnalysisResultSchema = AssistantModelResultSchema.extend({
    agent: AssistantAgentSchema,
    conversationStats: z.object({
        periodDays: z.number().int().min(1).max(90),
        conversations: z.number().int().min(0),
        activeContacts: z.number().int().min(0),
        inboundMessages: z.number().int().min(0),
        sampledConversations: z.number().int().min(0),
    }),
    topCustomers: z.array(z.object({
        contactId: z.string(),
        name: z.string().min(1).max(160),
        conversationCount: z.number().int().min(0),
        inboundMessageCount: z.number().int().min(0),
        lastContactAt: z.string().nullable(),
    })).max(10),
    mainProblems: z.array(z.object({
        label: z.string().min(1).max(120),
        description: z.string().min(1).max(400),
        conversationCount: z.number().int().min(1),
    })).max(8),
});

type AssistantModelResult = z.infer<typeof AssistantModelResultSchema>;
export type AssistantAnalysisResult = z.infer<typeof AssistantAnalysisResultSchema>;

const openTicketStatuses: TicketStatus[] = [
    TicketStatus.NEW,
    TicketStatus.QUEUED,
    TicketStatus.IN_PROGRESS,
    TicketStatus.WAITING_CUSTOMER,
    TicketStatus.WAITING_INTERNAL,
    TicketStatus.SCHEDULED_FIELD_SERVICE,
];

const priorityWeight: Record<TicketPriority, number> = {
    LOW: 0,
    MEDIUM: 10,
    HIGH: 30,
    CRITICAL: 60,
};

const ollamaResponseFormat = {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'keyRisks', 'prioritizedTickets', 'taskSuggestions', 'problemClusters'],
    properties: {
        summary: { type: 'string' },
        keyRisks: { type: 'array', maxItems: 5, items: { type: 'string', maxLength: 180 } },
        prioritizedTickets: {
            type: 'array',
            maxItems: 5,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['ticketId', 'rank', 'reason', 'recommendedAction'],
                properties: {
                    ticketId: { type: 'string' },
                    rank: { type: 'integer', minimum: 1, maximum: 50 },
                    reason: { type: 'string', maxLength: 220 },
                    recommendedAction: { type: 'string', maxLength: 220 },
                },
            },
        },
        taskSuggestions: {
            type: 'array',
            maxItems: 3,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['suggestionId', 'title', 'description', 'priority', 'dueInDays', 'ticketId'],
                properties: {
                    suggestionId: { type: 'string' },
                    title: { type: 'string', maxLength: 120 },
                    description: { type: 'string', maxLength: 250 },
                    priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
                    dueInDays: { type: 'integer', minimum: 0, maximum: 30 },
                    ticketId: { type: ['string', 'null'] },
                },
            },
        },
        problemClusters: {
            type: 'array',
            maxItems: 6,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['label', 'description', 'conversationIds'],
                properties: {
                    label: { type: 'string', maxLength: 80 },
                    description: { type: 'string', maxLength: 180 },
                    conversationIds: {
                        type: 'array',
                        maxItems: 20,
                        items: { type: 'string', maxLength: 20 },
                    },
                },
            },
        },
    },
} as const;

const TaskPlanModelSchema = z.object({
    understanding: z.string().trim().min(1).max(500),
    steps: z.array(z.string().trim().min(3).max(240)).min(3).max(7),
});

export const AssistantTaskPlanSchema = TaskPlanModelSchema.extend({
    agent: AssistantAgentSchema,
    analysisMode: z.enum(['LOCAL_MODEL', 'LOCAL_RULES']),
    references: z.array(z.object({
        id: z.string().min(1).max(120),
        title: z.string().min(1).max(180),
        summary: z.string().min(1).max(1_000),
        system: z.enum(['UNIPLUS', 'SECULLUM']),
        edition: z.enum(['DESKTOP', 'WEB', 'GENERAL']),
        sourceType: z.enum(['OFFICIAL_DOC', 'INTERNAL_CASE']),
        sourceLabel: z.string().min(1).max(80),
        url: z.string().url().nullable(),
    })).max(6).default([]),
});

export type AssistantTaskPlan = z.infer<typeof AssistantTaskPlanSchema>;

const taskPlanResponseFormat = {
    type: 'object',
    additionalProperties: false,
    required: ['understanding', 'steps'],
    properties: {
        understanding: { type: 'string', maxLength: 500 },
        steps: {
            type: 'array',
            minItems: 3,
            maxItems: 7,
            items: { type: 'string', minLength: 3, maxLength: 240 },
        },
    },
} as const;

export function redactSensitiveText(value?: string | null): string | null {
    if (!value) return null;
    return value
        .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]')
        .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s]?\d{4}/g, '[telefone]')
        .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento]')
        .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[documento]')
        .slice(0, 2_000);
}

export function assistantCustomerDisplayName(contact: {
    name?: string | null;
    phone: string;
}) {
    const contactName = contact.name?.trim();
    const contactNameDigits = contactName?.replace(/\D/g, '') || '';
    const contactNameLooksLikePhone = contactNameDigits.length >= 8
        && contactNameDigits.length >= (contactName?.replace(/\s/g, '').length || 0) * 0.7;
    const phoneSuffix = contact.phone.replace(/\D/g, '').slice(-4);
    return (!contactNameLooksLikePhone ? contactName : null)
        || (phoneSuffix ? `Contato final ${phoneSuffix}` : 'Contato sem nome');
}

export function isSafeLocalOllamaUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'http:'
            && !url.username
            && !url.password
            && !url.search
            && !url.hash
            && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    } catch {
        return false;
    }
}

export function isLocalOllamaModel(model: string): boolean {
    return Boolean(model.trim()) && !model.toLowerCase().includes('cloud');
}

function isAssistantConfigurationSafe() {
    return isSafeLocalOllamaUrl(env.ollamaBaseUrl) && isLocalOllamaModel(env.assistantModel);
}

export function getAssistantStatus() {
    return {
        enabled: env.assistantEnabled && isAssistantConfigurationSafe(),
        model: env.assistantModel,
        provider: 'ollama' as const,
        localOnly: true as const,
        mode: 'internal_analysis_only' as const,
        canSendCustomerMessages: false,
        agents: assistantAgents,
    };
}

const DeterministicSnapshotSchema = z.object({
    tickets: z.array(z.object({
        ticketId: z.string().min(1).max(80),
        priority: PrioritySchema,
        status: z.string().min(1).max(80),
        dueAt: z.string().nullable().optional(),
        ageDays: z.number().int().min(0).default(0),
        hasResponsible: z.boolean().default(false),
        deterministicRiskScore: z.number().finite().default(0),
    })).max(30).default([]),
    conversations: z.array(z.object({
        conversationId: z.string().min(1).max(80),
        topic: z.string().nullable().optional(),
        closingSummary: z.string().nullable().optional(),
        inboundMessages: z.array(z.string().min(1).max(500)).max(2).default([]),
    })).max(30).default([]),
});

type FallbackReason = 'timeout' | 'unavailable' | 'invalid_response';
type DeterministicTicket = z.infer<typeof DeterministicSnapshotSchema>['tickets'][number];
type DeterministicConversation = z.infer<typeof DeterministicSnapshotSchema>['conversations'][number];

function fallbackProblemLabel(conversation: DeterministicConversation) {
    const explicitTopic = conversation.topic?.trim();
    const text = [conversation.closingSummary, ...conversation.inboundMessages]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('pt-BR');
    const patterns: Array<[RegExp, string]> = [
        [/\b(senha|login|acesso|entrar|usu[aá]rio)\b/i, 'Acesso e senha'],
        [/\b(lento|lentid[aã]o|travando|travou|demora)\b/i, 'Lentidão ou travamento'],
        [/\b(nota fiscal|nf-?e|nfe|cupom|fiscal)\b/i, 'Emissão fiscal'],
        [/\b(instalar|instala[cç][aã]o|configurar|configura[cç][aã]o|atalho)\b/i, 'Instalação e configuração'],
        [/\b(ponto|batida|rel[oó]gio|biometria|digital)\b/i, 'Ponto eletrônico'],
        [/\b(impressora|imprimir|impress[aã]o|bobina)\b/i, 'Impressão'],
        [/\b(backup|restaurar|restaura[cç][aã]o|banco de dados)\b/i, 'Backup e banco de dados'],
        [/\b(certificado|assinatura digital)\b/i, 'Certificado digital'],
        [/\b(internet|rede|conex[aã]o|conectar|offline)\b/i, 'Conectividade'],
        [/\b(atualizar|atualiza[cç][aã]o|vers[aã]o)\b/i, 'Atualização do sistema'],
        [/\b(cadastro|cadastrar|registrar)\b/i, 'Cadastro'],
        [/\b(sincronizar|sincroniza[cç][aã]o|integrar|integra[cç][aã]o)\b/i, 'Sincronização e integração'],
        [/\b(boleto|cobran[cç]a|financeiro|pagamento)\b/i, 'Financeiro e cobrança'],
        [/\b(erro|falha|n[aã]o abre|n[aã]o funciona|problema)\b/i, 'Erro no sistema'],
    ];
    const inferredProblem = patterns.find(([pattern]) => pattern.test(text))?.[1];
    if (inferredProblem) return inferredProblem;
    if (explicitTopic && !/^outros?$/i.test(explicitTopic)) return explicitTopic.slice(0, 120);
    return 'Outros assuntos';
}

function buildFallbackProblemClusters(conversations: DeterministicConversation[]) {
    const groups = new Map<string, string[]>();
    conversations.forEach((conversation) => {
        const label = fallbackProblemLabel(conversation);
        groups.set(label, [...(groups.get(label) || []), conversation.conversationId]);
    });
    return Array.from(groups, ([label, conversationIds]) => ({
        label,
        description: `Conversas classificadas localmente como ${label.toLocaleLowerCase('pt-BR')}.`,
        conversationIds,
    }))
        .sort((a, b) => b.conversationIds.length - a.conversationIds.length || a.label.localeCompare(b.label, 'pt-BR'))
        .slice(0, 6);
}

function ticketIsOverdue(ticket: DeterministicTicket) {
    return Boolean(ticket.dueAt && Date.parse(ticket.dueAt) < Date.now());
}

function deterministicReason(ticket: DeterministicTicket) {
    const reasons: string[] = [];
    if (ticket.priority === 'CRITICAL') reasons.push('prioridade crítica');
    else if (ticket.priority === 'HIGH') reasons.push('prioridade alta');
    if (ticketIsOverdue(ticket)) reasons.push('prazo vencido');
    if (!ticket.hasResponsible) reasons.push('sem responsável definido');
    if (ticket.status === 'WAITING_INTERNAL') reasons.push('aguardando retorno interno');
    if (ticket.ageDays >= 7) reasons.push(`${ticket.ageDays} dias em aberto`);
    return reasons.length > 0 ? reasons.join(', ') : 'maior pontuação de risco operacional';
}

function deterministicAction(ticket: DeterministicTicket) {
    if (!ticket.hasResponsible) return 'Definir um responsável e revisar o andamento internamente.';
    if (ticketIsOverdue(ticket)) return 'Revisar o prazo e registrar a próxima ação interna.';
    if (ticket.status === 'WAITING_INTERNAL') return 'Cobrar o retorno interno pendente e atualizar o chamado.';
    return 'Revisar o andamento e confirmar a próxima ação interna.';
}

export function buildDeterministicLocalAnalysis(input: unknown, reason: FallbackReason): AssistantModelResult {
    const parsed = DeterministicSnapshotSchema.safeParse(input);
    const tickets = parsed.success
        ? [...parsed.data.tickets].sort((a, b) => b.deterministicRiskScore - a.deterministicRiskScore)
        : [];
    const prioritized = tickets.slice(0, 5);
    const overdueCount = tickets.filter(ticketIsOverdue).length;
    const unassignedCount = tickets.filter((ticket) => !ticket.hasResponsible).length;
    const criticalCount = tickets.filter((ticket) => ticket.priority === 'CRITICAL').length;
    const cause = reason === 'timeout'
        ? 'o modelo atingiu o limite de tempo'
        : reason === 'invalid_response'
            ? 'a resposta do modelo não passou pela validação'
            : 'o modelo estava temporariamente indisponível';
    const keyRisks = [
        criticalCount > 0 ? `${criticalCount} chamado(s) com prioridade crítica.` : null,
        overdueCount > 0 ? `${overdueCount} chamado(s) com prazo vencido.` : null,
        unassignedCount > 0 ? `${unassignedCount} chamado(s) sem responsável definido.` : null,
    ].filter((item): item is string => Boolean(item));

    return {
        analysisMode: 'LOCAL_RULES',
        summary: tickets.length > 0
            ? `Análise concluída pelas regras operacionais locais porque ${cause}. Foram avaliados ${tickets.length} chamado(s), sem interromper o trabalho da equipe.`
            : `Análise concluída pelas regras operacionais locais porque ${cause}. Não havia chamados válidos para priorizar.`,
        keyRisks,
        prioritizedTickets: prioritized.map((ticket, index) => ({
            ticketId: ticket.ticketId,
            rank: index + 1,
            reason: deterministicReason(ticket),
            recommendedAction: deterministicAction(ticket),
        })),
        taskSuggestions: prioritized
            .filter((ticket) => ticket.priority === 'CRITICAL' || ticket.priority === 'HIGH' || ticketIsOverdue(ticket) || !ticket.hasResponsible)
            .slice(0, 3)
            .map((ticket) => ({
                suggestionId: `local-rules-${ticket.ticketId}`,
                title: `Acompanhar ${ticket.ticketId}`,
                description: `Revisar internamente: ${deterministicReason(ticket)}.`,
                priority: ticket.priority,
                dueInDays: ticket.priority === 'CRITICAL' || ticketIsOverdue(ticket) ? 0 : 1,
                ticketId: ticket.ticketId,
            })),
        problemClusters: buildFallbackProblemClusters(parsed.success ? parsed.data.conversations : []),
    };
}

export async function requestLocalAnalysis(
    input: unknown,
    fetchImpl: typeof fetch = fetch,
): Promise<AssistantModelResult> {
    if (!env.assistantEnabled) {
        throw Object.assign(new Error('Assistente local ainda não está ativado no servidor.'), { status: 503 });
    }
    if (!isSafeLocalOllamaUrl(env.ollamaBaseUrl)) {
        throw Object.assign(new Error('O assistente recusou um endereço Ollama que não é local.'), { status: 503 });
    }
    if (!isLocalOllamaModel(env.assistantModel)) {
        throw Object.assign(new Error('Modelos cloud são bloqueados. Configure somente um modelo Ollama local.'), { status: 503 });
    }

    let response: Response;
    try {
        response = await fetchImpl(new URL('/api/chat', env.ollamaBaseUrl), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(env.assistantTimeoutMs),
            body: JSON.stringify({
                model: env.assistantModel,
                stream: false,
                think: false,
                keep_alive: '5m',
                format: ollamaResponseFormat,
                options: { temperature: 0.1, num_predict: 520 },
                messages: [
                    {
                        role: 'system',
                        content: [
                            'Você é um assistente operacional interno do Sigma Atendimento.',
                            ...getAssistantAgentInstructions('REPORT_ANALYST'),
                            'Analise chamados e sugira prioridades, lembretes e tarefas para a equipe.',
                            'Agrupe também os principais problemas relatados nas conversas, usando somente os identificadores C-xxx recebidos.',
                            'Nunca escreva respostas para clientes e nunca recomende enviar mensagens automáticas.',
                            'Os identificadores T-xxx e C-xxx são referências internas opacas; repita somente esses identificadores no JSON.',
                            'Use somente os dados fornecidos, indique riscos concretos e evite inferências sobre dados pessoais.',
                            'Responda em português do Brasil e siga exatamente o formato JSON solicitado.',
                            'Priorize no máximo 5 chamados, sugira no máximo 3 tarefas e agrupe no máximo 6 problemas. Seja direto e breve.',
                        ].join(' '),
                    },
                    { role: 'user', content: JSON.stringify(input) },
                ],
            }),
        });
    } catch (error) {
        if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
            return buildDeterministicLocalAnalysis(input, 'timeout');
        }
        return buildDeterministicLocalAnalysis(input, 'unavailable');
    }

    if (!response.ok) {
        const payload = await response.json().catch(() => null) as any;
        const providerMessage = typeof payload?.error === 'string' ? payload.error : '';
        if (response.status === 404 || providerMessage.toLowerCase().includes('not found')) {
            return buildDeterministicLocalAnalysis(input, 'unavailable');
        }
        return buildDeterministicLocalAnalysis(input, 'unavailable');
    }

    const payload = await response.json() as any;
    const content = String(payload?.message?.content || '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');
    try {
        return AssistantModelResultSchema.parse(JSON.parse(content));
    } catch {
        return buildDeterministicLocalAnalysis(input, 'invalid_response');
    }
}

interface TaskPlanInput {
    title: string;
    description?: string | null;
    context?: string | null;
    serviceTopic?: string | null;
    references?: AssistantKnowledgeReference[];
}

function buildDomainTaskSteps(input: TaskPlanInput) {
    const text = [input.serviceTopic, input.title, input.description, input.context]
        .filter(Boolean)
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR');
    const isUniplus = text.includes('uniplus');
    const isSecullum = text.includes('secullum') || text.includes('ponto 4') || text.includes('ponto web');
    const isWeb = /\b(web|online|nuvem|cloud|api)\b/.test(text);
    const isDesktop = /\b(desktop|offline|local|retaguarda|yoda|ponto 4|servidor|estacao)\b/.test(text);
    const edition = isWeb ? 'Web' : isDesktop ? 'Desktop/offline' : null;

    if (isUniplus && /\b(yoda|nfe|nfce|nota|sefaz|fiscal|8443)\b/.test(text)) {
        return [
            `Confirmar se o incidente ocorre no Uniplus ${edition || 'Desktop ou Web'}, em qual empresa/filial e registrar a mensagem ou rejeição fiscal completa.`,
            'No Desktop, verificar se o Yoda está em execução no servidor e consultar Ferramentas → Gerenciador de tarefas do Yoda; no Web, registrar a tela e a operação fiscal utilizada.',
            'No Desktop, validar o IP configurado em Ferramentas → Parâmetros, o acesso da estação ao servidor e a porta 8443 sem alterar firewall antes de confirmar a causa.',
            'Reproduzir uma consulta de status da SEFAZ ou o envio afetado e comparar horário, série, certificado e pendências com o último documento emitido com sucesso.',
            'Aplicar somente a correção confirmada, repetir o teste controlado e registrar chave, protocolo ou mensagem final sem expor dados fiscais sensíveis.',
        ];
    }
    if (isUniplus && /\b(backup|banco|base|servidor|restaur)\b/.test(text)) {
        return [
            `Confirmar se a instalação é Uniplus ${edition || 'Desktop ou Web'}, identificar servidor, versão e impacto sem executar alterações na base.`,
            'No Desktop, verificar no Gerenciador de tarefas do Yoda a última execução do backup e registrar destino, horário e status.',
            'Gerar ou localizar um backup íntegro conforme o procedimento oficial e validar que o arquivo pode ser lido antes de qualquer manutenção.',
            'Inspecionar conectividade, espaço em disco, logs e tarefa recorrente relacionada para isolar a falha sem editar tabelas diretamente.',
            'Executar a ação autorizada, repetir o backup ou rotina afetada e registrar evidências de conclusão e possibilidade de restauração.',
        ];
    }
    if (isUniplus) {
        return [
            `Identificar se o cliente usa Uniplus ${edition || 'Desktop ou Web'}, a versão, a empresa/filial e o módulo exato afetado.`,
            'Registrar o caminho de menu, os dados de teste, o resultado esperado e a mensagem completa apresentada pelo sistema.',
            'Reproduzir o fluxo com um registro controlado e comparar os campos obrigatórios com a documentação oficial da mesma edição.',
            'Verificar no histórico da empresa se o mesmo sintoma já foi resolvido e confirmar se a causa se aplica ao ambiente atual.',
            'Aplicar a correção validada, repetir o fluxo de ponta a ponta e registrar o resultado e qualquer pendência restante.',
        ];
    }
    if (isSecullum && /\b(equipamento|relogio|rep|batida|marcacao|comunicacao|agente|sincron)\b/.test(text)) {
        return [
            `Confirmar se o ambiente é Secullum ${edition || 'Ponto 4 ou Ponto Web'}, o modelo do relógio, o tipo de comunicação e o horário da última batida recebida.`,
            'Verificar se a comunicação é direta, por agente ou por arquivo texto e registrar o status do equipamento sem apagar filas ou marcações.',
            'Validar cadastro do equipamento, endereço de rede, pacote/agente de comunicação e diferença de data e hora entre servidor, relógio e sistema.',
            'Gerar uma batida de teste identificada e acompanhar seu percurso até a importação, separando falha no relógio, transporte, agente ou cálculo.',
            'Corrigir somente o ponto isolado, sincronizar novamente e confirmar a batida no Ponto Diário ou cálculo do funcionário correto.',
        ];
    }
    if (isSecullum && /\b(banco de horas|hora extra|saldo|calculo|falta|atraso|ajuste)\b/.test(text)) {
        return [
            `Confirmar se o cálculo ocorre no Secullum ${edition || 'Ponto 4 ou Ponto Web'}, o funcionário de teste e o período exato divergente.`,
            'Conferir horário vinculado, data de início do banco de horas e regras de extras, faltas, atrasos, tolerâncias e feriados aplicáveis.',
            'Comparar as marcações do dia com as colunas de saldo, crédito, débito e ajustes, identificando o primeiro dia em que a divergência aparece.',
            'Ajustar uma única regra confirmada e recalcular somente o funcionário e o período de teste, preservando evidências dos valores anteriores.',
            'Validar o cartão ponto e o extrato do banco de horas com o responsável do DP antes de aplicar a mesma correção em massa.',
        ];
    }
    if (isSecullum && /\b(api|integracao|tls|endpoint|token)\b/.test(text)) {
        return [
            'Confirmar que o ambiente é Secullum Ponto Web, que o plano permite Integração Externa e qual recurso da API está envolvido.',
            'Registrar endpoint, método, horário, código HTTP e corpo de erro removendo credenciais, documentos e dados pessoais.',
            'Validar TLS 1.2 ou superior, autenticação e permissões usando uma requisição de leitura com dados de teste.',
            'Comparar campos e filtros enviados com a documentação do recurso e corrigir apenas o contrato divergente.',
            'Repetir a integração de forma controlada, confirmar o registro no Ponto Web e documentar a resposta esperada.',
        ];
    }
    if (isSecullum && /\b(layout|exportacao|folha|txt|evento)\b/.test(text)) {
        return [
            `Confirmar se a origem é Secullum ${edition || 'Ponto 4 ou Ponto Web'} e solicitar à contabilidade um arquivo aceito ou a especificação do layout da folha.`,
            'Documentar identificador do funcionário, códigos de eventos, ordem e tamanho dos campos, separador, formato de data/hora, casas decimais, cabeçalho e codificação exigidos.',
            'Copiar a configuração atual do layout e mapear cada total do Secullum — horas normais, extras, faltas, atrasos e banco de horas — ao evento correspondente da folha.',
            'Gerar um arquivo TXT de teste para um funcionário e um período fechado, conferindo posição, preenchimento, sinal e total de cada campo antes da importação.',
            'Importar o arquivo no ambiente de homologação da folha, reconciliar os totais com o cartão ponto e obter aprovação da contabilidade antes da geração em massa.',
        ];
    }
    if (isSecullum) {
        return [
            `Identificar se o cliente usa Secullum ${edition || 'Ponto 4 ou Ponto Web'}, a versão/plano, a empresa e o módulo afetado.`,
            'Registrar funcionário ou equipamento de teste, período, caminho de tela, resultado esperado e mensagem completa do sistema.',
            'Reproduzir o fluxo sem alterações em massa e comparar horários, marcações, permissões e parâmetros com a documentação da mesma edição.',
            'Consultar casos resolvidos da empresa para verificar se existe causa recorrente compatível com o ambiente atual.',
            'Aplicar a correção confirmada e validar o resultado no Ponto Diário, cálculo ou relatório correspondente.',
        ];
    }
    return null;
}

export function buildDeterministicTaskPlan(input: TaskPlanInput): AssistantTaskPlan {
    const agent = resolveTaskAssistantAgent(input);
    const title = redactSensitiveText(input.title)?.trim() || 'a tarefa informada';
    const details = redactSensitiveText(input.context)?.trim()
        || redactSensitiveText(input.description)?.trim();
    const serviceTopic = redactSensitiveText(input.serviceTopic)?.trim();
    const scope = serviceTopic ? ` no contexto de ${serviceTopic}` : '';
    const understanding = details
        ? `O objetivo é resolver “${title}”${scope}, considerando: ${details}`.slice(0, 500)
        : `O objetivo é entender e resolver “${title}”${scope}. Antes de agir, é necessário confirmar os detalhes observados e o resultado esperado.`.slice(0, 500);

    return {
        agent,
        analysisMode: 'LOCAL_RULES',
        understanding,
        references: input.references || [],
        steps: buildDomainTaskSteps(input) || [
            'Confirmar o comportamento observado, o resultado esperado e o impacto do problema.',
            'Reproduzir o problema de forma controlada e registrar as evidências encontradas.',
            'Isolar a causa provável e identificar o componente ou responsável pela correção.',
            'Aplicar a correção adequada ou encaminhar a ação com todas as evidências necessárias.',
            'Validar o resultado, registrar o que foi feito e confirmar que o problema não se repete.',
        ],
    };
}

export async function planAssistantTask(
    input: TaskPlanInput,
    fetchImpl: typeof fetch = fetch,
): Promise<AssistantTaskPlan> {
    const agent = resolveTaskAssistantAgent(input);
    const fallback = () => buildDeterministicTaskPlan(input);
    if (!env.assistantEnabled || !isAssistantConfigurationSafe()) return fallback();

    const minimizedInput = {
        title: redactSensitiveText(input.title),
        description: redactSensitiveText(input.description),
        additionalContext: redactSensitiveText(input.context),
        serviceTopic: redactSensitiveText(input.serviceTopic),
        knowledgeReferences: (input.references || []).map((reference) => ({
            id: reference.id,
            title: reference.title,
            edition: reference.edition,
            source: reference.sourceLabel,
            summary: redactSensitiveText(reference.summary),
        })),
    };

    let response: Response;
    try {
        response = await fetchImpl(new URL('/api/chat', env.ollamaBaseUrl), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(Math.min(env.assistantTimeoutMs, 60_000)),
            body: JSON.stringify({
                model: env.assistantModel,
                stream: false,
                think: false,
                keep_alive: '5m',
                format: taskPlanResponseFormat,
                options: { temperature: 0.1, num_predict: 420 },
                messages: [
                    {
                        role: 'system',
                        content: [
                            'Você é um assistente operacional interno do Sigma Atendimento.',
                            ...getAssistantAgentInstructions(agent.id),
                            'Use as referências técnicas e os casos resolvidos recebidos para propor verificações concretas da edição correta.',
                            'Não invente telas, menus, tabelas, credenciais, versões ou procedimentos ausentes nas referências.',
                            'Quando a edição não estiver clara, faça a identificação de Desktop/offline ou Web na primeira etapa.',
                            'Para banco de dados, comece por backup e diagnóstico somente leitura; nunca proponha editar tabelas diretamente.',
                            'Entenda o problema descrito sem inventar fatos e resuma o objetivo em uma frase clara.',
                            'Divida o trabalho em 3 a 7 etapas pequenas, ordenadas, executáveis e verificáveis.',
                            'Cada etapa deve começar com um verbo de ação e representar apenas uma ação principal.',
                            'Quando faltarem informações, transforme a coleta ou confirmação dessas informações na primeira etapa.',
                            'Inclua diagnóstico, resolução e uma validação final do resultado.',
                            'Nunca escreva respostas para clientes e nunca execute ações automaticamente.',
                            'Responda em português do Brasil e siga exatamente o formato JSON solicitado.',
                        ].join(' '),
                    },
                    { role: 'user', content: JSON.stringify(minimizedInput) },
                ],
            }),
        });
    } catch {
        return fallback();
    }

    if (!response.ok) return fallback();

    const payload = await response.json().catch(() => null) as any;
    const content = String(payload?.message?.content || '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');
    try {
        const parsed = TaskPlanModelSchema.parse(JSON.parse(content));
        const steps = Array.from(new Set(parsed.steps.map((step) => step.trim())));
        if (steps.length < 3) return fallback();
        return AssistantTaskPlanSchema.parse({
            ...parsed,
            steps,
            agent,
            analysisMode: 'LOCAL_MODEL',
            references: input.references || [],
        });
    } catch {
        return fallback();
    }
}

export async function testAssistantConnection() {
    const startedAt = Date.now();
    if (!env.assistantEnabled || !isSafeLocalOllamaUrl(env.ollamaBaseUrl) || !isLocalOllamaModel(env.assistantModel)) {
        throw Object.assign(new Error('A configuração local do assistente não é segura ou não está ativada.'), { status: 503 });
    }

    let response: Response;
    try {
        response = await fetch(new URL('/api/chat', env.ollamaBaseUrl), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(Math.min(env.assistantTimeoutMs, 60_000)),
            body: JSON.stringify({
                model: env.assistantModel,
                stream: false,
                think: false,
                keep_alive: '5m',
                options: { temperature: 0, num_predict: 12 },
                messages: [
                    { role: 'system', content: 'Teste local sintético. Não use ferramentas. Responda de forma curta.' },
                    { role: 'user', content: 'Responda somente: SIGMA_LOCAL_OK' },
                ],
            }),
        });
    } catch {
        throw Object.assign(new Error('Não foi possível acessar o modelo Ollama local.'), { status: 503 });
    }

    if (!response.ok) {
        const payload = await response.json().catch(() => null) as any;
        throw Object.assign(new Error(typeof payload?.error === 'string' ? payload.error : 'Falha no teste do Ollama local.'), { status: 503 });
    }
    const payload = await response.json() as any;
    if (!String(payload?.message?.content || '').trim()) {
        throw Object.assign(new Error('O modelo Ollama local não produziu resposta no teste.'), { status: 502 });
    }

    return {
        ok: true as const,
        model: env.assistantModel,
        provider: 'ollama' as const,
        localOnly: true as const,
        latencyMs: Date.now() - startedAt,
        usedSyntheticData: true as const,
        canSendCustomerMessages: false as const,
    };
}

export async function analyzeMainTickets(input: {
    companyId: string;
    requestedByUserId: string;
    periodDays: number;
    limit: number;
}) {
    const agent = getReportAssistantAgent();
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - input.periodDays * 86_400_000);

    const tickets = await prisma.ticket.findMany({
        where: { companyId: input.companyId, status: { in: openTicketStatuses } },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: Math.max(input.limit * 3, 30),
        select: {
            id: true,
            protocol: true,
            title: true,
            description: true,
            notesInternal: true,
            priority: true,
            status: true,
            dueAt: true,
            createdAt: true,
            updatedAt: true,
            assignedUser: { select: { id: true } },
            department: { select: { name: true } },
            serviceTopic: { select: { name: true } },
        },
    });

    const inboundActivity = await prisma.message.groupBy({
        by: ['conversationId'],
        where: {
            companyId: input.companyId,
            direction: 'INBOUND',
            deletedAt: null,
            createdAt: { gte: periodStart, lte: periodEnd },
            conversation: { companyId: input.companyId },
        },
        _count: { _all: true },
        _max: { createdAt: true },
    });
    const inboundByConversationId = new Map(inboundActivity.map((item) => [item.conversationId, item]));
    const conversations = inboundActivity.length > 0 ? await prisma.conversation.findMany({
        where: {
            id: { in: inboundActivity.map((item) => item.conversationId) },
            companyId: input.companyId,
            contact: { isWhatsAppGroup: false },
        },
        select: {
            id: true,
            contactId: true,
            closeSummary: true,
            otherTopicDescription: true,
            serviceTopic: { select: { name: true } },
            contact: {
                select: {
                    name: true,
                    phone: true,
                },
            },
            messages: {
                where: {
                    companyId: input.companyId,
                    direction: 'INBOUND',
                    type: 'TEXT',
                    deletedAt: null,
                    body: { not: null },
                    createdAt: { gte: periodStart, lte: periodEnd },
                },
                orderBy: { createdAt: 'desc' },
                take: 2,
                select: { body: true },
            },
        },
    }) : [];

    const customerActivity = new Map<string, {
        contactId: string;
        name: string;
        conversationCount: number;
        inboundMessageCount: number;
        lastContactAt: Date | null;
    }>();
    conversations.forEach((conversation) => {
        const activity = inboundByConversationId.get(conversation.id);
        if (!activity) return;
        const existing = customerActivity.get(conversation.contactId);
        const name = assistantCustomerDisplayName(conversation.contact);
        const lastContactAt = activity._max.createdAt || null;
        customerActivity.set(conversation.contactId, {
            contactId: conversation.contactId,
            name: name.slice(0, 160),
            conversationCount: (existing?.conversationCount || 0) + 1,
            inboundMessageCount: (existing?.inboundMessageCount || 0) + activity._count._all,
            lastContactAt: !existing?.lastContactAt || (lastContactAt && lastContactAt > existing.lastContactAt)
                ? lastContactAt
                : existing.lastContactAt,
        });
    });
    const topCustomers = Array.from(customerActivity.values())
        .sort((a, b) => b.conversationCount - a.conversationCount
            || b.inboundMessageCount - a.inboundMessageCount
            || a.name.localeCompare(b.name, 'pt-BR'))
        .slice(0, 8)
        .map((customer) => ({
            ...customer,
            lastContactAt: customer.lastContactAt?.toISOString() || null,
        }));

    const sampledConversations = [...conversations]
        .sort((a, b) => (inboundByConversationId.get(b.id)?._count._all || 0)
            - (inboundByConversationId.get(a.id)?._count._all || 0))
        .slice(0, 15);
    const conversationAliasById = new Map(sampledConversations.map((conversation, index) => [
        conversation.id,
        `C-${String(index + 1).padStart(3, '0')}`,
    ]));

    const now = Date.now();
    const rankedTickets = tickets
        .map((ticket) => {
            const ageDays = Math.floor((now - ticket.createdAt.getTime()) / 86_400_000);
            const overdueDays = ticket.dueAt && ticket.dueAt.getTime() < now
                ? Math.ceil((now - ticket.dueAt.getTime()) / 86_400_000)
                : 0;
            const waitingWeight = ticket.status === TicketStatus.WAITING_INTERNAL ? 20 : 0;
            const score = priorityWeight[ticket.priority] + Math.min(ageDays, 30) + Math.min(overdueDays * 5, 50) + waitingWeight;
            return { ticket, score };
        })
        .sort((a, b) => b.score - a.score || a.ticket.createdAt.getTime() - b.ticket.createdAt.getTime())
        .slice(0, input.limit);

    const aliasByTicketId = new Map(rankedTickets.map(({ ticket }, index) => [
        ticket.id,
        `T-${String(index + 1).padStart(3, '0')}`,
    ]));
    const ticketIdByAlias = new Map(Array.from(aliasByTicketId, ([ticketId, alias]) => [alias, ticketId]));

    const snapshot = {
        generatedAt: periodEnd.toISOString(),
        periodDays: input.periodDays,
        rules: {
            customerRepliesForbidden: true,
            internalActionsOnly: true,
            opaqueTicketReferencesOnly: true,
            customerIdentityExcluded: true,
            onlyRedactedInboundText: true,
        },
        tickets: rankedTickets.map(({ ticket, score }) => ({
            ticketId: aliasByTicketId.get(ticket.id),
            priority: ticket.priority,
            status: ticket.status,
            dueAt: ticket.dueAt?.toISOString() || null,
            ageDays: Math.floor((now - ticket.createdAt.getTime()) / 86_400_000),
            lastUpdatedAt: ticket.updatedAt.toISOString(),
            hasResponsible: Boolean(ticket.assignedUser),
            department: ticket.department?.name || null,
            topic: ticket.serviceTopic?.name || null,
            deterministicRiskScore: score,
        })),
        conversations: sampledConversations.map((conversation) => ({
            conversationId: conversationAliasById.get(conversation.id)!,
            topic: conversation.serviceTopic?.name
                || redactSensitiveText(conversation.otherTopicDescription)?.slice(0, 160)
                || null,
            closingSummary: redactSensitiveText(conversation.closeSummary)?.slice(0, 500) || null,
            inboundMessages: conversation.messages
                .map((message) => redactSensitiveText(message.body)?.slice(0, 240) || '')
                .filter(Boolean)
                .reverse(),
        })),
    };

    const analysis = await requestLocalAnalysis(snapshot);
    const validConversationAliases = new Set(conversationAliasById.values());
    const problemClusters = analysis.problemClusters.length > 0
        ? analysis.problemClusters
        : buildFallbackProblemClusters(snapshot.conversations);
    const mainProblems = problemClusters
        .map((cluster) => ({
            label: cluster.label,
            description: cluster.description,
            conversationCount: new Set(cluster.conversationIds.filter((id) => validConversationAliases.has(id))).size,
        }))
        .filter((cluster) => cluster.conversationCount > 0)
        .sort((a, b) => b.conversationCount - a.conversationCount || a.label.localeCompare(b.label, 'pt-BR'))
        .slice(0, 6);
    const safeAnalysis = AssistantAnalysisResultSchema.parse({
        ...analysis,
        agent,
        prioritizedTickets: analysis.prioritizedTickets.flatMap((item) => {
            const ticketId = ticketIdByAlias.get(item.ticketId);
            return ticketId ? [{ ...item, ticketId }] : [];
        }),
        taskSuggestions: analysis.taskSuggestions.map((item) => ({
            ...item,
            ticketId: item.ticketId ? ticketIdByAlias.get(item.ticketId) || null : null,
        })),
        conversationStats: {
            periodDays: input.periodDays,
            conversations: conversations.length,
            activeContacts: customerActivity.size,
            inboundMessages: inboundActivity.reduce((total, item) => total + item._count._all, 0),
            sampledConversations: sampledConversations.length,
        },
        topCustomers,
        mainProblems,
    });

    const sourceTickets = rankedTickets.map(({ ticket }) => ({
        id: ticket.id,
        protocol: ticket.protocol,
        title: ticket.title,
        priority: ticket.priority,
        status: ticket.status,
        dueAt: ticket.dueAt,
    }));

    const record = await prisma.assistantAnalysis.create({
        data: {
            companyId: input.companyId,
            requestedByUserId: input.requestedByUserId,
            scope: AssistantAnalysisScope.OVERVIEW,
            model: env.assistantModel,
            summary: safeAnalysis.summary,
            result: safeAnalysis,
            periodStart,
            periodEnd,
        },
    });

    return { ...record, result: safeAnalysis, sourceTickets };
}
