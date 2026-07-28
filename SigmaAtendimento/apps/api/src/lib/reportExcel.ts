import ExcelJS from 'exceljs';
import type { AttendanceReportRow, ReportType, ReportsSummaryResponse, TicketReportRow } from '@sigma/shared';

const PURPLE = '6D28D9';
const LIGHT_PURPLE = 'EDE9FE';
const WHITE = 'FFFFFF';
const DARK = '111827';

function styleSheet(sheet: ExcelJS.Worksheet, widths: number[]) {
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: widths.length } };
    const header = sheet.getRow(1);
    header.height = 24;
    header.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: WHITE } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE } };
        cell.alignment = { vertical: 'middle' };
    });
    widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.alignment = { vertical: 'top', wrapText: true };
        if (rowNumber % 2 === 0) {
            row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } }; });
        }
    });
}

function durationValue(seconds: number | null) {
    return seconds === null ? null : seconds / 86400;
}

function saoPauloExcelDate(value: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date(value));
    const fields = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    return new Date(Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, fields.second));
}

export async function createReportWorkbook(input: {
    summary: ReportsSummaryResponse;
    attendances: AttendanceReportRow[];
    tickets: TicketReportRow[];
    type: ReportType;
}) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sigma Atendimento';
    workbook.created = new Date();
    workbook.modified = new Date();

    const summarySheet = workbook.addWorksheet('Resumo por Técnico', { properties: { tabColor: { argb: PURPLE } } });
    summarySheet.addRow(['Técnico', 'Atendimentos', 'Chamados / Visitas', 'Total']);
    input.summary.technicians.forEach((item) => summarySheet.addRow([item.userName, item.attendanceCount, item.ticketCount, item.totalCount]));
    styleSheet(summarySheet, [34, 16, 20, 14]);
    summarySheet.getColumn(2).numFmt = '#,##0';
    summarySheet.getColumn(3).numFmt = '#,##0';
    summarySheet.getColumn(4).numFmt = '#,##0';
    summarySheet.getColumn(4).eachCell((cell, rowNumber) => {
        if (rowNumber > 1) {
            cell.font = { bold: true, color: { argb: DARK } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_PURPLE } };
        }
    });

    if (input.type !== 'ticket') {
        const sheet = workbook.addWorksheet('Atendimentos', { properties: { tabColor: { argb: '2563EB' } } });
        sheet.addRow(['Cliente / Contato', 'Empresa', 'Técnico / Atendente', 'Data', 'Sistema / Produto', 'Observação', 'Departamento', 'Status', 'Encerramento', 'Duração', 'Avaliação']);
        input.attendances.forEach((item) => sheet.addRow([
            item.contactName,
            item.companyName,
            item.attendantName,
            saoPauloExcelDate(item.createdAt),
            item.systemProduct,
            item.observation,
            item.departmentName,
            item.status,
            item.closedAt ? saoPauloExcelDate(item.closedAt) : null,
            durationValue(item.durationSeconds),
            item.rating,
        ]));
        styleSheet(sheet, [28, 28, 24, 19, 26, 46, 22, 18, 19, 14, 12]);
        sheet.getColumn(4).numFmt = 'dd/mm/yyyy hh:mm';
        sheet.getColumn(9).numFmt = 'dd/mm/yyyy hh:mm';
        sheet.getColumn(10).numFmt = '[h]:mm:ss';
        sheet.getColumn(11).numFmt = '0.0';
    }

    if (input.type !== 'attendance') {
        const sheet = workbook.addWorksheet('Chamados', { properties: { tabColor: { argb: 'F59E0B' } } });
        sheet.addRow(['Protocolo', 'Cliente', 'Origem', 'Técnico', 'Data', 'Sistema / Produto', 'Observação', 'Departamento', 'Status', 'Duração']);
        input.tickets.forEach((item) => sheet.addRow([
            item.protocol ?? item.id,
            item.customerName,
            item.origin === 'WHATSAPP' ? 'WhatsApp' : 'Manual',
            item.technicianName,
            saoPauloExcelDate(item.reportDate),
            item.systemProduct,
            item.observation,
            item.departmentName,
            item.status,
            durationValue(item.durationSeconds),
        ]));
        styleSheet(sheet, [22, 30, 14, 24, 19, 26, 46, 22, 22, 14]);
        sheet.getColumn(5).numFmt = 'dd/mm/yyyy hh:mm';
        sheet.getColumn(10).numFmt = '[h]:mm:ss';
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
}
