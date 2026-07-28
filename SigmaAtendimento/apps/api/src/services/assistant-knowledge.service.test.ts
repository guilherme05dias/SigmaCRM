import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
    ticket: { findMany: vi.fn() },
    conversation: { findMany: vi.fn() },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));

import { findAssistantTaskReferences } from './assistant-knowledge.service';

describe('assistant knowledge service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        prismaMock.ticket.findMany.mockResolvedValue([]);
        prismaMock.conversation.findMany.mockResolvedValue([]);
    });

    it('prioriza a referência oficial da edição e consulta somente o histórico da empresa', async () => {
        prismaMock.ticket.findMany.mockResolvedValue([{
            id: 'ticket-resolvido',
            title: 'Yoda sem comunicação após troca do IP',
            description: 'A estação ainda apontava para o endereço antigo.',
            notesInternal: 'Atualizado o IP do servidor e validada consulta à SEFAZ.',
            fieldService: null,
        }]);

        const references = await findAssistantTaskReferences({
            companyId: 'empresa-1',
            title: 'Erro COMM ao transmitir NFC-e',
            description: 'Uniplus Desktop não comunica com o Yoda.',
            serviceTopicId: 'uniplus-topic',
            serviceTopicName: 'Uniplus',
            ticketId: 'ticket-atual',
        });

        expect(references[0].id).toBe('UNIPLUS-DESKTOP-YODA-COMM');
        expect(references.some((reference) => reference.sourceType === 'INTERNAL_CASE')).toBe(true);
        expect(prismaMock.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                companyId: 'empresa-1',
                serviceTopicId: 'uniplus-topic',
                id: { not: 'ticket-atual' },
            }),
        }));
        expect(prismaMock.conversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                companyId: 'empresa-1',
                serviceTopicId: 'uniplus-topic',
            }),
        }));
    });

    it('separa a integração do Secullum Ponto Web das referências offline', async () => {
        const references = await findAssistantTaskReferences({
            companyId: 'empresa-1',
            title: 'API retorna erro de TLS',
            description: 'Integração externa do Secullum Ponto Web.',
            serviceTopicName: 'Secullum',
        });

        expect(references[0].id).toBe('SECULLUM-WEB-API');
        expect(references[0].edition).toBe('WEB');
        expect(references.some((reference) => reference.id === 'SECULLUM-PONTO4-TECH')).toBe(false);
        expect(prismaMock.ticket.findMany).not.toHaveBeenCalled();
    });

    it('não mistura comunicação e banco de horas em uma tarefa de layout da folha', async () => {
        const references = await findAssistantTaskReferences({
            companyId: 'empresa-1',
            title: 'Criar layout de exportação',
            description: 'Secullum Ponto 4 offline para importar eventos na folha em TXT.',
            serviceTopicName: 'Secullum',
        });

        expect(references.map((reference) => reference.id)).toEqual(['SECULLUM-PONTO4-TECH']);
    });

    it('não mistura documentação de outro sistema quando o assunto não está identificado', async () => {
        const references = await findAssistantTaskReferences({
            companyId: 'empresa-1',
            title: 'Revisar processo interno',
            description: 'Ainda não foi informado qual sistema está envolvido.',
        });

        expect(references).toEqual([]);
    });
});
