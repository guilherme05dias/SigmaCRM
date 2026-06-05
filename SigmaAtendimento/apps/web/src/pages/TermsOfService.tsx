import React from 'react';
import { PageContainer } from '../components/ui/PageContainer';
import { Card, CardContent } from '../components/ui/Card';
import { Link } from 'react-router-dom';

export default function TermsOfService() {
    return (
        <PageContainer>
            <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
                <Card>
                    <CardContent className="p-8 text-foreground leading-relaxed">
                        <h1 className="text-3xl font-bold mb-6 text-foreground text-center">Termos de Serviço</h1>
                        
                        <div className="space-y-6">
                            <section>
                                <h2 className="text-xl font-semibold mb-3 text-foreground">1. Definições</h2>
                                <p>
                                    Este documento rege o uso do canal de atendimento via WhatsApp fornecido por 
                                    <strong> DragonByte Sistemas e Soluções Web</strong> (doravante "Nós" ou "Empresa"), 
                                    operado pelo software Sigma Atendimento. Ao entrar em contato conosco ou utilizar o suporte através deste canal, você ("Usuário")
                                    aceita os presentes Termos de Serviço.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold mb-3 text-foreground">2. Descrição do Suporte via WhatsApp</h2>
                                <p>
                                    O serviço consiste em oferecer atendimento ao cliente, resposta a dúvidas, encaminhamento de solicitações e 
                                    suporte técnico. O canal permite respostas automatizadas e o contato direto com agentes humanos em horário 
                                    comercial.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold mb-3 text-foreground">3. Política de Mensagens (Opt-in)</h2>
                                <p>
                                    Nossas interações são iniciadas pelo Usuário ou de forma passiva (opt-in explícito). Ao nos enviar 
                                    a primeira mensagem pelo WhatsApp, você consente com o recebimento de mensagens transacionais relacionadas 
                                    ao seu atendimento.
                                </p>
                                <ul className="list-disc pl-6 mt-2 space-y-1">
                                    <li>Respeitamos uma janela de 24 horas estabelecida pelo WhatsApp para atendimento livre.</li>
                                    <li>Após a janela de 24 horas, qualquer interação proativa por nossa parte será feita exclusivamente por meio de modelos aprovados (templates) para fins estritamente utilitários ou transacionais.</li>
                                    <li>Não enviamos mensagens de spam. Você pode solicitar a interrupção do envio de mensagens (opt-out) a qualquer momento.</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold mb-3 text-foreground">4. Regras de Uso</h2>
                                <p>
                                    O Usuário se compromete a:
                                </p>
                                <ul className="list-disc pl-6 mt-2 space-y-1">
                                    <li>Utilizar o canal apenas para fins lícitos relacionados à contratação ou uso de nossos serviços.</li>
                                    <li>Não enviar conteúdos ilícitos, ofensivos, vírus, malware ou spams.</li>
                                    <li>Não forjar identidades ou realizar tentativas de fraude através do canal.</li>
                                </ul>
                                <p className="mt-2 text-danger font-semibold">
                                    Violações de comportamento incivil ou envio de conteúdo impróprio podem resultar no bloqueio 
                                    imediato do Usuário em nossos canais, sem aviso prévio.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold mb-3 text-foreground">5. Dependência da WhatsApp Business API</h2>
                                <p>
                                    Ao utilizar nosso atendimento, você reconhece que estamos operando através da 
                                    <strong> WhatsApp Business Cloud API (Meta)</strong>. Isto significa que o serviço depende da infraestrutura da Meta, e o aceite destes 
                                    termos implica que você concorda e está submetido aos <a href="https://www.whatsapp.com/legal/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Termos e Políticas Oficiais do WhatsApp</a>.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold mb-3 text-foreground">6. Limitação de Responsabilidade</h2>
                                <p>
                                    Nos eximimos de toda e qualquer responsabilidade, limitando-nos na máxima extensão permitida pela 
                                    legislação aplicável:
                                </p>
                                <ul className="list-disc pl-6 mt-2 space-y-1">
                                    <li>Pela indisponibilidade técnica, instabilidades prolongadas ou falhas decorrentes do sistema do provedor Meta / WhatsApp.</li>
                                    <li>Pela veracidade, exatidão ou segurança do material sensível que o Usuário decida enviar por livre 
                                        e espontânea vontade sem ter sido expressamente solicitado pela nossa equipe.
                                    </li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold mb-3 text-foreground">7. Alterações nestes Termos</h2>
                                <p>
                                    A Empresa se reserva no direito de alterar o teor destes Termos de Serviço a qualquer momento. 
                                    Ao continuar acessando e trocando mensagens através de nosso número corporativo após 
                                    as alterações, consideraremos a sua aceitação imediata.
                                </p>
                            </section>
                            
                            <section>
                                <h2 className="text-xl font-semibold mb-3 text-foreground">8. Foro e Legislação</h2>
                                <p>
                                    Este documento é regido pelas leis da República Federativa do Brasil, incluindo, mas não limitando-se ao, 
                                    Marco Civil da Internet (12.965/2014) e Lei Geral de Proteção de Dados (13.709/2018).
                                </p>
                            </section>
                        </div>
                        
                        <div className="mt-12 pt-6 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
                            <div>Última atualização: {new Date().toLocaleDateString('pt-BR')}</div>
                            <div className="space-x-4 flex">
                                <Link to="/politica-de-privacidade" className="hover:text-primary transition-colors">Política de Privacidade</Link>
                                <Link to="/login" className="hover:text-primary transition-colors">Voltar</Link>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </PageContainer>
    );
}
