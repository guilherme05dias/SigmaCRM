import { TicketStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type AssistantKnowledgeSystem = 'UNIPLUS' | 'SECULLUM';
export type AssistantKnowledgeEdition = 'DESKTOP' | 'WEB' | 'GENERAL';
export type AssistantKnowledgeSource = 'OFFICIAL_DOC' | 'INTERNAL_CASE';

export interface AssistantKnowledgeReference {
    id: string;
    title: string;
    summary: string;
    system: AssistantKnowledgeSystem;
    edition: AssistantKnowledgeEdition;
    sourceType: AssistantKnowledgeSource;
    sourceLabel: string;
    url: string | null;
}

interface OfficialKnowledgeEntry extends AssistantKnowledgeReference {
    keywords: string[];
}

const officialKnowledge: OfficialKnowledgeEntry[] = [
    {
        id: 'UNIPLUS-CENTRAL',
        title: 'Central de ajuda Uniplus',
        summary: 'Índice oficial separado entre Uniplus Desktop e Uniplus Web, com procedimentos de cadastros, vendas, fiscal, estoque, financeiro, notas fiscais, PDV e recursos adicionais.',
        system: 'UNIPLUS',
        edition: 'GENERAL',
        sourceType: 'OFFICIAL_DOC',
        sourceLabel: 'Documentação oficial',
        url: 'https://unisoftsistemas.com.br/central-de-ajuda/',
        keywords: ['cadastro', 'venda', 'fiscal', 'estoque', 'financeiro', 'nota', 'pdv', 'produto', 'serviço', 'usuario'],
    },
    {
        id: 'UNIPLUS-DESKTOP-YODA',
        title: 'Servidor Yoda — Uniplus Desktop',
        summary: 'O Yoda centraliza serviços do Uniplus Desktop como certificado digital, emissão fiscal, comunicação com PDV, backups e consultas à SEFAZ. A referência orienta verificar execução, gerenciador de tarefas, status do PDV e pendências.',
        system: 'UNIPLUS',
        edition: 'DESKTOP',
        sourceType: 'OFFICIAL_DOC',
        sourceLabel: 'Documentação oficial',
        url: 'https://unisoftsistemas.com.br/servidor-yoda/',
        keywords: ['yoda', 'servidor', 'pdv', 'certificado', 'backup', 'sefaz', 'nfe', 'nfce', 'pendencia', 'sincronização', 'comunicação'],
    },
    {
        id: 'UNIPLUS-DESKTOP-YODA-COMM',
        title: 'Erro de comunicação com o Yoda',
        summary: 'Para falhas fiscais no Desktop, a verificação oficial passa pelo processo Yoda no servidor, IP configurado nas estações, porta 8443, firewall e conectividade entre estação e servidor.',
        system: 'UNIPLUS',
        edition: 'DESKTOP',
        sourceType: 'OFFICIAL_DOC',
        sourceLabel: 'Documentação oficial',
        url: 'https://unisoftsistemas.com.br/erro-ao-comunicar-com-metodo-yoda/',
        keywords: ['erro', 'comunicação', 'yoda', 'porta', '8443', 'ip', 'firewall', 'nfe', 'nfce', 'sefaz', 'estação', 'servidor'],
    },
    {
        id: 'UNIPLUS-DESKTOP-BACKUP',
        title: 'Backup do sistema de retaguarda',
        summary: 'Procedimento oficial de backup do Uniplus Desktop. Deve ser consultado antes de manutenção de servidor ou banco; o agente não deve sugerir alteração direta na base sem cópia validada e autorização.',
        system: 'UNIPLUS',
        edition: 'DESKTOP',
        sourceType: 'OFFICIAL_DOC',
        sourceLabel: 'Documentação oficial',
        url: 'https://unisoftsistemas.com.br/backup-sistema-retaguarda/',
        keywords: ['backup', 'banco', 'base', 'restaurar', 'restauração', 'servidor', 'retaguarda', 'manutenção'],
    },
    {
        id: 'UNIPLUS-WEB-PRODUTO',
        title: 'Cadastro de produto — Uniplus Web',
        summary: 'Referência oficial para cadastro de produto no Web, incluindo dados fiscais, CFOPs, custos, preço, características físicas e opções avançadas usadas pelo PDV.',
        system: 'UNIPLUS',
        edition: 'WEB',
        sourceType: 'OFFICIAL_DOC',
        sourceLabel: 'Documentação oficial',
        url: 'https://unisoftsistemas.com.br/cadastro-de-produto-web/',
        keywords: ['produto', 'cadastro', 'cfop', 'cest', 'icms', 'custo', 'preço', 'estoque', 'ean', 'tributação'],
    },
    {
        id: 'UNIPLUS-WEB-FISCAL',
        title: 'Notas fiscais — Uniplus Web',
        summary: 'Base oficial para rotinas fiscais no Web, incluindo emissão, entrada por XML, NFS-e e tratamento de notas vinculadas a ordens de serviço.',
        system: 'UNIPLUS',
        edition: 'WEB',
        sourceType: 'OFFICIAL_DOC',
        sourceLabel: 'Documentação oficial',
        url: 'https://unisoftsistemas.com.br/categoria/wiki-web/notas-fiscais-wiki-web/',
        keywords: ['nota', 'nfe', 'nfse', 'xml', 'fiscal', 'emissão', 'cancelamento', 'entrada', 'ordem', 'serviço'],
    },
    {
        id: 'SECULLUM-PONTO4-TECH',
        title: 'Ficha técnica — Ponto Secullum 4',
        summary: 'O Ponto Secullum 4 é cliente/servidor e pode usar Access, SQL Server ou Oracle. A ficha descreve tratamento de marcações, banco de horas, logs, equipamentos e módulo Web. Não presume nomes de tabelas.',
        system: 'SECULLUM',
        edition: 'DESKTOP',
        sourceType: 'OFFICIAL_DOC',
        sourceLabel: 'Documentação oficial',
        url: 'https://www.secullum.com.br/docs/portugues/Ficha_Ponto4.pdf',
        keywords: ['banco', 'base', 'access', 'sql', 'oracle', 'servidor', 'desktop', 'ponto 4', 'log', 'relatório', 'backup', 'exportação', 'folha', 'txt', 'layout'],
    },
    {
        id: 'SECULLUM-PONTO4-EQUIPAMENTO',
        title: 'Comunicação com equipamento — Ponto Secullum 4',
        summary: 'A comunicação pode ser direta ou por software intermediário que gera arquivo texto. O diagnóstico deve confirmar modelo do relógio, pacote de comunicação, cadastro do equipamento e forma de importação das batidas.',
        system: 'SECULLUM',
        edition: 'DESKTOP',
        sourceType: 'OFFICIAL_DOC',
        sourceLabel: 'Documentação oficial',
        url: 'https://www.secullum.com.br/imagens/perguntas/612/comunicacao.pdf',
        keywords: ['equipamento', 'relógio', 'rep', 'batida', 'marcação', 'comunicação', 'arquivo', 'texto', 'importação', 'pacote'],
    },
    {
        id: 'SECULLUM-PONTO4-BANCO-HORAS',
        title: 'Banco de horas — Ponto Secullum 4',
        summary: 'A configuração oficial envolve habilitar o banco no horário, definir a data de início no funcionário, revisar regras de extras, faltas e atrasos e validar as colunas de saldo, crédito, débito e ajustes.',
        system: 'SECULLUM',
        edition: 'DESKTOP',
        sourceType: 'OFFICIAL_DOC',
        sourceLabel: 'Documentação oficial',
        url: 'https://www.secullum.com.br/pt/perguntas-frequentes/603',
        keywords: ['banco de horas', 'hora extra', 'falta', 'atraso', 'saldo', 'funcionário', 'horário', 'cálculo', 'ajuste'],
    },
    {
        id: 'SECULLUM-WEB-PRODUTO',
        title: 'Secullum Ponto Web',
        summary: 'Visão oficial do Ponto Web: marcações, reconhecimento facial, ajustes, detalhamento de cálculos, cartão ponto, aplicativos e integração com equipamentos por agentes de comunicação.',
        system: 'SECULLUM',
        edition: 'WEB',
        sourceType: 'OFFICIAL_DOC',
        sourceLabel: 'Documentação oficial',
        url: 'https://www.secullum.com.br/pt/produtos/ponto',
        keywords: ['web', 'nuvem', 'facial', 'aplicativo', 'cálculo', 'cartão', 'ponto', 'agente', 'equipamento', 'marcação'],
    },
    {
        id: 'SECULLUM-WEB-API',
        title: 'Integração Externa — Secullum Ponto Web',
        summary: 'A API oficial exige plano PRO ou superior e TLS 1.2 ou superior. Expõe recursos como batidas, cálculos, funcionários, horários, empresas, equipamentos e justificativas.',
        system: 'SECULLUM',
        edition: 'WEB',
        sourceType: 'OFFICIAL_DOC',
        sourceLabel: 'Documentação oficial',
        url: 'https://pontowebintegracaoexterna.secullum.com.br/docs/index.html',
        keywords: ['api', 'integração', 'tls', 'pro', 'batida', 'funcionário', 'horário', 'empresa', 'equipamento', 'justificativa'],
    },
];

function normalize(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR');
}

function tokenize(value: string) {
    const stopwords = new Set([
        'para', 'com', 'sem', 'uma', 'uns', 'das', 'dos', 'que', 'por', 'ser',
        'sistema', 'cliente', 'problema', 'criar', 'fazer', 'secullum', 'uniplus', 'ponto',
    ]);
    return new Set(normalize(value)
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 3 && !stopwords.has(token)));
}

