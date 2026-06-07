
const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const app = express();
require('dotenv').config();

const port = Number(process.env.WHATSAPP_API_PORT || process.env.PORT || 3000);
const sigmaWebhookUrl = process.env.SIGMA_WEBHOOK_URL || 'http://localhost:3334/api/whatsapp/webhook';
const sigmaWhatsAppBaseUrl = process.env.SIGMA_WHATSAPP_BASE_URL || sigmaWebhookUrl.replace(/\/webhook$/, '');
const chromeExecutablePath = process.env.CHROME_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

app.use(express.json({ limit: '50mb' }));
app.use(require('cors')());


const sessionsDir = path.join(__dirname, 'sessions'); // Diretório onde as sessões estão armazenadas
let sessions = {}; // Armazena as sessões ativas e os QR Codes

function getSessionStatus(client) {
    if (!client) return 'NOT_FOUND';
    if (client.info?.wid) return 'READY';
    return client.status || 'STARTING';
}

function assertReadyClient(sessionId, res) {
    const client = sessions[sessionId];

    if (!client) {
        res.status(404).json({ message: `Sessão ${sessionId} não encontrada.` });
        return null;
    }

    if (!client.info || !client.info.wid) {
        res.status(409).json({
            message: `Sessão ${sessionId} ainda não está pronta.`,
            status: getSessionStatus(client),
        });
        return null;
    }

    return client;
}

function mapMessageType(type) {
    if (type === 'image') return 'IMAGE';
    if (type === 'audio' || type === 'ptt') return 'AUDIO';
    if (type === 'video') return 'VIDEO';
    if (type === 'document') return 'DOCUMENT';
    return 'TEXT';
}

