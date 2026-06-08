
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
const sigmaInternalToken = process.env.SIGMA_INTERNAL_TOKEN || '';

app.use(express.json({ limit: '50mb' }));
app.use(require('cors')());

const mediaDir = path.join(__dirname, 'media');
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
app.use('/media', express.static(mediaDir));


const sessionsDir = path.join(__dirname, 'sessions'); // Diretório onde as sessões estão armazenadas
const widPhoneMapPath = path.join(sessionsDir, 'wid-phone-map.json');
let sessions = {}; // Armazena as sessões ativas e os QR Codes
const forwardedIncomingMessageIds = new Set();
const widPhoneMap = new Map();

function ensureSessionsDir() {
    if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
    }
}

function loadWidPhoneMap() {
    ensureSessionsDir();
    if (!fs.existsSync(widPhoneMapPath)) return;

    try {
        const raw = fs.readFileSync(widPhoneMapPath, 'utf8');
        const entries = JSON.parse(raw);
        if (Array.isArray(entries)) {
            entries.forEach(([wid, phone]) => {
                if (wid && phone) widPhoneMap.set(wid, phone);
            });
        }
    } catch (error) {
        console.warn('Não foi possível carregar mapa wid->telefone:', error.message);
    }
}

function rememberWidPhone(wid, phone) {
    const normalizedPhone = String(phone || '').replace(/\D/g, '');
    if (!wid || normalizedPhone.length < 10) return;

    widPhoneMap.set(wid, normalizedPhone);
    try {
        ensureSessionsDir();
        fs.writeFileSync(widPhoneMapPath, JSON.stringify([...widPhoneMap.entries()], null, 2));
    } catch (error) {
        console.warn('Não foi possível persistir mapa wid->telefone:', error.message);
    }
}

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

function isDirectChat(chat) {
    const serializedId = chat.id?._serialized || '';
    if (!serializedId || chat.isGroup) return false;
    if (serializedId.includes('@broadcast') || serializedId.includes('status@broadcast')) return false;
    return serializedId.endsWith('@c.us') || serializedId.endsWith('@lid');
}

function resolveContactPhone(contact, chat) {
    const contactWid = contact?.id?._serialized || '';
    const chatWid = chat?.id?._serialized || '';
    const mappedPhone = widPhoneMap.get(chatWid) || widPhoneMap.get(contactWid);
    if (mappedPhone) return String(mappedPhone).replace(/\D/g, '');

    // contact.number is the real phone for @c.us; for @lid it may be empty
    const rawPhone = contact?.number || '';
    if (rawPhone) return String(rawPhone).replace(/\D/g, '');

    // For @c.us ids the user part is the phone number
    const cidUser = contact?.id?.user || '';
    if (cidUser && !contactWid.endsWith('@lid') && !chatWid.endsWith('@lid')) {
        return String(cidUser).replace(/\D/g, '');
    }

    // @lid: id.user is not a phone — return empty so the caller can handle it
    return '';
}

async function notifySigmaHistorySync(sessionId) {
    // Wait for WhatsApp Web to finish loading chats before syncing
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (sigmaInternalToken) headers['x-internal-token'] = sigmaInternalToken;

        const response = await fetch(`${sigmaWhatsAppBaseUrl}/sessions/${encodeURIComponent(sessionId)}/sync-history`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ chatLimit: 100, messageLimit: 50 }),
        });

        if (!response.ok) {
            console.error(`Falha ao solicitar sincronização de histórico no Sigma: ${response.status}`);
        } else {
            console.log(`Histórico sincronizado automaticamente para sessão ${sessionId}`);
        }
    } catch (error) {
        console.error('Erro ao solicitar sincronização de histórico no Sigma:', error);
    }
}

async function resolvePhoneForMessage(contact, fromWid, client) {
    // Try the wid->phone map first (populated by history sync and check-number)
    const mapped = widPhoneMap.get(fromWid) || widPhoneMap.get(contact?.id?._serialized || '');
    if (mapped) return String(mapped).replace(/\D/g, '');

    // contact.number is populated for @c.us; empty for @lid
    if (contact?.number) return String(contact.number).replace(/\D/g, '');

    // For @lid, try resolving via getNumberId using the id.user part (may contain numeric suffix)
    const lidUser = contact?.id?.user || '';
    if (fromWid.endsWith('@lid') && lidUser && client) {
        try {
            const numberId = await client.getNumberId(lidUser);
            if (numberId?._serialized) {
                const phone = String(numberId.user || lidUser).replace(/\D/g, '');
                rememberWidPhone(fromWid, phone);
                rememberWidPhone(numberId._serialized, phone);
                return phone;
            }
        } catch {
            // ignore — best effort
        }
    }

    // For @c.us the user part is the phone
    if (!fromWid.endsWith('@lid') && contact?.id?.user) {
        return String(contact.id.user).replace(/\D/g, '');
    }

    return '';
}

