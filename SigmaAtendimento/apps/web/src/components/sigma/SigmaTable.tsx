import React, { ReactNode } from 'react';

interface Column {
    header: string;
    align?: 'left' | 'center' | 'right';
}

interface SigmaTableProps {
    columns: Column[];
    children: ReactNode;
}

export function SigmaTable({ columns, children }: SigmaTableProps) {
    return (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela com rolagem horizontal">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-border bg-surface-alt">
                            {columns.map((col, index) => (
                                <th
                                    key={index}
                                    className={`px-6 py-5 text-sm font-bold text-muted-foreground uppercase tracking-wider text-${col.align || 'left'}`}
                                >
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {children}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function SigmaTableRow({ children }: { children: ReactNode }) {
    return (
        <tr className="border-b border-border hover:bg-surface-alt transition-colors">
            {children}
        </tr>
    );
}

interface SigmaTableCellProps {
    children: ReactNode;
    align?: 'left' | 'center' | 'right';
}

export function SigmaTableCell({ children, align = 'left' }: SigmaTableCellProps) {
    return (
        <td className={`px-6 py-4 text-${align}`}>
            {children}
        </td>
    );
}
