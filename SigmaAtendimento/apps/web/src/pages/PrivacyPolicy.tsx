import React from 'react';
import { PageContainer } from '../components/ui/PageContainer';
import { Card, CardContent } from '../components/ui/Card';
import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
    return (
        <PageContainer>
            <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
                <Card>
                    <CardContent className="p-8 text-foreground leading-relaxed">
                        <h1 className="text-3xl font-bold mb-6 text-foreground text-center">Política de Privacidade</h1>
                        
                        <div className="space-y-6">
                            <section>
                                <h2 className="text-xl font-semibold mb-3 text-foreground">1. Introdução</h2>
                                <p>
                                    A presente Política de Privacidade regula o tratamento de dados pessoais no âmbito da prestação 
                                    de serviços de suporte técnico e atendimento via WhatsApp (WhatsApp Business Cloud API) operado 
                                    pelo Sigma Atendimento.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold mb-3 text-foreground">2. Dados Coletados via WhatsApp</h2>
                                <p>
                                    As conversas de suporte podem incluir dados pessoais enviados pelo próprio usuário de forma voluntária. 
                                    Quando você interage conosco através do WhatsApp, coletamos:
                                </p>
                                <ul className="list-disc pl-6 mt-2 space-y-1">
                                    <li>Nome de perfil no WhatsApp.</li>
                                    <li>Número de telefone.</li>
                                    <li>Conteúdo das mensagens enviadas (textos, áudios, imagens ou documentos).</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold mb-3 text-foreground">3. Finalidades do Tratamento</h2>
                                <p>Os dados coletados são utilizados estritamente para as seguintes finalidades:</p>
                                <ul className="list-disc pl-6 mt-2 space-y-1">
                                    <li>Fornecer suporte técnico e atendimento ao cliente.</li>
                                    <li>Manter o histórico de atendimento para continuidade do suporte.</li>
                                    <li>Melhoria contínua da qualidade dos nossos serviços e sistemas.</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold mb-3 text-foreground">4. Base Legal (LGPD)</h2>
                                <p>
                                    O tratamento de dados é realizado de acordo com a Lei Geral de Proteção de Dados (L13.709/2018), 
                                    amparado principalmente na base legal da <strong>execução de contrato / atendimento de solicitação 
                                    iniciada pelo titular</strong> (Art. 7º, V) e para o <strong>legítimo interesse</strong> na melhoria do 
                                    atendimento (Art. 7º, IX).
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold mb-3 text-foreground">5. Compartilhamento de Dados e Infraestrutura</h2>
                                <p>
                                    Nosso canal de atendimento utiliza a infraestrutura oficial da <strong>Meta / WhatsApp Business Cloud API</strong>. 
                                    Isso significa que as mensagens trafegam pela infraestrutura da Meta para garantir o funcionamento do canal. 
                                    Não vendemos, alugamos ou comercializamos seus dados pessoais para terceiros para fins de marketing.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold mb-3 text-foreground">6. Retenção de Dados</h2>
                                <p>
                                    Os dados e o histórico das conversas serão mantidos pelo tempo necessário para resolução do seu atendimento 
                                    e cumprimento de obrigações legais, operacionais ou proteção de nossos direitos.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold mb-3 text-foreground">7. Direitos do Titular</h2>
                                <p>Você tem o direito de solicitar a qualquer momento:</p>
                                <ul className="list-disc pl-6 mt-2 space-y-1">
                                    <li>O acesso aos seus dados pessoais armazenados por nós.</li>
                                    <li>A correção de dados incompletos ou inexatos.</li>
                                    <li>A exclusão do seu histórico de conversas (sujeito à retenção legal aplicável).</li>
                                </ul>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold mb-3 text-foreground">8. Segurança</h2>
                                <p>
                                    Implementamos medidas técnicas e organizacionais adequadas para proteger as informações coletadas 
                                    no atendimento contra acessos não autorizados e uso indevido. O tráfego com a API oficial do WhatsApp 
                                    ocorre de forma segura e criptografada (TLS).
                                </p>
                            </section>

                            <section>
                                <h2 className="text-xl font-semibold mb-3 text-foreground">9. Contato</h2>
                                <p>Para exercer seus direitos ou tirar dúvidas sobre esta Política, entre em contato através de:</p>
                                <div className="mt-2 bg-surface-alt border border-border p-4 rounded-md">
                                    <p><strong>E-mail:</strong> privacidade@dragonbytesites.com.br</p>
                                    <p><strong>Empresa:</strong> DragonByte Sistemas e Soluções Web</p>
                                    <p><strong>CNPJ:</strong> XX.XXX.XXX/0001-XX</p>
                                    <p><strong>Endereço:</strong> Brasil</p>
                                </div>
                            </section>
                        </div>
                        
                        <div className="mt-12 pt-6 border-t border-border flex justify-between items-center text-sm text-muted-foreground">
                            <div>
                                Última atualização: {new Date().toLocaleDateString('pt-BR')}
                            </div>
                            <div className="space-x-4 flex">
                                <Link to="/termos-de-servico" className="hover:text-primary transition-colors">Termos de Serviço</Link>
                                <Link to="/login" className="hover:text-primary transition-colors">Voltar</Link>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </PageContainer>
    );
}