function minimizeInternalText(value?: string | null, maxLength = 700) {
    if (!value) return null;
    return value
        .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]')
        .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s]?\d{4}/g, '[telefone]')
        .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento]')
        .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[documento]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function detectSystem(value: string): AssistantKnowledgeSystem | null {
    const normalized = normalize(value);
    if (normalized.includes('uniplus')) return 'UNIPLUS';
    if (normalized.includes('secullum') || normalized.includes('ponto 4') || normalized.includes('ponto web')) return 'SECULLUM';
    return null;
}

function detectEdition(value: string): AssistantKnowledgeEdition | null {
    const normalized = normalize(value);
    if (/\b(web|online|nuvem|cloud|api)\b/.test(normalized)) return 'WEB';
    if (/\b(desktop|offline|local|retaguarda|yoda|ponto 4|servidor|estacao)\b/.test(normalized)) return 'DESKTOP';
    return null;
}

function officialReferences(input: {
    title: string;
    description?: string | null;
    context?: string | null;
    serviceTopicName?: string | null;
}) {
    const text = [input.serviceTopicName, input.title, input.description, input.context].filter(Boolean).join(' ');
    const system = detectSystem(text);
    if (!system) return [];
    const edition = detectEdition(text);
    const inputTokens = tokenize(text);

    return officialKnowledge
        .filter((entry) => entry.system === system)
        .map((entry) => {
            const keywordScore = entry.keywords.reduce((score, keyword) => {
                const normalizedKeyword = normalize(keyword);
                const keywordTokens = [...tokenize(keyword)];
                if (keywordTokens.length === 0) return score;
                if (normalize(text).includes(normalizedKeyword)) return score + (normalizedKeyword.includes(' ') ? 4 : 2);
                return score + keywordTokens.filter((token) => inputTokens.has(token)).length;
            }, 0);
            const editionScore = entry.edition === edition ? 8 : entry.edition === 'GENERAL' ? 3 : edition ? -4 : 0;
            return { entry, keywordScore, score: keywordScore + editionScore };
        })
        .sort((a, b) => b.score - a.score)
        .filter(({ keywordScore, entry }) => keywordScore > 0 || entry.edition === 'GENERAL')
        .slice(0, 4)
        .map(({ entry: { keywords: _keywords, ...reference } }) => reference);
}

