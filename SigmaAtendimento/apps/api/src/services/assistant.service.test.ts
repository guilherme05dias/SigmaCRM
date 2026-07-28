import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
    ticket: { findMany: vi.fn() },
    message: { groupBy: vi.fn() },
    conversation: { findMany: vi.fn() },
    assistantAnalysis: { create: vi.fn() },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));

import { env } from '../config/env';
import {
    analyzeMainTickets,
    assistantCustomerDisplayName,
    buildDeterministicLocalAnalysis,
    getAssistantStatus,
    isLocalOllamaModel,
    isSafeLocalOllamaUrl,
    planAssistantTask,
    redactSensitiveText,
    requestLocalAnalysis,
    testAssistantConnection,
} from './assistant.service';

const originalConfig = {
    assistantEnabled: env.assistantEnabled,
    ollamaBaseUrl: env.ollamaBaseUrl,
    assistantModel: env.assistantModel,
};

const validAnalysis = {
    summary: 'Dois chamados precisam de acompanhamento.',
    keyRisks: ['Prazo vencido'],
    prioritizedTickets: [{ ticketId: 'T-001', rank: 1, reason: 'Vencido', recommendedAction: 'Revisar internamente' }],
    taskSuggestions: [{ suggestionId: 's1', title: 'Revisar chamado', description: 'Checar pendência.', priority: 'HIGH', dueInDays: 1, ticketId: 'T-001' }],
};

