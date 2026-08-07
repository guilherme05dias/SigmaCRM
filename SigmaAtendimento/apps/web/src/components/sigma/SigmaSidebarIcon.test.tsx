// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SigmaSidebarIcon } from './SigmaSidebarIcon';

vi.mock('./NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('../ui/ThemeToggle', () => ({ ThemeToggle: () => null }));

describe('navegação do técnico em campo', () => {
    it('prioriza chamados, criação, tarefas e relatórios sem exibir o chat', () => {
        render(
            <MemoryRouter initialEntries={['/tickets']}>
                <SigmaSidebarIcon
                    user={{ id: 'tech-1', name: 'Lucas', role: 'TECHNICIAN' }}
                    onLogout={vi.fn()}
                />
            </MemoryRouter>,
        );

        expect(screen.getByRole('link', { name: 'Criar chamado' }).getAttribute('href')).toBe('/tickets?new=1');
        expect(screen.getAllByRole('link', { name: 'Chamados' }).length).toBeGreaterThan(0);
        expect(screen.getAllByRole('link', { name: 'Tarefas' }).length).toBeGreaterThan(0);
        expect(screen.getAllByRole('link', { name: 'Relatórios' }).length).toBeGreaterThan(0);
        expect(screen.queryByRole('link', { name: 'Atendimentos' })).toBeNull();
    });

    it('@spec:AC-013 exibe o cargo profissional no perfil sem trocar o papel de acesso', () => {
        render(
            <MemoryRouter initialEntries={['/inbox']}>
                <SigmaSidebarIcon
                    user={{ id: 'carlos', name: 'Carlos', role: 'ATTENDANT', specialty: 'Consultor Técnico' }}
                    onLogout={vi.fn()}
                    collapsible
                />
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Abrir menu principal' }));

        expect(screen.getByText('Consultor Técnico')).toBeTruthy();
        expect(screen.queryByText('Gerente Técnico')).toBeNull();
    });
});