function internalCaseScore(queryTokens: Set<string>, value: string) {
    const candidateTokens = tokenize(value);
    let score = 0;
    queryTokens.forEach((token) => {
        if (candidateTokens.has(token)) score += 1;
    });
    return score;
}

async function internalReferences(input: {
    companyId: string;
    title: string;
    description?: string | null;
    context?: string | null;
    serviceTopicId?: string | null;
    serviceTopicName?: string | null;
    ticketId?: string | null;
    conversationId?: string | null;
}) {
    if (!input.serviceTopicId) return [];
    const system = detectSystem([input.serviceTopicName, input.title].filter(Boolean).join(' '));
    if (!system) return [];

    const ticketWhere = {
        companyId: input.companyId,
        serviceTopicId: input.serviceTopicId,
        status: { in: [TicketStatus.RESOLVED, TicketStatus.CLOSED] },
        ...(input.ticketId ? { id: { not: input.ticketId } } : {}),
    };
    const conversationWhere = {
        companyId: input.companyId,
        serviceTopicId: input.serviceTopicId,
        closedAt: { not: null },
        OR: [{ closeSummary: { not: null } }, { closeNotes: { not: null } }],
        ...(input.conversationId ? { id: { not: input.conversationId } } : {}),
    };
    const [tickets, conversations] = await Promise.all([
        prisma.ticket.findMany({
            where: ticketWhere,
            orderBy: [{ solvedAt: 'desc' }, { closedAt: 'desc' }, { updatedAt: 'desc' }],
            take: 20,
            select: {
                id: true,
                title: true,
                description: true,
                notesInternal: true,
                fieldService: {
                    select: {
                        serviceDescription: true,
                        resolution: true,
                        result: true,
                    },
                },
            },
        }),
        prisma.conversation.findMany({
            where: conversationWhere,
            orderBy: [{ closedAt: 'desc' }, { updatedAt: 'desc' }],
            take: 20,
            select: {
                id: true,
                closeSummary: true,
                closeNotes: true,
                closeResult: true,
            },
        }),
    ]);

    const queryTokens = tokenize([input.title, input.description, input.context].filter(Boolean).join(' '));
    const candidates: Array<{ reference: AssistantKnowledgeReference; score: number }> = [];

    tickets.forEach((ticket) => {
        const content = [
            ticket.title,
            ticket.description,
            ticket.notesInternal,
            ticket.fieldService?.serviceDescription,
            ticket.fieldService?.resolution,
            ticket.fieldService?.result,
        ].filter(Boolean).join(' — ');
        const summary = minimizeInternalText(content);
        const title = minimizeInternalText(ticket.title, 120);
        if (!summary || !title) return;
        candidates.push({
            score: internalCaseScore(queryTokens, content),
            reference: {
                id: `CASE-TICKET-${ticket.id}`,
                title: `Caso resolvido: ${title}`,
                summary,
                system,
                edition: detectEdition(content) || 'GENERAL',
                sourceType: 'INTERNAL_CASE',
                sourceLabel: 'Histórico da empresa',
                url: null,
            },
        });
    });

    conversations.forEach((conversation) => {
        const content = [conversation.closeSummary, conversation.closeNotes, conversation.closeResult].filter(Boolean).join(' — ');
        const summary = minimizeInternalText(content);
        if (!summary) return;
        candidates.push({
            score: internalCaseScore(queryTokens, content),
            reference: {
                id: `CASE-CONVERSATION-${conversation.id}`,
                title: `Atendimento resolvido: ${summary.slice(0, 90)}`,
                summary,
                system,
                edition: detectEdition(content) || 'GENERAL',
                sourceType: 'INTERNAL_CASE',
                sourceLabel: 'Histórico da empresa',
                url: null,
            },
        });
    });

    return candidates
        .sort((a, b) => b.score - a.score)
        .filter(({ score }) => score > 0)
        .slice(0, 2)
        .map(({ reference }) => reference);
}

export async function findAssistantTaskReferences(input: {
    companyId: string;
    title: string;
    description?: string | null;
    context?: string | null;
    serviceTopicId?: string | null;
    serviceTopicName?: string | null;
    ticketId?: string | null;
    conversationId?: string | null;
}): Promise<AssistantKnowledgeReference[]> {
    const official = officialReferences(input);
    let internal: AssistantKnowledgeReference[] = [];
    try {
        internal = await internalReferences(input);
    } catch {
        // A indisponibilidade do histórico não deve impedir o plano baseado na documentação oficial.
    }
    return [...official, ...internal].slice(0, 6);
}

export const assistantOfficialKnowledge = officialKnowledge.map(({ keywords: _keywords, ...reference }) => reference);
