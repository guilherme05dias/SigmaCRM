/**
 * WhatsApp CRM Bridge
 * Captura mensagens do WhatsApp Web e envia diretamente ao Supabase via REST API.
 * Execute: node index.js
 *
 * Variaveis de ambiente necessarias (arquivo .env ou ambiente do SO):
 *   SUPABASE_URL  — ex: https://xyzxyz.supabase.co
 *   SUPABASE_KEY  — service_role key (secreta, nunca commitar)
 */

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const path = require("path");
const https = require("https");

// Carrega .env se existir (npm install dotenv --save-dev)
try { require("dotenv").config(); } catch (_) {}

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERRO: defina SUPABASE_URL e SUPABASE_KEY no arquivo .env do bridge.");
  process.exit(1);
}

// ─── Helpers HTTP (sem dependencias externas) ─────────────────────────────────

function supabasePost(table, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "resolution=merge-duplicates,return=representation",
      },
    };
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${raw}`));
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ─── Inserir mensagem no Supabase ─────────────────────────────────────────────

async function pushMessage(record) {
  try {
    const now = record.timestamp;
    const isOut = record.direction === "out";

    // 1) Upsert conversa (ON CONFLICT contact_number)
    await supabasePost("whatsapp_conversations", {
      contact_name:      record.contact_name,
      contact_number:    record.contact_number,
      first_message_at:  now,
      last_message_at:   now,
      message_count:     1,
      our_message_count: isOut ? 1 : 0,
      status:            "aberto",
      created_at:        now,
      updated_at:        now,
    });

    // 2) Buscar id da conversa
    const url = new URL(`/rest/v1/whatsapp_conversations?contact_number=eq.${encodeURIComponent(record.contact_number)}&select=id`, SUPABASE_URL);
    const convRows = await new Promise((resolve, reject) => {
      https.get({
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
      }, (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => { try { resolve(JSON.parse(raw)); } catch { resolve([]); } });
      }).on("error", reject);
    });

    const convId = convRows[0]?.id;
    if (!convId) throw new Error("Conversa nao encontrada apos upsert");

    // 3) Inserir mensagem (ignorar duplicatas via wa_message_id UNIQUE)
    await supabasePost("whatsapp_messages", {
      conversation_id: convId,
      contact_number:  record.contact_number,
      direction:       record.direction,
      body:            record.body,
      timestamp:       record.timestamp,
      wa_message_id:   record.wa_message_id,
    });

    // 4) Atualizar contadores da conversa via PATCH
    const patchData = JSON.stringify({ last_message_at: now, updated_at: now });
    const patchUrl  = new URL(`/rest/v1/whatsapp_conversations?id=eq.${convId}`, SUPABASE_URL);
    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: patchUrl.hostname,
        path: patchUrl.pathname + patchUrl.search,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(patchData),
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
        },
      }, (res) => { res.resume(); res.on("end", resolve); });
      req.on("error", reject);
      req.write(patchData);
      req.end();
    });

    console.log(
      `[${record.timestamp}] ${record.direction === "in" ? "⬇" : "⬆"} ${record.contact_name} (${record.contact_number}): ${record.body.substring(0, 60)}`
    );
  } catch (err) {
    console.error("Erro ao enviar para Supabase:", err.message);
  }
}

function processMessage(msg, direction) {
  try {
    const jid = direction === "in" ? msg.from : msg.to;

    // Aceitar apenas contatos individuais; ignorar grupos (@g.us), canais/newsletters e broadcasts
    const isIndividual = jid.endsWith("@c.us") || jid.endsWith("@s.whatsapp.net");
    if (!isIndividual) {
      return;
    }

    const number = jid.replace(/@(c\.us|s\.whatsapp\.net)$/, "").replace(/\D/g, "");
    const name   = msg._data?.notifyName || msg._data?.pushName || msg._data?.name || number;
    const d      = new Date(msg.timestamp * 1000);
    const pad    = (n) => String(n).padStart(2, "0");
    const ts     = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

    // Montar body conforme tipo de mensagem
    let body;
    if (msg.type === "location" && msg.location) {
      const lat  = msg.location.latitude;
      const lng  = msg.location.longitude;
      const desc = msg.location.description || "";
      body = `📍LOCATION:${lat},${lng}:${desc}`;
    } else {
      body = msg.body || "[mídia]";
    }

    pushMessage({
      wa_message_id: msg.id._serialized,
      contact_name:  name,
      contact_number: number,
      direction,
      body,
      timestamp: ts,
    });
  } catch (err) {
    console.error("Erro ao processar mensagem:", err.message);
  }
}

// ─── Cliente WhatsApp ────────────────────────────────────────────────────────

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, ".wwebjs_auth") }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  },
});

client.on("qr", (qr) => {
  console.log("\n=== Escaneie o QR code abaixo com o WhatsApp do técnico ===\n");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () =>
  console.log("✅ Autenticado — sessão salva, próximas iniciações são automáticas.")
);
client.on("auth_failure", (msg) => console.error("❌ Falha de autenticação:", msg));

client.on("ready", () => {
  console.log("🟢 Bridge ativo — capturando mensagens em tempo real.");
  console.log(`   Enviando para: ${SUPABASE_URL}`);
});

client.on("message", (msg) => {
  processMessage(msg, "in");
});

client.on("message_create", (msg) => {
  if (!msg.fromMe) return;
  processMessage(msg, "out");
});

client.on("disconnected", (reason) => {
  console.warn("⚠️ Desconectado:", reason, "— reconectando em 10s...");
  setTimeout(() => client.initialize(), 10000);
});

client.initialize();

process.on("SIGINT", () => {
  console.log("\nEncerrando bridge...");
  client.destroy();
  process.exit(0);
});
