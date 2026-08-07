import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Section {
    id: string;
    title: string;
    content: React.ReactNode;
}

// ── Seções ────────────────────────────────────────────────────────────────────
const SECTIONS: Section[] = [
    {
        id: 'definicoes',
        title: '1. Definições',
        content: (
            <>
                <p>
                    Este documento rege a relação entre a <strong>SigmaPDV</strong>{' '}
                    (&ldquo;Empresa&rdquo;, &ldquo;nós&rdquo; ou &ldquo;nosso&rdquo;), operadora da plataforma{' '}
                    <strong>Sigma Atendimento</strong>, e seus usuários e clientes (&ldquo;Usuário&rdquo; ou{' '}
                    &ldquo;Titular&rdquo;).
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
                    {[
                        ['Plataforma', 'O sistema Sigma Atendimento, incluindo sua API, interface web e canal de atendimento via WhatsApp.'],
                        ['Usuário interno', 'Operadores, atendentes e administradores cadastrados pela empresa contratante.'],
                        ['Usuário externo (cliente final)', 'Pessoa que entra em contato via WhatsApp para solicitar suporte ou informações.'],
                        ['Controlador', 'Empresa contratante do SaaS — responsável pelos dados de seus próprios clientes.'],
                        ['Operador', 'SigmaPDV / Sigma Atendimento — processa dados sob instrução do Controlador (Art. 5º, VII, LGPD).'],
                        ['DPA', 'Data Processing Agreement — contrato de processamento de dados firmado entre Controlador e Operador.'],
                    ].map(([termo, def]) => (
                        <div key={termo as string} className="rounded-lg border border-border bg-surface p-3">
                            <p className="font-semibold text-foreground">{termo}</p>
                            <p className="mt-0.5 text-muted-foreground">{def}</p>
                        </div>
                    ))}
                </div>
            </>
        ),
    },
    {
        id: 'servico',
        title: '2. Descrição do Serviço',
        content: (
            <>
                <p>
                    O Sigma Atendimento é uma plataforma SaaS de <strong>atendimento omnichannel e CRM</strong> que oferece:
                </p>
                <ul className="mt-3 space-y-2 text-sm">
                    {[
                        'Gestão centralizada de conversas via WhatsApp Business Cloud API (Meta).',
                        'Sistema de tickets com fluxo de atendimento, protocolo e acompanhamento de SLA.',
                        'Módulo de CRM com gestão de clientes B2B, contatos e histórico de interações.',
                        'Relatórios gerenciais com métricas de atendimento e satisfação (CSAT).',
                        'Controle de acesso por perfil (RBAC) com isolamento multi-tenant.',
                    ].map((item) => (
                        <li key={item} className="flex gap-3">
                            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                            <span className="text-muted-foreground">{item}</span>
                        </li>
                    ))}
                </ul>
                <p className="mt-3 text-sm text-muted-foreground">
                    O serviço depende de infraestrutura de terceiros (Meta/WhatsApp, Supabase/PostgreSQL) cujos
                    Termos de Serviço próprios também se aplicam ao uso da plataforma.
                </p>
            </>
        ),
    },
    {
        id: 'contratacao',
        title: '3. Contratação e Acesso',
        content: (
            <>
                <p>O acesso à plataforma pressupõe:</p>
                <ol className="mt-3 space-y-2 text-sm list-decimal list-inside text-muted-foreground">
                    <li>Celebração de contrato de prestação de serviços SaaS com a SigmaPDV.</li>
                    <li>Aceitação expressa destes Termos de Serviço e da Política de Privacidade.</li>
                    <li>Firmação do DPA (Data Processing Agreement) para compliance com a LGPD (Art. 39).</li>
                    <li>Fornecimento de dados cadastrais verídicos e atualizados da empresa contratante.</li>
                    <li>Indicação de ao menos um usuário Administrador responsável pela conta.</li>
                </ol>
                <div className="mt-4 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning-fg">
                    <p className="font-semibold">⚠️ Responsabilidade do Administrador</p>
                    <p className="mt-1">
                        O Administrador da conta é responsável por gerenciar os acessos de sua equipe, manter
                        credenciais seguras e garantir que todos os usuários internos estejam cientes destes Termos.
                    </p>
                </div>
            </>
        ),
    },
    {
        id: 'optin',
        title: '4. Política de Mensagens WhatsApp (Opt-in)',
        content: (
            <>
                <p>
                    O uso do canal WhatsApp está sujeito às Políticas da WhatsApp Business Platform (Meta).
                    As regras a seguir são de cumprimento obrigatório pelo Controlador (empresa contratante):
                </p>
                <div className="mt-4 space-y-3 text-sm">
                    {[
                        {
                            titulo: 'Opt-in explícito',
                            desc: 'Toda comunicação proativa para clientes finais requer opt-in explícito e documentado, nos termos exigidos pela Meta e pela LGPD.',
                        },
                        {
                            titulo: 'Janela de 24 horas',
                            desc: 'Dentro da janela de 24h após a última mensagem do cliente, é permitido enviar qualquer tipo de mensagem. Após esse período, apenas templates aprovados pela Meta podem ser utilizados.',
                        },
                        {
                            titulo: 'Opt-out imediato',
                            desc: 'Qualquer solicitação de interrupção de contato (opt-out) deve ser respeitada imediatamente. A plataforma registra e honra tais solicitações automaticamente.',
                        },
                        {
                            titulo: 'Proibição de spam',
                            desc: 'É vedado o envio de mensagens não solicitadas, publicidade em massa ou conteúdo enganoso. Violações podem resultar no bloqueio do número pela Meta e rescisão do contrato.',
                        },
                    ].map(({ titulo, desc }) => (
                        <div key={titulo} className="rounded-lg border border-border bg-surface p-3">
                            <p className="font-semibold text-foreground">{titulo}</p>
                            <p className="mt-0.5 text-muted-foreground">{desc}</p>
                        </div>
                    ))}
                </div>
            </>
        ),
    },
    {
        id: 'responsabilidades',
        title: '5. Responsabilidades das Partes',
        content: (
            <>
                <div className="mt-2 grid gap-4 text-sm md:grid-cols-2">
                    <div className="rounded-xl border border-border bg-surface p-4">
                        <p className="font-bold text-foreground border-b border-border pb-2 mb-3">SigmaPDV (Operador)</p>
                        <ul className="space-y-1.5 text-muted-foreground">
                            {[
                                'Manter a plataforma disponível e segura.',
                                'Implementar medidas técnicas de proteção de dados.',
                                'Processar dados exclusivamente conforme instruções do Controlador.',
                                'Notificar incidentes de segurança em até 72h (Art. 48, LGPD).',
                                'Auxiliar o Controlador no atendimento aos direitos dos titulares.',
                                'Não subcontratar processadores sem anuência do Controlador.',
                            ].map((item) => (
                                <li key={item} className="flex gap-2">
                                    <span className="shrink-0 text-success-fg">✓</span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="rounded-xl border border-border bg-surface p-4">
                        <p className="font-bold text-foreground border-b border-border pb-2 mb-3">Empresa Contratante (Controlador)</p>
                        <ul className="space-y-1.5 text-muted-foreground">
                            {[
                                'Obter base legal válida para o tratamento de dados de seus clientes.',
                                'Garantir opt-in dos clientes finais antes de iniciar contato ativo.',
                                'Manter credenciais de acesso seguras e individualizadas.',
                                'Utilizar a plataforma apenas para fins lícitos.',
                                'Comunicar a SigmaPDV sobre solicitações de direitos dos titulares.',
                                'Manter o plano de assinatura em dia para continuidade do serviço.',
                            ].map((item) => (
                                <li key={item} className="flex gap-2">
                                    <span className="shrink-0 text-primary">✓</span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </>
        ),
    },
    {
        id: 'uso-aceitavel',
        title: '6. Uso Aceitável e Proibições',
        content: (
            <>
                <p>É <strong>expressamente proibido</strong> o uso da plataforma para:</p>
                <ul className="mt-3 space-y-2 text-sm">
                    {[
                        'Envio de spam, mensagens em massa não autorizadas ou publicidade não solicitada.',
                        'Envio de conteúdo ilícito, ofensivo, discriminatório, pornográfico ou que incite violência.',
                        'Tentativas de fraude, engenharia social ou phishing em nome da empresa.',
                        'Coleta de dados pessoais para finalidades incompatíveis com as informadas ao titular.',
                        'Compartilhamento não autorizado de credenciais de acesso.',
                        'Tentativas de acesso a dados de outras empresas (tenants).',
                        'Scraping, extração automatizada de dados ou reverse engineering da plataforma.',
                    ].map((item) => (
                        <li key={item} className="flex gap-3">
                            <span className="mt-0.5 shrink-0 font-bold text-danger-fg">✕</span>
                            <span className="text-muted-foreground">{item}</span>
                        </li>
                    ))}
                </ul>
                <p className="mt-4 text-sm font-semibold text-danger-fg">
                    Violações graves podem resultar na suspensão imediata da conta, rescisão contratual e, quando
                    aplicável, comunicação às autoridades competentes.
                </p>
            </>
        ),
    },
    {
        id: 'dados-lgpd',
        title: '7. Tratamento de Dados Pessoais (LGPD)',
        content: (
            <>
                <p>
                    Na relação entre a SigmaPDV (Operador) e a empresa contratante (Controlador), o
                    tratamento de dados segue as seguintes premissas:
                </p>
                <div className="mt-4 space-y-3 text-sm">
                    {[
                        {
                            art: 'Art. 37, LGPD',
                            desc: 'O Operador mantém registro das atividades de tratamento realizadas em nome do Controlador.',
                        },
                        {
                            art: 'Art. 39, LGPD',
                            desc: 'Um DPA (Adendo de Proteção de Dados) regula os termos do processamento e deve ser assinado na contratação.',
                        },
                        {
                            art: 'Art. 46, LGPD',
                            desc: 'Medidas técnicas de segurança são implementadas para proteger dados contra acessos não autorizados.',
                        },
                        {
                            art: 'Art. 48, LGPD',
                            desc: 'Incidentes de segurança são comunicados ao Controlador em até 72h, com informações sobre a natureza, dados afetados e medidas adotadas.',
                        },
                    ].map(({ art, desc }) => (
                        <div key={art} className="flex gap-3 rounded-lg border border-border bg-surface p-3">
                            <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary h-fit">
                                {art}
                            </span>
                            <p className="text-muted-foreground">{desc}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
                    <p className="font-semibold text-foreground">Direitos dos titulares dos dados dos clientes finais</p>
                    <p className="mt-1 text-muted-foreground">
                        A empresa contratante (Controlador) é a principal responsável por atender os direitos
                        dos seus clientes finais (Art. 18, LGPD). A SigmaPDV (Operador) fornecerá assistência
                        técnica para viabilizar o cumprimento dessas solicitações, conforme previsto no DPA.
                    </p>
                </div>
            </>
        ),
    },
    {
        id: 'disponibilidade',
        title: '8. Disponibilidade e SLA',
        content: (
            <>
                <p>A SigmaPDV envidará os melhores esforços para manter a plataforma disponível, observando:</p>
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-border bg-surface-alt text-left">
                                <th className="px-3 py-2 font-semibold text-foreground">Tipo</th>
                                <th className="px-3 py-2 font-semibold text-foreground">Compromisso</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-muted-foreground">
                            {[
                                ['Disponibilidade mensal', 'Objetivo de 99% de uptime (excluindo manutenções programadas e falhas de terceiros).'],
                                ['Janelas de manutenção', 'Realizadas preferencialmente fora do horário comercial, com aviso prévio de 24h quando possível.'],
                                ['Dependências de terceiros', 'A disponibilidade da WhatsApp Cloud API (Meta) está fora do controle da SigmaPDV. Falhas da Meta não caracterizam descumprimento de SLA.'],
                                ['Suporte', 'Atendimento a incidentes críticos em horário comercial (Seg–Sex, 09h–18h, horário de Brasília).'],
                            ].map(([tipo, compromisso]) => (
                                <tr key={tipo as string}>
                                    <td className="px-3 py-2 font-medium text-foreground">{tipo}</td>
                                    <td className="px-3 py-2">{compromisso}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </>
        ),
    },
    {
        id: 'propriedade-intelectual',
        title: '9. Propriedade Intelectual',
        content: (
            <>
                <p>
                    A plataforma Sigma Atendimento, seu código-fonte, design, marcas, logotipos e demais
                    elementos são de propriedade exclusiva da SigmaPDV, protegidos
                    pela Lei nº 9.610/98 (Direitos Autorais) e pela Lei nº 9.279/96 (Propriedade Industrial).
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                    A contratação do serviço concede ao Contratante uma <strong>licença não exclusiva, intransferível
                    e revogável</strong> para uso da plataforma durante a vigência do contrato, exclusivamente para
                    as finalidades descritas nestes Termos.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                    Os dados inseridos pelos Contratantes e seus clientes pertencem ao Contratante. A SigmaPDV
                    não reivindica propriedade sobre tais dados.
                </p>
            </>
        ),
    },
    {
        id: 'rescisao',
        title: '10. Rescisão e Encerramento',
        content: (
            <>
                <p>O contrato pode ser encerrado:</p>
                <ul className="mt-3 space-y-2 text-sm">
                    {[
                        { por: 'Pelo Contratante', motivo: 'A qualquer momento, mediante aviso prévio de 30 dias, sem multa (salvo disposição contratual específica em contrário).' },
                        { por: 'Pela SigmaPDV', motivo: 'Por violação destes Termos, inadimplência por mais de 30 dias, ou mediante aviso prévio de 30 dias sem necessidade de justificativa.' },
                        { por: 'Por qualquer das partes', motivo: 'Em caso de força maior, caso fortuito ou encerramento das atividades da outra parte.' },
                    ].map(({ por, motivo }) => (
                        <li key={por} className="rounded-lg border border-border bg-surface p-3">
                            <p className="font-semibold text-foreground">{por}</p>
                            <p className="mt-0.5 text-muted-foreground">{motivo}</p>
                        </li>
                    ))}
                </ul>
                <p className="mt-4 text-sm text-muted-foreground">
                    Após o encerramento, os dados do Contratante serão mantidos pelo prazo legal aplicável e,
                    em seguida, excluídos com segurança. O Contratante pode solicitar uma exportação dos dados
                    antes da exclusão (portabilidade — Art. 18, V, LGPD).
                </p>
            </>
        ),
    },
    {
        id: 'limitacao-responsabilidade',
        title: '11. Limitação de Responsabilidade',
        content: (
            <>
                <p>
                    Na máxima extensão permitida pela legislação brasileira, a SigmaPDV não será responsável por:
                </p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {[
                        'Danos indiretos, lucros cessantes ou perdas consequentes decorrentes do uso da plataforma.',
                        'Indisponibilidade, instabilidade ou falhas originadas em sistemas da Meta (WhatsApp), provedores de cloud ou outros serviços de terceiros.',
                        'Uso inadequado da plataforma pelo Contratante ou por usuários sob sua gestão.',
                        'Violações de dados causadas pelo Contratante (ex.: credenciais comprometidas por negligência do Contratante).',
                        'Conteúdo ilícito enviado por clientes finais do Contratante através do canal de atendimento.',
                    ].map((item) => (
                        <li key={item} className="flex gap-3">
                            <span className="mt-0.5 shrink-0 font-bold text-muted-foreground">—</span>
                            {item}
                        </li>
                    ))}
                </ul>
                <p className="mt-3 text-sm text-muted-foreground">
                    A responsabilidade total da SigmaPDV, em qualquer hipótese, fica limitada ao valor pago
                    pelo Contratante nos últimos 3 meses anteriores ao evento que gerou o dano.
                </p>
            </>
        ),
    },
    {
        id: 'alteracoes',
        title: '12. Alterações nestes Termos',
        content: (
            <p>
                A SigmaPDV reserva-se o direito de atualizar estes Termos de Serviço a qualquer momento.
                Alterações substanciais serão comunicadas por e-mail e/ou por aviso na plataforma com
                antecedência mínima de <strong>10 dias corridos</strong>. O uso continuado da plataforma após
                a vigência das alterações constituirá aceitação tácita dos novos Termos.
            </p>
        ),
    },
    {
        id: 'foro',
        title: '13. Foro e Legislação Aplicável',
        content: (
            <>
                <p>
                    Estes Termos são regidos pelas leis da República Federativa do Brasil, em especial:
                </p>
                <ul className="mt-3 space-y-1 text-sm text-muted-foreground list-disc list-inside">
                    <li>Lei Geral de Proteção de Dados — LGPD (Lei nº 13.709/2018)</li>
                    <li>Marco Civil da Internet (Lei nº 12.965/2014)</li>
                    <li>Código Civil Brasileiro (Lei nº 10.406/2002)</li>
                    <li>Código de Defesa do Consumidor, quando aplicável (Lei nº 8.078/1990)</li>
                </ul>
                <p className="mt-3 text-sm text-muted-foreground">
                    Para dirimir quaisquer controvérsias, fica eleito o foro da Comarca da sede da SigmaPDV,
                    no Estado de São Paulo, com renúncia a qualquer outro, por mais privilegiado que seja.
                </p>
            </>
        ),
    },
];

// ── Sumário item ──────────────────────────────────────────────────────────────
function TocItem({ id, title, active }: { id: string; title: string; active: boolean }) {
    return (
        <a
            href={`#${id}`}
            className={[
                'block rounded-lg px-3 py-2 text-sm transition-colors',
                active
                    ? 'bg-primary/10 font-semibold text-primary'
                    : 'text-muted-foreground hover:bg-surface-alt hover:text-foreground',
            ].join(' ')}
        >
            {title}
        </a>
    );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function TermsOfService() {
    const [activeSection, setActiveSection] = useState('definicoes');

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.find((e) => e.isIntersecting);
                if (visible) setActiveSection(visible.target.id);
            },
            { rootMargin: '-20% 0% -70% 0%' },
        );
        SECTIONS.forEach(({ id }) => {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, []);

    return (
        <div className="min-h-screen bg-background">
            {/* ── Cabeçalho ── */}
            <header className="border-b border-border bg-surface">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-8">
                    <Link to="/" className="flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-solid text-sm font-bold text-primary-solid-fg">Σ</span>
                        <span className="font-bold">Sigma Atendimento</span>
                    </Link>
                    <nav className="flex items-center gap-4 text-sm text-muted-foreground">
                        <Link to="/politica-de-privacidade" className="hover:text-foreground transition-colors">
                            Privacidade
                        </Link>
                        <Link to="/termos-de-servico" className="font-semibold text-primary">
                            Termos de Serviço
                        </Link>
                        <Link
                            to="/login"
                            className="inline-flex min-h-11 items-center rounded-lg bg-primary-solid px-4 py-2 text-sm font-semibold text-primary-solid-fg transition-colors hover:bg-primary-solid-hover"
                        >
                            Entrar
                        </Link>
                    </nav>
                </div>
            </header>

            {/* ── Hero ── */}
            <div className="border-b border-border bg-surface-alt">
                <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Legal</span>
                        <span aria-hidden="true">›</span>
                        <span className="text-foreground">Termos de Serviço</span>
                    </div>
                    <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                        Termos de Serviço
                    </h1>
                    <p className="mt-2 text-muted-foreground">
                        Regula o uso da plataforma Sigma Atendimento — Lei nº 13.709/2018 (LGPD) e Marco Civil da Internet
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                        <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
                            LGPD Compliant
                        </span>
                        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
                            Última atualização: {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </span>
                        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
                            Versão 1.0
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Layout: sumário + conteúdo ── */}
            <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
                <div className="flex gap-10">

                    {/* Sumário lateral (sticky, só desktop) */}
                    <aside className="hidden shrink-0 md:block md:w-64">
                        <div className="sticky top-6 rounded-xl border border-border bg-surface p-4">
                            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                Sumário
                            </p>
                            <nav className="space-y-0.5" aria-label="Seções dos Termos de Serviço">
                                {SECTIONS.map((s) => (
                                    <TocItem key={s.id} id={s.id} title={s.title} active={activeSection === s.id} />
                                ))}
                            </nav>
                        </div>
                    </aside>

                    {/* Conteúdo */}
                    <article className="min-w-0 flex-1">
                        {/* Aviso de aceitação */}
                        <div className="mb-8 rounded-xl border border-warning/30 bg-warning-soft p-5 text-sm text-warning-fg">
                            <p className="font-bold">📋 Aceitação dos Termos</p>
                            <p className="mt-1">
                                Ao acessar ou utilizar a plataforma Sigma Atendimento, você confirma que leu, entendeu
                                e concorda em se vincular a estes Termos de Serviço e à nossa{' '}
                                <Link to="/politica-de-privacidade" className="underline hover:opacity-80">
                                    Política de Privacidade
                                </Link>
                                . Se você não concordar com qualquer parte destes Termos, não utilize a plataforma.
                            </p>
                        </div>

                        <div className="space-y-12">
                            {SECTIONS.map((s) => (
                                <section key={s.id} id={s.id} className="scroll-mt-6">
                                    <h2 className="mb-4 border-b border-border pb-2 text-xl font-bold text-foreground">
                                        {s.title}
                                    </h2>
                                    <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                                        {s.content}
                                    </div>
                                </section>
                            ))}
                        </div>

                        {/* Rodapé do documento */}
                        <footer className="mt-16 flex flex-col gap-4 rounded-xl border border-border bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-sm text-muted-foreground">
                                <p className="font-semibold text-foreground">SigmaPDV</p>
                                <p>contato@sigmapdv.com</p>
                                <p className="mt-1">
                                    Última atualização:{' '}
                                    {new Date().toLocaleDateString('pt-BR', {
                                        day: '2-digit', month: 'long', year: 'numeric',
                                    })}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Link
                                    to="/politica-de-privacidade"
                                    className="rounded-lg border border-border bg-surface-alt px-4 py-2 text-sm font-semibold text-foreground hover:bg-border transition-colors"
                                >
                                    ← Política de Privacidade
                                </Link>
                                <Link
                                    to="/login"
                                    className="inline-flex min-h-11 items-center rounded-lg bg-primary-solid px-4 py-2 text-sm font-semibold text-primary-solid-fg transition-colors hover:bg-primary-solid-hover"
                                >
                                    Voltar ao Login
                                </Link>
                            </div>
                        </footer>
                    </article>
                </div>
            </div>
        </div>
    );
}
