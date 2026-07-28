import { describe, expect, it } from 'vitest';
import {
    assistantAgents,
    getReportAssistantAgent,
    resolveTaskAssistantAgent,
} from './assistant-agents.service';

describe('assistant agents', () => {
    it('mantém os cinco agentes com responsabilidades distintas', () => {
        expect(assistantAgents).toHaveLength(5);
        expect(assistantAgents.map((agent) => agent.id)).toEqual([
            'REPORT_ANALYST',
            'UNIPLUS_SPECIALIST',
            'SECULLUM_SPECIALIST',
            'GENERAL_TASKS',
            'FOLLOWUP_MASCOT',
        ]);
        expect(getReportAssistantAgent().name).toBe('Analista de dados e relatórios');
        expect(assistantAgents.at(-1)?.name).toBe('Mascote operacional');
    });

    it('encaminha tarefas do Uniplus e do Secullum ao especialista correto', () => {
        expect(resolveTaskAssistantAgent({
            title: 'Revisar emissão de NFC-e',
            serviceTopic: 'Uniplus Desktop',
        }).id).toBe('UNIPLUS_SPECIALIST');

        expect(resolveTaskAssistantAgent({
            title: 'Relógio não envia batidas',
            description: 'Falha no Ponto 4 após troca de rede.',
        }).id).toBe('SECULLUM_SPECIALIST');
    });

    it('encaminha os demais produtos ao agente geral', () => {
        expect(resolveTaskAssistantAgent({
            title: 'Configurar terminal',
            serviceTopic: 'Sigma PDV',
        }).id).toBe('GENERAL_TASKS');
    });
});