async function notifySigmaHistorySync(sessionId) {
    try {
        const response = await fetch(`${sigmaWhatsAppBaseUrl}/sessions/${encodeURIComponent(sessionId)}/sync-history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatLimit: 100, messageLimit: 50 }),
        });

        if (!response.ok) {
            console.error(`Falha ao solicitar sincronização de histórico no Sigma: ${response.status}`);
        }
    } catch (error) {
        console.error('Erro ao solicitar sincronização de histórico no Sigma:', error);
    }
}

// Função para criar um cliente para um número de telefone específico
function createClient(sessionId) {
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: sessionId, dataPath: sessionsDir }), // Usa ID único para a sessão
        puppeteer: {
            headless: true,
            executablePath: fs.existsSync(chromeExecutablePath) ? chromeExecutablePath : undefined,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-extensions']
        }
    });

    client.on('qr', (qr) => {
        sessions[sessionId].qrCode = qr;
        sessions[sessionId].status = 'QR';
    });

    client.on('ready', () => {
        console.log(`${sessionId} está pronto!`);
        sessions[sessionId].status = 'READY';
        notifySigmaHistorySync(sessionId);
    });

    client.on('authenticated', () => {
        console.log(`Sessão de ${sessionId} autenticada.`);
        sessions[sessionId].status = 'AUTHENTICATED';
    });

    client.on('message', async (message) => {
        if (message.fromMe) return;

        try {
            const contact = await message.getContact();
            const payload = {
                provider: 'murilo-api',
                sessionId,
                payload: {
                    id: message.id?.id || String(Date.now()),
                    from: message.from,
                    body: message.body,
                    hasMedia: message.hasMedia,
                    type: message.type,
                    timestamp: message.timestamp,
                    pushname: contact.pushname || contact.name || contact.shortName || null,
                    _data: {
                        notifyName: contact.pushname || contact.name || contact.shortName || null,
                    },
                },
            };

            const response = await fetch(sigmaWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                console.error(`Falha ao encaminhar mensagem para Sigma: ${response.status}`);
            }
        } catch (error) {
            console.error('Erro ao encaminhar mensagem recebida para Sigma:', error);
        }
    });

    client.initialize();
    return client;
}

// Carrega sessões existentes ao iniciar o servidor
function loadExistingSessions() {
    if (fs.existsSync(sessionsDir)) {
        const sessionFiles = fs.readdirSync(sessionsDir);
        sessionFiles.forEach((file) => {
            const sessionId = path.parse(file).name.split('-')[1];
        const client = createClient(sessionId);
        sessions[sessionId] = client;
        sessions[sessionId].status = 'STARTING';
    });
}
}

// Endpoint para iniciar uma sessão
app.get('/start-session/:sessionId', (req, res) => {
    const { sessionId } = req.params;

    if (sessions[sessionId]) {
        return res.status(400).json({ message: 'Sessão já está ativa.' });
    }

    const client = createClient(sessionId);
    sessions[sessionId] = client;
    sessions[sessionId].status = 'STARTING';

    res.status(200).json({ message: `Sessão para o número ${sessionId} iniciada.` });
});

app.get('/sessions', (req, res) => {
    const result = Object.keys(sessions).map((sessionId) => ({
        name: sessionId,
        status: getSessionStatus(sessions[sessionId]),
        hasQrCode: Boolean(sessions[sessionId].qrCode),
    }));

    res.status(200).json(result);
});

app.get('/history/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const client = assertReadyClient(sessionId, res);
    if (!client) return;

    const chatLimit = Math.max(1, Math.min(Number(req.query.chatLimit || 100), 500));
    const messageLimit = Math.max(1, Math.min(Number(req.query.messageLimit || 50), 200));

    try {
        const chats = await client.getChats();
        const directChats = chats
            .filter((chat) => {
                const serializedId = chat.id?._serialized || '';
                return !chat.isGroup && serializedId.endsWith('@c.us') && !serializedId.includes('@broadcast');
            })
            .sort((a, b) => {
                const aTime = a.timestamp || a.lastMessage?.timestamp || 0;
                const bTime = b.timestamp || b.lastMessage?.timestamp || 0;
                return bTime - aTime;
            })
            .slice(0, chatLimit);

        const result = [];

        for (const chat of directChats) {
            const contact = await chat.getContact();
            const phone = (contact.id?.user || chat.id?.user || '').replace(/\D/g, '');
            if (phone.length < 10) continue;

            const messages = await chat.fetchMessages({ limit: messageLimit });

            result.push({
                id: chat.id?._serialized,
                phone,
                name: contact.pushname || contact.name || contact.shortName || contact.verifiedName || null,
                unreadCount: chat.unreadCount || 0,
                lastMessageAt: chat.timestamp || chat.lastMessage?.timestamp || null,
                messages: messages.map((message) => ({
                    direction: message.fromMe ? 'OUTBOUND' : 'INBOUND',
                    type: mapMessageType(message.type),
                    body: message.body || message.caption || null,
                    mediaUrl: null,
                    waMessageId: typeof message.id === 'object' ? message.id.id : message.id,
                    timestamp: message.timestamp || null,
                })),
            });
        }

        res.status(200).json({ chats: result });
    } catch (error) {
        console.error(`Erro ao buscar histórico da sessão ${sessionId}:`, error);
        res.status(500).json({ message: 'Erro ao buscar histórico do WhatsApp.', error: error.message });
    }
});

app.post('/disconnect-session/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const client = sessions[sessionId];

    if (!client) {
        return res.status(404).json({ message: `Sessão ${sessionId} não encontrada.` });
    }

    try {
        if (typeof client.logout === 'function') {
            await client.logout();
        }

        if (typeof client.destroy === 'function') {
            await client.destroy();
        }

        delete sessions[sessionId];

        const sessionFolder = path.join(sessionsDir, `session-${sessionId}`);
        if (fs.existsSync(sessionFolder)) {
            fs.rmSync(sessionFolder, { recursive: true, force: true });
        }

        res.status(200).json({ message: `Sessão ${sessionId} desconectada.`, status: 'DISCONNECTED' });
    } catch (error) {
        console.error(`Erro ao desconectar sessão ${sessionId}:`, error);
        res.status(500).json({ message: 'Erro ao desconectar sessão.', error: error.message });
    }
});

app.post('/check-number/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const { phone, numero } = req.body;
    const rawPhone = String(phone || numero || '');
    const normalizedPhone = rawPhone.replace(/\D/g, '');
    const client = sessions[sessionId];

    if (!normalizedPhone) {
        return res.status(400).json({ message: 'Número obrigatório.', exists: false });
    }

    if (!client) {
        return res.status(404).json({ message: `Sessão ${sessionId} não encontrada.`, exists: false });
    }

    if (!client.info || !client.info.wid) {
        return res.status(409).json({ message: `Sessão ${sessionId} não está pronta para validar números.`, exists: false, status: client.status || 'STARTING' });
    }

    try {
        const numberId = await client.getNumberId(normalizedPhone);

        if (!numberId) {
            return res.status(200).json({ exists: false, phone: normalizedPhone });
        }

        let name = null;
        try {
            const contact = await client.getContactById(numberId._serialized);
            name = contact.pushname || contact.name || contact.shortName || contact.verifiedName || null;
        } catch (error) {
            console.warn(`Não foi possível obter dados do contato ${normalizedPhone}:`, error.message);
        }

        res.status(200).json({
            exists: true,
            phone: normalizedPhone,
            wid: numberId._serialized,
            name,
        });
    } catch (error) {
        console.error(`Erro ao validar número ${normalizedPhone}:`, error);
        res.status(500).json({ message: 'Erro ao validar número no WhatsApp.', error: error.message, exists: false });
    }
});

// Endpoint para enviar mensagens e arquivos
app.post('/send-message/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const { para, nomeArquivo, arquivoBase64, mensagem } = req.body;

    if (!sessions[sessionId]) {
        return res.status(400).json({ message: 'Sessão não encontrada.' });
    }

    const client = sessions[sessionId];

    // Busca o nome correto da pasta da sessão
    const sessionFiles = fs.readdirSync(sessionsDir);
    const sessionFolder = sessionFiles.find(folder => folder.includes(sessionId));

    if (!sessionFolder) {
        console.error(`A sessão ${sessionId} não foi encontrada no servidor.`);
        return res.status(400).json({ message: `Sessão ${sessionId} não encontrada no servidor.` });
    }

    const sessionPath = path.join(sessionsDir, sessionFolder);
    console.log(`Sessão localizada: ${sessionPath}`);

    // Verifica se há arquivos de autenticação na pasta
    const sessionFilesInFolder = fs.readdirSync(sessionPath);
    if (sessionFilesInFolder.length === 0) {
        console.error(`A pasta da sessão ${sessionId} está vazia.`);
        return res.status(400).json({ message: `Sessão ${sessionId} não possui arquivos de autenticação.` });
    }


    // Se o cliente não existir, tenta recriá-lo
    if (!client) {
        console.error(`Cliente da sessão ${sessionId} não foi encontrado. Criando novo cliente...`);
        sessions[sessionId] = createClient(sessionId);
        return res.status(409).json({ message: 'Sessão não encontrada. Criando uma nova, tente novamente em alguns segundos.', status: 'restarting' });
    }


    // Verifica se o cliente está autenticado corretamente
    if (!client.info || !client.info.wid) {
        console.error(`Sessão ${sessionId} não está autenticada. Tentando reiniciar...`);
        
        // Reinicia a sessão
        client.initialize();
    
        return res.status(409).json({ message: 'Sessão WhatsApp ainda não está pronta. Abra Configurações > Integração WhatsApp e aguarde ficar Conectado.', status: getSessionStatus(client) });
    }
    
    // Se passou por todas as verificações, significa que a sessão está OK
    try {
        const normalizedPhone = String(para || '').replace(/\D/g, '');
        if (!normalizedPhone) {
            return res.status(400).json({ message: 'Número de destino obrigatório.' });
        }

        const numberId = await client.getNumberId(normalizedPhone);
        if (!numberId?._serialized) {
            return res.status(404).json({
                message: 'Número não possui WhatsApp.',
                exists: false,
                phone: normalizedPhone,
            });
        }

        const destinationId = numberId._serialized;

        if (arquivoBase64 && nomeArquivo) {
            // Criar a mídia com o nome do arquivo
            const media = new MessageMedia('application/pdf', arquivoBase64, nomeArquivo);

            // Enviar o arquivo sem legenda
            await client.sendMessage(destinationId, media);
        } else if (mensagem) {
            // Enviar apenas a mensagem de texto
            await client.sendMessage(destinationId, mensagem);
        } else {
            return res.status(400).json({ message: "Nenhuma mensagem ou arquivo enviado." });
        }

        res.status(200).json({ message: 'Mensagem enviada com sucesso!', wid: destinationId });
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.status(500).json({ message: 'Erro ao enviar mensagem.', error: error.message });
    }
});


// Endpoint para obter o QR Code de uma sessão
app.get('/get-qrcode/:sessionId', (req, res) => {
    const { sessionId } = req.params;

    if (!sessions[sessionId] || !sessions[sessionId].qrCode) {
        return res.status(404).json({ message: 'QR Code não disponível ou sessão não encontrada.' });
    }

    const qrCode = sessions[sessionId].qrCode;
    res.status(200).json({ qrCode });
});

app.get('/get-qrcode-image/:sessionId', async (req, res) => {
    const { sessionId } = req.params;

    if (!sessions[sessionId] || !sessions[sessionId].qrCode) {
        return res.status(404).json({ message: 'QR Code não disponível ou sessão não encontrada.' });
    }

    try {
        const qrCodeDataUrl = await QRCode.toDataURL(sessions[sessionId].qrCode, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 320,
        });
        res.status(200).json({ qrCode: sessions[sessionId].qrCode, qrCodeDataUrl });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao gerar imagem do QR Code.', error: error.message });
    }
});

app.listen(port, () => {
    console.log(`API rodando na porta ${port}`);
    console.log(`Webhook Sigma: ${sigmaWebhookUrl}`);
    loadExistingSessions();
});