function ollamaResponse(analysis: unknown = validAnalysis) {
    return new Response(JSON.stringify({ message: { role: 'assistant', content: JSON.stringify(analysis) } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    env.assistantEnabled = true;
    env.ollamaBaseUrl = 'http://127.0.0.1:11434';
    env.assistantModel = 'llama3.2:1b';
    prismaMock.message.groupBy.mockResolvedValue([]);
    prismaMock.conversation.findMany.mockResolvedValue([]);
});

afterEach(() => {
    Object.assign(env, originalConfig);
    vi.unstubAllGlobals();
});

describe('assistant service', () => {
    it('mascara o telefone quando o provedor usa o número como nome do contato', () => {
        expect(assistantCustomerDisplayName({ name: '554931993004', phone: '554931993004' })).toBe('Contato final 3004');
        expect(assistantCustomerDisplayName({ name: 'Maria', phone: '554999999999' })).toBe('Maria');
        expect(assistantCustomerDisplayName({
            name: 'Contato salvo no CRM',
            phone: '554999999999',
        })).toBe('Contato salvo no CRM');
    });

    it('classifica o problema relatado antes do nome do sistema na contingência', () => {
        const result = buildDeterministicLocalAnalysis({
            conversations: [{
                conversationId: 'C-001',
                topic: 'Uniplus',
                closingSummary: null,
                inboundMessages: ['Não consigo entrar, aparece erro de senha.'],
            }],
        }, 'timeout');

        expect(result.problemClusters[0]).toMatchObject({ label: 'Acesso e senha', conversationIds: ['C-001'] });
    });

    it('remove telefone, e-mail e documento de qualquer texto auxiliar', () => {
        const result = redactSensitiveText('Maria 49 99816-9328 maria@empresa.com CPF 123.456.789-10');
        expect(result).not.toContain('99816');
        expect(result).not.toContain('maria@empresa.com');
        expect(result).not.toContain('123.456.789-10');
        expect(result).toContain('[telefone]');
        expect(result).toContain('[email]');
        expect(result).toContain('[documento]');
    });

    it('usa somente o Ollama local, sem autenticação ou ferramentas, e valida o JSON estruturado', async () => {
        let requestedUrl = '';
        let requestBody: any;
        let requestHeaders: HeadersInit | undefined;
        const fetchMock = async (url: string | URL | Request, init?: RequestInit) => {
            requestedUrl = String(url);
            requestBody = JSON.parse(String(init?.body));
            requestHeaders = init?.headers;
            return ollamaResponse();
        };

        const result = await requestLocalAnalysis({ tickets: [] }, fetchMock as typeof fetch);

        expect(result.summary).toContain('chamados');
        expect(result.analysisMode).toBe('LOCAL_MODEL');
        expect(requestedUrl).toBe('http://127.0.0.1:11434/api/chat');
        expect(JSON.stringify(requestHeaders)).not.toContain('Authorization');
        expect(requestBody.model).toBe('llama3.2:1b');
        expect(requestBody.stream).toBe(false);
        expect(requestBody.think).toBe(false);
        expect(requestBody.tools).toBeUndefined();
        expect(requestBody.format.type).toBe('object');
        expect(JSON.stringify(requestBody)).toContain('Nunca escreva respostas para clientes');
    });

    it('entende o problema e o divide em pequenas etapas verificáveis', async () => {
        let requestBody: any;
        const fetchMock = async (_url: string | URL | Request, init?: RequestInit) => {
            requestBody = JSON.parse(String(init?.body));
            return ollamaResponse({
                understanding: 'O usuário não consegue acessar o sistema após uma atualização.',
                steps: [
                    'Confirmar a mensagem de erro apresentada.',
                    'Reproduzir o acesso em ambiente controlado.',
                    'Identificar a configuração alterada pela atualização.',
                    'Aplicar a correção necessária.',
                    'Validar o acesso e registrar o resultado.',
                ],
            });
        };

        const result = await planAssistantTask({
            title: 'Corrigir acesso',
            description: 'Cliente 49 99816-9328 recebe erro após atualizar.',
            context: 'Contato maria@empresa.com informou falha de login.',
            serviceTopic: 'Uniplus Desktop',
            references: [{
                id: 'UNIPLUS-DESKTOP-YODA',
                title: 'Servidor Yoda — Uniplus Desktop',
                summary: 'Verificar o serviço Yoda e o status das tarefas no servidor.',
                system: 'UNIPLUS',
                edition: 'DESKTOP',
                sourceType: 'OFFICIAL_DOC',
                sourceLabel: 'Documentação oficial',
                url: 'https://unisoftsistemas.com.br/servidor-yoda/',
            }],
        }, fetchMock as typeof fetch);

        expect(result.analysisMode).toBe('LOCAL_MODEL');
        expect(result.agent.id).toBe('UNIPLUS_SPECIALIST');
        expect(result.steps).toHaveLength(5);
        expect(result.understanding).toContain('atualização');
        expect(JSON.stringify(requestBody)).toContain('Divida o trabalho em 3 a 7 etapas pequenas');
        expect(JSON.stringify(requestBody)).toContain('UNIPLUS-DESKTOP-YODA');
        expect(result.references).toHaveLength(1);
        expect(JSON.stringify(requestBody)).not.toContain('99816');
        expect(JSON.stringify(requestBody)).not.toContain('maria@empresa.com');
    });

    it('mantém um plano operacional seguro quando o modelo local falha', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
        const result = await planAssistantTask({
            title: 'Investigar falha de impressão',
            description: null,
        }, fetchMock as typeof fetch);

        expect(result.analysisMode).toBe('LOCAL_RULES');
        expect(result.agent.id).toBe('GENERAL_TASKS');
        expect(result.steps).toHaveLength(5);
        expect(result.steps[0]).toContain('Confirmar');
        expect(result.steps.at(-1)).toContain('Validar');
    });

    it('gera etapas específicas para Secullum offline mesmo sem o modelo local', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
        const result = await planAssistantTask({
            title: 'Relógio não envia batidas',
            description: 'O equipamento parou de comunicar após a troca de rede.',
            serviceTopic: 'Secullum Ponto 4',
            references: [],
        }, fetchMock as typeof fetch);

        expect(result.analysisMode).toBe('LOCAL_RULES');
        expect(result.agent.id).toBe('SECULLUM_SPECIALIST');
        expect(result.steps.join(' ')).toContain('modelo do relógio');
        expect(result.steps.join(' ')).toContain('arquivo texto');
        expect(result.steps.join(' ')).toContain('Ponto Diário');
    });

    it('detalha a criação de layout da folha no Secullum', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
        const result = await planAssistantTask({
            title: 'Criar layout de exportação',
            description: 'Gerar TXT do Secullum Ponto 4 para importar na folha.',
            serviceTopic: 'Secullum',
            references: [],
        }, fetchMock as typeof fetch);

        expect(result.steps.join(' ')).toContain('códigos de eventos');
        expect(result.steps.join(' ')).toContain('codificação');
        expect(result.steps.join(' ')).toContain('ambiente de homologação');
    });

    it('fica indisponível quando o assistente está desativado', async () => {
        env.assistantEnabled = false;
        await expect(requestLocalAnalysis({})).rejects.toMatchObject({ status: 503 });
    });

    it('conclui por regras locais quando o modelo excede o tempo', async () => {
        const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
        const fetchMock = vi.fn().mockRejectedValue(timeout);

        const result = await requestLocalAnalysis({
            tickets: [{
                ticketId: 'T-001',
                priority: 'CRITICAL',
                status: 'NEW',
                dueAt: '2026-07-20T12:00:00.000Z',
                ageDays: 8,
                hasResponsible: false,
                deterministicRiskScore: 95,
            }],
        }, fetchMock as typeof fetch);

        expect(result.analysisMode).toBe('LOCAL_RULES');
        expect(result.summary).toContain('regras operacionais locais');
        expect(result.summary).toContain('limite de tempo');
        expect(result.prioritizedTickets[0]).toMatchObject({ ticketId: 'T-001', rank: 1 });
        expect(result.taskSuggestions[0]).toMatchObject({ ticketId: 'T-001', priority: 'CRITICAL', dueInDays: 0 });
    });

    it('bloqueia endpoint remoto e qualquer modelo cloud antes de chamar a rede', async () => {
        const fetchMock = vi.fn();
        env.ollamaBaseUrl = 'http://192.168.0.20:11434';
        await expect(requestLocalAnalysis({}, fetchMock as typeof fetch)).rejects.toMatchObject({
            status: 503,
            message: expect.stringContaining('não é local'),
        });

        env.ollamaBaseUrl = 'http://127.0.0.1:11434';
        env.assistantModel = 'modelo-cloud';
        await expect(requestLocalAnalysis({}, fetchMock as typeof fetch)).rejects.toMatchObject({
            status: 503,
            message: expect.stringContaining('cloud'),
        });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(isSafeLocalOllamaUrl('https://127.0.0.1:11434')).toBe(false);
        expect(isLocalOllamaModel('qwen3:8b-cloud')).toBe(false);
        expect(getAssistantStatus().enabled).toBe(false);
    });

    it('testa a conexão somente com dados sintéticos', async () => {
        let requestBody: any;
        vi.stubGlobal('fetch', async (_url: string | URL | Request, init?: RequestInit) => {
            requestBody = JSON.parse(String(init?.body));
            return ollamaResponse({ summary: 'Teste concluído.', keyRisks: [], prioritizedTickets: [], taskSuggestions: [] });
        });

        const connection = await testAssistantConnection();
        const serialized = JSON.stringify(requestBody);

        expect(serialized).toContain('Teste local sintético');
        expect(serialized).toContain('SIGMA_LOCAL_OK');
        expect(serialized).not.toContain('company-1');
        expect(serialized).not.toContain('ticket-1');
        expect(connection).toMatchObject({
            ok: true,
            provider: 'ollama',
            localOnly: true,
            usedSyntheticData: true,
            canSendCustomerMessages: false,
        });
    });

    it('mantém o tenant, minimiza dados e descarta IDs inventados pelo modelo', async () => {
        prismaMock.ticket.findMany.mockResolvedValue([{
            id: 'ticket-1',
            protocol: 'ATD-001',
            title: 'Cliente 49 99816-9328',
            description: 'Contato maria@empresa.com',
            notesInternal: 'CPF 123.456.789-10',
            priority: 'CRITICAL',
            status: 'NEW',
            dueAt: new Date('2026-07-19T12:00:00.000Z'),
            createdAt: new Date('2026-07-10T12:00:00.000Z'),
            updatedAt: new Date('2026-07-20T12:00:00.000Z'),
            assignedUser: { id: 'private-user-id' },
            department: { name: 'Suporte' },
            serviceTopic: { name: 'Sistema' },
        }]);
        prismaMock.message.groupBy.mockResolvedValue([{
            conversationId: 'conversation-1',
            _count: { _all: 4 },
            _max: { createdAt: new Date('2026-07-20T13:00:00.000Z') },
        }]);
        prismaMock.conversation.findMany.mockResolvedValue([{
            id: 'conversation-1',
            contactId: 'contact-1',
            closeSummary: 'Cliente não consegue acessar com CPF 123.456.789-10',
            otherTopicDescription: null,
            serviceTopic: { name: 'Acesso ao sistema' },
            contact: {
                name: 'Maria',
                phone: '5549998169328',
                customer: { name: 'Empresa Exemplo' },
                business: null,
            },
            messages: [{ body: 'Meu e-mail é maria@empresa.com e não consigo entrar' }],
        }]);
        prismaMock.assistantAnalysis.create.mockImplementation(async ({ data }) => ({ id: 'analysis-1', ...data }));

        let requestBody: any;
        vi.stubGlobal('fetch', async (_url: string | URL | Request, init?: RequestInit) => {
            requestBody = JSON.parse(String(init?.body));
            return ollamaResponse({
                summary: 'Um chamado precisa de atenção.',
                keyRisks: ['Prazo vencido'],
                prioritizedTickets: [
                    { ticketId: 'T-001', rank: 1, reason: 'Vencido', recommendedAction: 'Revisar internamente' },
                    { ticketId: 'ticket-inventado', rank: 2, reason: 'Sem evidência', recommendedAction: 'Ignorar' },
                ],
                taskSuggestions: [
                    { suggestionId: 's1', title: 'Revisar chamado', description: 'Checar pendência.', priority: 'HIGH', dueInDays: 1, ticketId: 'ticket-inventado' },
                ],
                problemClusters: [
                    { label: 'Problemas de acesso', description: 'Clientes relatam dificuldade para entrar.', conversationIds: ['C-001', 'C-999'] },
                ],
            });
        });

        const result = await analyzeMainTickets({
            companyId: 'company-1',
            requestedByUserId: 'user-1',
            periodDays: 7,
            limit: 15,
        });

        expect(prismaMock.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ companyId: 'company-1' }),
        }));
        const snapshot = JSON.parse(requestBody.messages[1].content);
        const serializedSnapshot = JSON.stringify(snapshot);
        expect(serializedSnapshot).not.toContain('99816');
        expect(serializedSnapshot).not.toContain('maria@empresa.com');
        expect(serializedSnapshot).not.toContain('123.456.789-10');
        expect(serializedSnapshot).not.toContain('private-user-id');
        expect(serializedSnapshot).not.toContain('ATD-001');
        expect(snapshot.tickets[0]).not.toHaveProperty('title');
        expect(snapshot.tickets[0].ticketId).toBe('T-001');
        expect(snapshot.tickets[0].hasResponsible).toBe(true);
        expect(serializedSnapshot).toContain('[email]');
        expect(serializedSnapshot).toContain('[documento]');
        expect(serializedSnapshot).not.toContain('Empresa Exemplo');
        expect(serializedSnapshot).not.toContain('5549998169328');
        expect(result.result.prioritizedTickets).toHaveLength(1);
        expect(result.result.prioritizedTickets[0].ticketId).toBe('ticket-1');
        expect(result.result.taskSuggestions[0].ticketId).toBeNull();
        expect(result.sourceTickets[0].id).toBe('ticket-1');
        expect(result.result.topCustomers[0]).toMatchObject({
            contactId: 'contact-1',
            name: 'Maria',
            conversationCount: 1,
            inboundMessageCount: 4,
        });
        expect(result.result.mainProblems[0]).toMatchObject({ label: 'Problemas de acesso', conversationCount: 1 });
        expect(result.result.agent.id).toBe('REPORT_ANALYST');
        expect(prismaMock.assistantAnalysis.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ companyId: 'company-1', requestedByUserId: 'user-1', model: 'llama3.2:1b' }),
        }));
    });
});