async function forwardIncomingMessageToSigma(sessionId, message) {
    const messageId = message.id?.id || message.id?._serialized || String(Date.now());
    const dedupeKey = `${sessionId}:${messageId}`;
    if (forwardedIncomingMessageIds.has(dedupeKey)) return;
    forwardedIncomingMessageIds.add(dedupeKey);

    try {
        const client = sessions[sessionId];
        const contact = await message.getContact();
        const wid = contact.id?._serialized || message.from;
        const contactPhone = await resolvePhoneForMessage(contact, wid, client);

        // Download media if present
        let mediaUrl = null;
        if (message.hasMedia) {
            try {
                const media = await message.downloadMedia();
                if (media?.data) {
                    const ext = (media.mimetype || 'application/octet-stream').split('/')[1]?.split(';')[0] || 'bin';
                    const filename = `${messageId}.${ext}`;
                    const filePath = path.join(mediaDir, filename);
                    fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'));
                    mediaUrl = `http://localhost:${port}/media/${filename}`;
                }
            } catch (mediaErr) {
                console.warn(`Não foi possível baixar mídia da mensagem ${messageId}:`, mediaErr.message);
            }
        }

        const direction = message.fromMe ? 'OUTBOUND' : 'INBOUND';
        const pushname = contact.pushname || contact.name || contact.shortName || null;

        const payload = {
            provider: 'murilo-api',
            sessionId,
            payload: {
                id: messageId,
                from: message.from,
                phone: contactPhone,
                wid,
                body: message.body || message.caption || '',
                hasMedia: message.hasMedia,
                mediaUrl,
                type: message.type,
                fromMe: message.fromMe,
                direction,
                timestamp: message.timestamp,
                pushname,
                _data: {
                    notifyName: pushname,
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
        await forwardIncomingMessageToSigma(sessionId, message);
    });

    client.on('message_create', async (message) => {
        await forwardIncomingMessageToSigma(sessionId, message);
    });

    client.initialize();
    return client;
}

// Carrega sessões existentes ao iniciar o servidor
function loadExistingSessions() {
    if (fs.existsSync(sessionsDir)) {
        const sessionFiles = fs.readdirSync(sessionsDir, { withFileTypes: true });
        sessionFiles
            .filter((file) => file.isDirectory() && file.name.startsWith('session-'))
            .forEach((file) => {
                const sessionId = file.name.replace(/^session-/, '');
                if (!sessionId) return;

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
            .filter(isDirectChat)
            .sort((a, b) => {
                const aTime = a.timestamp || a.lastMessage?.timestamp || 0;
                const bTime = b.timestamp || b.lastMessage?.timestamp || 0;
                return bTime - aTime;
            })
            .slice(0, chatLimit);

        const result = [];

        for (const chat of directChats) {
            const contact = await chat.getContact();
            const phone = resolveContactPhone(contact, chat);
            if (phone.length < 10) continue;
            if (contact.id?._serialized) rememberWidPhone(contact.id._serialized, phone);
            if (chat.id?._serialized) rememberWidPhone(chat.id._serialized, phone);

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
        rememberWidPhone(numberId._serialized, normalizedPhone);
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
        rememberWidPhone(destinationId, normalizedPhone);

        let sentMessage;
        if (arquivoBase64 && nomeArquivo) {
            // Criar a mídia com o nome do arquivo
            const media = new MessageMedia('application/pdf', arquivoBase64, nomeArquivo);

            // Enviar o arquivo sem legenda
            sentMessage = await client.sendMessage(destinationId, media);
        } else if (mensagem) {
            // Enviar apenas a mensagem de texto
            sentMessage = await client.sendMessage(destinationId, mensagem);
        } else {
            return res.status(400).json({ message: "Nenhuma mensagem ou arquivo enviado." });
        }

        const messageId = typeof sentMessage?.id === 'object' ? sentMessage.id.id : sentMessage?.id;
        res.status(200).json({ message: 'Mensagem enviada com sucesso!', wid: destinationId, messageId });
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
    loadWidPhoneMap();
    loadExistingSessions();
});
