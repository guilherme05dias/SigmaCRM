import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { ReportsSummaryResponse } from '@sigma/shared';
import { createReportWorkbook } from './reportExcel';

const summary: ReportsSummaryResponse = {
    filters: { from: '2026-07-01', to: '2026-07-18', type: 'all' },
    range: { startInclusive: '2026-07-01T03:00:00.000Z', endExclusive: '2026-07-19T03:00:00.000Z', timezone: 'America/Sao_Paulo' },
    attendance: {
        initiated: 1, closed: 1, currentlyOpen: 0, remotelyResolved: 0, convertedToTicket: 1, conversionRate: 100,
        messagesInbound: 2, messagesOutbound: 3, averageWaitSeconds: { value: 60, sampleSize: 1 },
        averageHandleSeconds: { value: 600, sampleSize: 1 }, csat: { value: 10, sampleSize: 1 },
        byAttendant: [], byDepartment: [], byTopic: [], csatByAttendant: [],
    },
    tickets: {
        created: 1, scheduled: 1, inProgress: 0, completed: 0, canceled: 0, whatsappOrigin: 1, manualOrigin: 0,
        averageExecutionSeconds: { value: 3600, sampleSize: 1 }, withoutTechnician: 0, withoutSchedule: 0,
        byTechnician: [], byStatus: [], byDepartment: [],
    },
    technicians: [{ userId: 'tech-1', userName: 'Carlos Técnico', attendanceCount: 1, ticketCount: 1, totalCount: 2 }],
};

describe('exportação Excel dos relatórios', () => {
    it('gera resumo e detalhes com cliente, data, sistema e observação', async () => {
        const buffer = await createReportWorkbook({
            summary,
            type: 'all',
            attendances: [{
                id: 'attendance-1', contactName: 'Cliente A', companyName: 'Empresa A', attendantName: 'Carlos Técnico',
                departmentName: 'Suporte', topicName: 'Sigma PDV', systemProduct: 'Sigma PDV', observation: 'Ajustado remotamente',
                status: 'CLOSED', createdAt: '2026-07-18T12:00:00.000Z', closedAt: '2026-07-18T12:10:00.000Z',
                durationSeconds: 600, rating: 10,
            }],
            tickets: [{
                id: 'ticket-1', protocol: 'ATD-001', customerName: 'Cliente A', origin: 'WHATSAPP', technicianName: 'Carlos Técnico',
                departmentName: 'Suporte', systemProduct: 'Sigma PDV', observation: 'Troca de equipamento',
                scheduledAt: '2026-07-18T13:00:00.000Z', reportDate: '2026-07-18T13:00:00.000Z', status: 'SCHEDULED_FIELD_SERVICE', durationSeconds: null,
            }],
        });

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as any);
        expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Resumo por Técnico', 'Atendimentos', 'Chamados']);
        expect(workbook.getWorksheet('Resumo por Técnico')?.getRow(2).values).toEqual([, 'Carlos Técnico', 1, 1, 2]);
        expect(workbook.getWorksheet('Atendimentos')?.getRow(2).getCell(5).value).toBe('Sigma PDV');
        expect(workbook.getWorksheet('Atendimentos')?.getRow(2).getCell(6).value).toBe('Ajustado remotamente');
        expect((workbook.getWorksheet('Atendimentos')?.getRow(2).getCell(4).value as Date).getUTCHours()).toBe(9);
        expect(workbook.getWorksheet('Chamados')?.getRow(2).getCell(6).value).toBe('Sigma PDV');
        expect(workbook.getWorksheet('Chamados')?.getRow(2).getCell(7).value).toBe('Troca de equipamento');
    });
});
