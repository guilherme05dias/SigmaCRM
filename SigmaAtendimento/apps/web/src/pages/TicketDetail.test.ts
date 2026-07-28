// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildTicketUpdatePayload, type TicketFormState } from './TicketDetail';

const form: TicketFormState = {
    title: 'Troca de equipamento',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    description: 'Descrição administrativa',
    notesInternal: 'Fonte substituída e testes concluídos',
    serviceType: 'PRESENCIAL',
    fieldVisitStatus: 'IN_PROGRESS',
    equipment: 'Notebook',
    technicianId: '11111111-1111-4111-8111-111111111111',
    scheduledAt: '',
    scheduleChangeReason: '',
    visitAddress: 'Rua de teste',
    visitWindowStart: '',
    visitWindowEnd: '',
    result: 'Funcionando',
    serviceDescription: 'Substituição da fonte',
    materialsUsed: 'Fonte 90W',
    photos: 'https://example.com/foto.jpg',
    hoursSpent: '1.5',
};

describe('payload de edição do chamado por perfil', () => {
    it('envia status, observações e execução sem campos administrativos para o técnico', () => {
        const payload = buildTicketUpdatePayload(form, 'TECHNICIAN');

        expect(payload).toMatchObject({
            status: 'IN_PROGRESS',
            notesInternal: 'Fonte substituída e testes concluídos',
            fieldVisitStatus: 'IN_PROGRESS',
            serviceDescription: 'Substituição da fonte',
            hoursSpent: 1.5,
        });
        expect(payload).not.toHaveProperty('title');
        expect(payload).not.toHaveProperty('priority');
        expect(payload).not.toHaveProperty('description');
        expect(payload).not.toHaveProperty('serviceType');
        expect(payload).not.toHaveProperty('technicianId');
    });

    it('mantém o payload completo para administradores e supervisores', () => {
        const payload = buildTicketUpdatePayload(form, 'SUPERVISOR');

        expect(payload).toMatchObject({
            title: 'Troca de equipamento',
            priority: 'HIGH',
            description: 'Descrição administrativa',
            serviceType: 'PRESENCIAL',
            technicianId: '11111111-1111-4111-8111-111111111111',
        });
    });
});
