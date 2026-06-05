import React from 'react';

interface SigmaSettingsCardProps {
    title: string;
    description: string;
    children: React.ReactNode;
    actionButton?: React.ReactNode;
}

export function SigmaSettingsCard({ title, description, children, actionButton }: SigmaSettingsCardProps) {
    return (
        <section className="bg-surface rounded-xl shadow-card border border-border overflow-hidden mb-8">
            <div className="border-b border-border p-6 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-foreground">{title}</h3>
                    <p className="text-muted-foreground text-sm mt-1">{description}</p>
                </div>
                {actionButton && (
                    <div>{actionButton}</div>
                )}
            </div>
            <div className="p-0">
                {children}
            </div>
        </section>
    );
}
