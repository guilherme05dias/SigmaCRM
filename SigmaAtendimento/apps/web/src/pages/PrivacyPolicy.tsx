import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Section {
    id: string;
    title: string;
    content: React.ReactNode;
}

// ── Dados das seções ──────────────────────────────────────────────────────────
const SECTIONS: Section[] = [
    {
        id: 'introducao',
        title: '1. Introdução e Controlador',
        content: (
            <>
                <p>
                    A presente Política de Privacidade descreve como a <strong>SigmaPDV</strong>{' '}
                    (&ldquo;Empresa&rdquo;, &ldquo;nós&rdquo; ou &ldquo;nosso&rdquo;), operadora da plataforma{' '}
                    <strong>Sigma Atendimento</strong>, trata dados pessoais de clientes, usuários e pessoas que
                    interagem conosco por meio de nossos canais de atendimento, em especial o WhatsApp.
                </p>
                <p className="mt-3">
                    Este documento está em conformidade com a{' '}
                    <strong>Lei Geral de Proteção de Dados Pessoais — LGPD (Lei nº 13.709/2018)</strong>, o Marco
                    Civil da Internet (Lei nº 12.965/2014) e demais normas aplicáveis.
                </p>
                <div className="mt-4 rounded-xl border border-border bg-surface p-4">
                    <p className="text-sm font-semibold text-foreground">Controlador de Dados (Art. 5º, VI, LGPD)</p>
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                        <p><span className="font-medium text-foreground">Razão Social:</span> SigmaPDV</p>
                        <p><span className="font-medium text-foreground">CNPJ:</span> XX.XXX.XXX/0001-XX</p>
                        <p><span className="font-medium text-foreground">E-mail do Encarregado (DPO):</span> privacidade@sigmapdv.com</p>
                        <p><span className="font-medium text-foreground">Endereço:</span> Brasil</p>
                    </div>
                </div>
            </>
        ),
    },
    {
        id: 'dados-coletados',
        title: '2. Dados Pessoais Coletados',
        content: (
            <>
                <p>
                    Coletamos apenas os dados estritamente necessários para a prestação dos nossos serviços
                    (princípio da minimização — Art. 6º, III, LGPD):
                </p>
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-border bg-surface-alt text-left">
                                <th className="px-3 py-2 font-semibold text-foreground">Dado</th>
                                <th className="px-3 py-2 font-semibold text-foreground">Origem</th>
                                <th className="px-3 py-2 font-semibold text-foreground">Finalidade</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {[
                                ['Nome de perfil / nome completo', 'WhatsApp / formulário', 'Identificação e atendimento personalizado'],
                                ['Número de telefone', 'WhatsApp', 'Canal de comunicação principal'],
                                ['Conteúdo das mensagens (textos, imagens, áudios, documentos)', 'WhatsApp', 'Prestação do suporte solicitado'],
                                ['E-mail', 'Formulário opcional', 'Comunicações transacionais'],
                                ['Dados da empresa (CNPJ, razão social)', 'Formulário / contrato', 'Gestão do relacionamento comercial (B2B)'],
                                ['Logs de acesso (IP, data/hora)', 'Sistema automático', 'Segurança e conformidade legal (Marco Civil, Art. 15)'],
                            ].map(([dado, origem, finalidade]) => (
                                <tr key={dado} className="text-muted-foreground">
                                    <td className="px-3 py-2 font-medium text-foreground">{dado}</td>
                                    <td className="px-3 py-2">{origem}</td>
                                    <td className="px-3 py-2">{finalidade}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                    Não coletamos dados sensíveis (Art. 5º, II, LGPD) — como origem racial, opiniões políticas,
                    dados de saúde ou biométricos — salvo se fornecidos espontaneamente no contexto do atendimento,
                    caso em que serão tratados com proteção reforçada.
                </p>
            </>
        ),
    },
    {
        id: 'finalidades',
        title: '3. Finalidades e Bases Legais',
        content: (
            <>
                <p>
                    Todo tratamento de dados possui uma finalidade específica e uma base legal correspondente
                    (Art. 6º e Art. 7º, LGPD):
                </p>
                <div className="mt-4 space-y-3">
                    {[
                        {
                            finalidade: 'Prestar suporte técnico e atendimento ao cliente',
                            base: 'Execução de contrato / atendimento de solicitação do titular (Art. 7º, V)',
                        },
                        {
                            finalidade: 'Manter histórico de conversas para continuidade do atendimento',
                            base: 'Legítimo interesse do controlador (Art. 7º, IX)',
                        },
                        {
                            finalidade: 'Enviar notificações transacionais sobre o atendimento em curso',
                            base: 'Execução de contrato (Art. 7º, V)',
                        },
                        {
                            finalidade: 'Emitir notas fiscais e cumprir obrigações tributárias',
                            base: 'Cumprimento de obrigação legal (Art. 7º, II)',
                        },
                        {
                            finalidade: 'Armazenar logs de acesso por 6 meses',
                            base: 'Cumprimento de obrigação legal — Marco Civil da Internet (Art. 7º, II)',
                        },
                        {
                            finalidade: 'Melhoria contínua dos serviços e treinamento da equipe',
                            base: 'Legítimo interesse do controlador (Art. 7º, IX), com garantias de anonimização quando possível',
                        },
                    ].map(({ finalidade, base }) => (
                        <div key={finalidade} className="rounded-lg border border-border bg-surface p-3">
                            <p className="text-sm font-medium text-foreground">{finalidade}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                <span className="font-semibold text-primary">Base legal:</span> {base}
                            </p>
                        </div>
                    ))}
                </div>
            </>
        ),
    },
    {
        id: 'compartilhamento',
        title: '4. Compartilhamento e Terceiros',
        content: (
            <>
                <p>
                    Não vendemos, alugamos nem comercializamos dados pessoais. O compartilhamento ocorre
                    apenas nas situações abaixo, com fornecedores que oferecem garantias adequadas de proteção:
                </p>
                <ul className="mt-3 space-y-2 text-sm">
                    {[
                        ['Meta Platforms (WhatsApp Business Cloud API)', 'Canal de comunicação — as mensagens trafegam pela infraestrutura da Meta conforme os Termos da WhatsApp Business API.'],
                        ['Supabase / PostgreSQL (hospedagem do banco de dados)', 'Armazenamento seguro dos dados de atendimento em servidores com certificação SOC 2.'],
                        ['Autoridades públicas e reguladores', 'Quando exigido por lei, decisão judicial ou regulamentação aplicável (Art. 7º, II, LGPD).'],
                    ].map(([nome, desc]) => (
                        <li key={nome as string} className="flex gap-3">
                            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                            <span>
                                <strong className="text-foreground">{nome}</strong>
                                {' — '}{desc}
                            </span>
                        </li>
                    ))}
                </ul>
                <p className="mt-4 text-sm text-muted-foreground">
                    Transferências internacionais: os dados processados pela Meta estão sujeitos às políticas
                    de privacidade da Meta e às salvaguardas previstas no Capítulo V da LGPD.
                </p>
            </>
        ),
    },
    {
        id: 'retencao',
        title: '5. Retenção e Descarte',
        content: (
            <>
                <p>Mantemos os dados pelo menor período necessário para cada finalidade:</p>
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-border bg-surface-alt text-left">
                                <th className="px-3 py-2 font-semibold text-foreground">Tipo de dado</th>
                                <th className="px-3 py-2 font-semibold text-foreground">Prazo de retenção</th>
                                <th className="px-3 py-2 font-semibold text-foreground">Fundamento</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-muted-foreground">
                            {[
                                ['Histórico de conversas / tickets', '5 anos após encerramento do contrato', 'Prescrição civil (CC, Art. 205)'],
                                ['Logs de acesso', '6 meses', 'Marco Civil da Internet, Art. 15'],
                                ['Dados fiscais e contratos', '5 anos', 'Código Tributário Nacional'],
                                ['Dados anonimizados para analytics', 'Indeterminado', 'Não constituem dados pessoais (Art. 5º, III, LGPD)'],
                            ].map(([tipo, prazo, fund]) => (
                                <tr key={tipo as string}>
                                    <td className="px-3 py-2 font-medium text-foreground">{tipo}</td>
                                    <td className="px-3 py-2">{prazo}</td>
                                    <td className="px-3 py-2">{fund}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                    Após o vencimento dos prazos, os dados são deletados de forma segura ou anonimizados de
                    modo irreversível.
                </p>
            </>
        ),
    },
    {
        id: 'direitos',
        title: '6. Direitos do Titular (Art. 18, LGPD)',
        content: (
            <>
                <p>
                    Nos termos do Art. 18 da LGPD, você tem os seguintes direitos, exercíveis a qualquer
                    momento mediante solicitação ao nosso encarregado:
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[
                        { icon: '🔍', titulo: 'Acesso', desc: 'Confirmar a existência de tratamento e obter uma cópia dos dados que mantemos sobre você.' },
                        { icon: '✏️', titulo: 'Correção', desc: 'Solicitar a retificação de dados incompletos, inexatos ou desatualizados.' },
                        { icon: '🗑️', titulo: 'Eliminação', desc: 'Solicitar a exclusão dos dados tratados com base em consentimento, ressalvadas obrigações legais.' },
                        { icon: '📦', titulo: 'Portabilidade', desc: 'Receber os dados em formato estruturado e interoperável (quando regulamentado pela ANPD).' },
                        { icon: '🚫', titulo: 'Oposição', desc: 'Opor-se ao tratamento realizado com base em legítimo interesse, quando em desacordo com a LGPD.' },
                        { icon: '📋', titulo: 'Informação', desc: 'Conhecer as entidades públicas e privadas com quem compartilhamos seus dados.' },
                        { icon: '↩️', titulo: 'Revogação do consentimento', desc: 'Retirar o consentimento a qualquer momento, quando o tratamento se basear nessa hipótese.' },
                        { icon: '⚖️', titulo: 'Revisão de decisões automatizadas', desc: 'Solicitar revisão de decisões tomadas exclusivamente por meios automatizados que afetem seus interesses.' },
                    ].map(({ icon, titulo, desc }) => (
                        <div key={titulo} className="flex gap-3 rounded-xl border border-border bg-surface p-3">
                            <span className="text-xl" aria-hidden="true">{icon}</span>
                            <div>
                                <p className="text-sm font-semibold text-foreground">{titulo}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <p className="text-sm font-semibold text-foreground">Como exercer seus direitos</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Envie sua solicitação para{' '}
                        <a href="mailto:privacidade@sigmapdv.com" className="text-primary hover:underline">
                            privacidade@sigmapdv.com
                        </a>
                        . Responderemos em até <strong>15 dias úteis</strong>, conforme prazo estabelecido
                        pela ANPD. Para solicitações de eliminação ou portabilidade, podemos solicitar a
                        verificação da sua identidade.
                    </p>
                </div>
            </>
        ),
    },
    {
        id: 'seguranca',
        title: '7. Segurança da Informação',
        content: (
            <>
                <p>
                    Adotamos medidas técnicas e organizacionais adequadas para proteger dados pessoais contra
                    acessos não autorizados, perda, destruição ou divulgação indevida (Art. 46, LGPD):
                </p>
                <ul className="mt-3 space-y-2 text-sm">
                    {[
                        'Comunicações protegidas por TLS/HTTPS em todas as transmissões.',
                        'Banco de dados com acesso restrito, criptografia em repouso e backups automáticos.',
                        'Autenticação com senha hash (bcrypt) e controle de acesso por perfil (RBAC).',
                        'Isolamento multi-tenant: os dados de cada empresa são segregados por companyId e políticas de Row-Level Security no banco.',
                        'Monitoramento de logs de acesso e auditoria de ações críticas.',
                        'Revisão periódica de permissões e treinamento de equipe em boas práticas de segurança.',
                    ].map((item) => (
                        <li key={item} className="flex gap-3">
                            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-success" style={{ background: 'rgb(var(--c-success))' }} aria-hidden="true" />
                            <span className="text-muted-foreground">{item}</span>
                        </li>
                    ))}
                </ul>
                <p className="mt-3 text-sm text-muted-foreground">
                    Em caso de incidente de segurança com potencial impacto para titulares, notificaremos
                    a ANPD e os afetados dentro dos prazos legais (Art. 48, LGPD).
                </p>
            </>
        ),
    },
    {
        id: 'cookies',
        title: '8. Cookies e Tecnologias Similares',
        content: (
            <>
                <p>
                    A plataforma Sigma Atendimento (interface web) pode utilizar cookies e armazenamento
                    local (localStorage) para as seguintes finalidades:
                </p>
                <div className="mt-4 space-y-2 text-sm">
                    {[
                        { tipo: 'Sessão / autenticação', desc: 'Token JWT armazenado em localStorage para manter a sessão do operador. Essencial para o funcionamento da plataforma.', essencial: true },
                        { tipo: 'Preferências de tema', desc: 'Armazena a preferência de tema claro/escuro do usuário.', essencial: false },
                    ].map(({ tipo, desc, essencial }) => (
                        <div key={tipo} className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3">
                            <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${essencial ? 'bg-primary/10 text-primary' : 'bg-surface-alt text-muted-foreground border border-border'}`}>
                                {essencial ? 'Essencial' : 'Funcional'}
                            </span>
                            <div>
                                <p className="font-medium text-foreground">{tipo}</p>
                                <p className="mt-0.5 text-muted-foreground">{desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                    Não utilizamos cookies de rastreamento publicitário ou analytics de terceiros.
                </p>
            </>
        ),
    },
    {
        id: 'alteracoes',
        title: '9. Alterações nesta Política',
        content: (
            <p>
                Esta Política pode ser atualizada periodicamente. Alterações substanciais serão comunicadas
                por meio da própria plataforma ou por e-mail com antecedência mínima de 10 dias. A data da
                última revisão está indicada no rodapé desta página. O uso continuado dos serviços após a
                vigência das alterações implica a aceitação da nova versão.
            </p>
        ),
    },
    {
        id: 'contato',
        title: '10. Contato e Encarregado (DPO)',
        content: (
            <>
                <p>
                    Para dúvidas, solicitações de direitos ou comunicação de incidentes relacionados a dados
                    pessoais, entre em contato com nosso Encarregado de Proteção de Dados (Art. 41, LGPD):
                </p>
                <div className="mt-4 rounded-xl border border-border bg-surface p-5">
                    <div className="grid gap-2 text-sm sm:grid-cols-2">
                        {[
                            ['Encarregado (DPO)', 'Equipe de Privacidade'],
                            ['E-mail', 'privacidade@sigmapdv.com'],
                            ['Empresa', 'SigmaPDV'],
                            ['CNPJ', 'XX.XXX.XXX/0001-XX'],
                            ['País', 'Brasil'],
                            ['Prazo de resposta', 'até 15 dias úteis'],
                        ].map(([label, value]) => (
                            <div key={label as string}>
                                <span className="font-semibold text-foreground">{label}: </span>
                                <span className="text-muted-foreground">{value}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                    Se não estiver satisfeito com nossa resposta, você pode apresentar reclamação à{' '}
                    <a
                        href="https://www.gov.br/anpd"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                    >
                        Autoridade Nacional de Proteção de Dados (ANPD)
                    </a>
                    .
                </p>
            </>
        ),
    },
];

// ── Componente auxiliar: âncora do sumário ────────────────────────────────────
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
export default function PrivacyPolicy() {
    const [activeSection, setActiveSection] = useState('introducao');

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
                        <Link to="/politica-de-privacidade" className="font-semibold text-primary">
                            Privacidade
                        </Link>
                        <Link to="/termos-de-servico" className="hover:text-foreground transition-colors">
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
                        <span className="text-foreground">Política de Privacidade</span>
                    </div>
                    <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                        Política de Privacidade
                    </h1>
                    <p className="mt-2 text-muted-foreground">
                        Conformidade com a LGPD — Lei nº 13.709/2018
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
                            <nav className="space-y-0.5" aria-label="Seções da Política de Privacidade">
                                {SECTIONS.map((s) => (
                                    <TocItem key={s.id} id={s.id} title={s.title} active={activeSection === s.id} />
                                ))}
                            </nav>
                        </div>
                    </aside>

                    {/* Conteúdo */}
                    <article className="min-w-0 flex-1">
                        <div className="space-y-12">
                            {SECTIONS.map((s) => (
                                <section key={s.id} id={s.id} className="scroll-mt-6">
                                    <h2 className="mb-4 text-xl font-bold text-foreground border-b border-border pb-2">
                                        {s.title}
                                    </h2>
                                    <div className="text-sm leading-relaxed text-muted-foreground space-y-2">
                                        {s.content}
                                    </div>
                                </section>
                            ))}
                        </div>

                        {/* Rodapé do documento */}
                        <footer className="mt-16 flex flex-col gap-4 rounded-xl border border-border bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-sm text-muted-foreground">
                                <p className="font-semibold text-foreground">SigmaPDV</p>
                                <p>privacidade@sigmapdv.com</p>
                                <p className="mt-1">
                                    Última atualização:{' '}
                                    {new Date().toLocaleDateString('pt-BR', {
                                        day: '2-digit', month: 'long', year: 'numeric',
                                    })}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Link
                                    to="/termos-de-servico"
                                    className="rounded-lg border border-border bg-surface-alt px-4 py-2 text-sm font-semibold text-foreground hover:bg-border transition-colors"
                                >
                                    Termos de Serviço →
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
