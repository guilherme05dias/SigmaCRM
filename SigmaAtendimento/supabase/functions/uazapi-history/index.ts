type HistoryRequest = { phone?: string; chatLimit?: number; groupLimit?: number; messageLimit?: number; requestOnly?: boolean; messageId?: string; count?: number; checkPhone?: string; profilePhone?: string; summaryOnly?: boolean; listGroups?: boolean; readPhone?: string; read?: boolean; instanceAction?: "status" | "connect" | "disconnect"; webhookAction?: "status" | "ensure" };

const requiredWebhookEvents = ["messages", "messages_update", "connection", "history", "contacts", "chats"];

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, x-internal-token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true }, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("SIGMA_INTERNAL_TOKEN")?.trim() || "";
  const received = req.headers.get("x-internal-token") || "";
  if (!expected || !received || !(await secretsEqual(received, expected))) return json({ error: "Invalid internal token" }, 401);

  const token = Deno.env.get("UAZAPI_TOKEN")?.trim();
  if (!token) return json({ error: "Missing UAZAPI_TOKEN" }, 500);

  const input = await req.json().catch(() => ({})) as HistoryRequest;
  const phone = normalizePhone(input.phone || "");
  const chatLimit = clamp(input.chatLimit, 1, 500, 500);
  const groupLimit = clamp(input.groupLimit ?? input.chatLimit, 1, 500, 500);
  const messageLimit = clamp(input.messageLimit, 1, 1000, 1000);

  try {
    if (input.webhookAction) {
      const webhook = input.webhookAction === "ensure"
        ? await ensureSigmaWebhook(token)
        : await sigmaWebhookStatus(token);
      return json({ ok: true, webhook }, 200);
    }

    if (input.instanceAction) {
      if (input.instanceAction === "connect") await ensureSigmaWebhook(token);
      const path = input.instanceAction === "status" ? "/instance/status" : `/instance/${input.instanceAction}`;
      const data = input.instanceAction === "status" ? await uazGet(path, token) : await uazPost(path, {}, token);
      return json({ ok: true, ...object(data) }, 200);
    }

    if (input.listGroups) {
      return json({ ok: true, groups: await findGroups(groupLimit, token) }, 200);
    }

    const profilePhone = normalizePhone(input.profilePhone || "");
    if (profilePhone) {
      return json({ ok: true, avatarUrl: await profilePicture(profilePhone, token) }, 200);
    }

    const checkPhone = normalizePhone(input.checkPhone || "");
    if (checkPhone) {
      const checked = object(items(await uazPost("/chat/check", { numbers: [checkPhone] }, token))[0]);
      return json({
        ok: true,
        contact: {
          exists: checked?.isInWhatsapp === true,
          phone: checkPhone,
          name: string(checked?.verifiedName),
          wid: string(checked?.jid) || `${checkPhone}@s.whatsapp.net`,
        },
      }, 200);
    }

    const readPhone = normalizePhone(input.readPhone || "");
    if (readPhone) {
      await uazPost("/chat/read", {
        number: `${readPhone}@s.whatsapp.net`,
        read: input.read !== false,
      }, token);
      return json({ ok: true, phone: readPhone, read: input.read !== false }, 200);
    }

    if (input.requestOnly && phone) {
      const webhook = await ensureSigmaWebhook(token);
      await uazPost("/message/history-sync", {
        mode: "history",
        number: `${phone}@s.whatsapp.net`,
        ...(input.messageId ? { messageid: providerMessageId(input.messageId) } : {}),
        count: clamp(input.count, 1, 100, 100),
      }, token);
      return json({ ok: true, requested: true, webhook }, 200);
    }

    let rawChats: unknown[] = [];
    if (phone) {
      for (const candidate of phoneAliases(phone)) {
        rawChats = items(await uazPost("/chat/find", { limit: 1, offset: 0, wa_isGroup: false, wa_chatid: candidate }, token));
        if (rawChats.length > 0) break;
      }
    } else {
      rawChats = items(await uazPost("/chat/find", { limit: chatLimit, offset: 0, sort: "-wa_lastMsgTimestamp", wa_isGroup: false }, token));
    }
    if (phone && rawChats.length === 0) rawChats.push({ phone, chatid: `${phone}@s.whatsapp.net` });

    if (input.summaryOnly) {
      const chats = rawChats.flatMap((value) => {
        const chat = object(value);
        if (!chat || chat.wa_isGroup === true || chat.isGroup === true) return [];
        const chatId = string(chat.wa_chatid ?? chat.chatid ?? chat.chatId ?? chat.remoteJid ?? chat.id ?? chat.phone ?? chat.number) || "";
        const contactPhone = normalizePhone(chatId || phone);
        if (contactPhone.length < 10) return [];
        return [{
          phone: contactPhone,
          unreadCount: number(chat.wa_unreadCount ?? chat.unreadCount) || 0,
          name: string(chat.name ?? chat.wa_contactName ?? chat.wa_name ?? chat.pushName ?? chat.notifyName),
          lastMessageAt: number(chat.wa_lastMsgTimestamp ?? chat.lastMessageAt ?? chat.timestamp),
        }];
      });
      return json({ ok: true, chats }, 200);
    }

    const chats = [];
    for (const value of rawChats) {
      const chat = object(value);
      if (!chat || chat.wa_isGroup === true || chat.isGroup === true) continue;
      const chatId = string(chat.wa_chatid ?? chat.chatid ?? chat.chatId ?? chat.remoteJid ?? chat.id ?? chat.phone ?? chat.number) || "";
      const contactPhone = normalizePhone(chatId || phone);
      if (contactPhone.length < 10) continue;

      const messages = await findMessages(chatId || `${contactPhone}@s.whatsapp.net`, contactPhone, messageLimit, token);
      const avatarUrl = extractUrl(chat) || await profilePicture(contactPhone, token);
      chats.push({
        phone: contactPhone,
        name: string(chat.name ?? chat.wa_contactName ?? chat.wa_name ?? chat.pushName ?? chat.notifyName),
        avatarUrl,
        unreadCount: number(chat.wa_unreadCount ?? chat.unreadCount) || 0,
        lastMessageAt: number(chat.wa_lastMsgTimestamp ?? chat.lastMessageAt ?? chat.timestamp),
        messages,
      });
    }
    return json({ ok: true, chats }, 200);
  } catch (error) {
    return json({ error: "Falha ao consultar o histórico na UAZAPI", details: error instanceof Error ? error.message : String(error) }, 502);
  }
});

async function uazPost(path: string, body: Record<string, unknown>, token: string): Promise<unknown> {
  const base = (Deno.env.get("UAZAPI_BASE_URL") || "https://free.uazapi.com").replace(/\/$/, "");
  const response = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", token, authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || data?.detail || data?.message || `HTTP ${response.status}`);
  return data;
}

async function uazGet(path: string, token: string): Promise<unknown> {
  const base = (Deno.env.get("UAZAPI_BASE_URL") || "https://free.uazapi.com").replace(/\/$/, "");
  const response = await fetch(`${base}${path}`, { headers: { token, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || data?.detail || data?.message || `HTTP ${response.status}`);
  return data;
}

async function sigmaWebhookStatus(token: string) {
  const url = sigmaWebhookUrl();
  const hooks = items(await uazGet("/webhook", token)).map(object).filter(Boolean) as Record<string, any>[];
  const hook = hooks.find((candidate) => string(candidate.url) === url);
  const events = Array.isArray(hook?.events) ? hook.events.map(String) : [];
  return {
    configured: Boolean(hook),
    enabled: hook?.enabled !== false,
    events,
    ready: Boolean(hook) && hook?.enabled !== false && requiredWebhookEvents.every((event) => events.includes(event)),
  };
}

async function ensureSigmaWebhook(token: string) {
  const url = sigmaWebhookUrl();
  const hooks = items(await uazGet("/webhook", token)).map(object).filter(Boolean) as Record<string, any>[];
  const hook = hooks.find((candidate) => string(candidate.url) === url);
  const currentEvents = Array.isArray(hook?.events) ? hook.events.map(String) : [];
  const events = [...new Set([...currentEvents, ...requiredWebhookEvents])];
  const excludeMessages = Array.isArray(hook?.excludeMessages) && hook.excludeMessages.length
    ? hook.excludeMessages.map(String)
    : ["wasSentByApi"];
  const ready = Boolean(hook) && hook?.enabled !== false && requiredWebhookEvents.every((event) => currentEvents.includes(event));

  if (ready) return { configured: true, enabled: true, events, ready: true, updated: false };

  const payload: Record<string, unknown> = {
    enabled: true,
    url,
    events,
    excludeMessages,
    addUrlEvents: false,
    addUrlTypesMessages: false,
  };
  const id = string(hook?.id);
  if (hook && id) {
    payload.action = "update";
    payload.id = id;
  } else if (!hook) {
    payload.action = "add";
  }

  await uazPost("/webhook", payload, token);
  return { configured: true, enabled: true, events, ready: true, updated: true };
}

function sigmaWebhookUrl(): string {
  const explicit = Deno.env.get("UAZAPI_WEBHOOK_URL")?.trim();
  if (explicit) return explicit;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const secret = Deno.env.get("UAZAPI_WEBHOOK_SECRET")?.trim();
  if (!supabaseUrl || !secret) throw new Error("UAZAPI_WEBHOOK_URL ou UAZAPI_WEBHOOK_SECRET não configurado.");
  return `${supabaseUrl}/functions/v1/uazapi-webhook?token=${encodeURIComponent(secret)}`;
}

async function profilePicture(phone: string, token: string): Promise<string | null> {
  return extractUrl(await uazPost("/chat/details", { number: phone, preview: true }, token));
}

async function findGroups(limit: number, token: string) {
  const rawGroups = items(await uazPost("/chat/find", {
    limit,
    offset: 0,
    sort: "-wa_lastMsgTimestamp",
    wa_isGroup: true,
  }, token));

  return rawGroups.flatMap((value) => {
    const group = object(value);
    if (!group) return [];
    const id = normalizeGroupId(string(group.wa_chatid ?? group.chatid ?? group.chatId ?? group.remoteJid ?? group.id ?? group.phone ?? group.number) || "");
    if (!id) return [];
    return [{
      id,
      name: string(group.name ?? group.wa_contactName ?? group.wa_name ?? group.subject ?? group.pushName ?? group.notifyName) || id,
      participantCount: number(group.participantCount ?? group.participantsCount ?? group.wa_participantCount),
      unreadCount: number(group.wa_unreadCount ?? group.unreadCount) || 0,
      lastMessageAt: number(group.wa_lastMsgTimestamp ?? group.lastMessageAt ?? group.timestamp),
    }];
  });
}

function normalizeMessage(value: unknown) {
  const message = object(value); if (!message) return null;
  const content = contentObject(message.content) || contentObject(message.message);
  const declaredType = String(message.messageType ?? message.type ?? "").toLowerCase();
  const type = String(declaredType === "media" ? message.mediaType ?? message.mimetype : declaredType || message.mediaType || message.mimetype || content?.mimetype || "text").toLowerCase();
  const mediaType = type.includes("image") ? "IMAGE" : type.includes("audio") || type.includes("ptt") ? "AUDIO" : type.includes("video") ? "VIDEO" : type.includes("document") || type.includes("file") ? "DOCUMENT" : "TEXT";
  const body = string(message.body ?? message.text ?? message.caption ?? content?.text ?? content?.caption ?? content?.conversation ?? (!content ? message.content : null));
  const mediaUrl = string(message.fileURL ?? message.fileUrl ?? message.mediaUrl ?? message.media_url ?? message.url ?? content?.url);
  if (!body && !mediaUrl && mediaType === "TEXT") return null;
  return {
    direction: message.fromMe === true || message.wa_fromMe === true || message.direction === "OUTBOUND" ? "OUTBOUND" : "INBOUND",
    type: mediaType,
    body,
    mediaUrl,
    waMessageId: string(message.messageid ?? message.messageId ?? message.key?.id ?? message.id),
    replyToProviderMessageId: string(message.quoted ?? message.quotedMessageId ?? message.contextInfo?.stanzaId ?? content?.contextInfo?.stanzaId),
    timestamp: number(message.messageTimestamp ?? message.timestamp ?? message.wa_timestamp ?? message.createdAt),
  };
}

async function findMessages(chatId: string, phone: string, limit: number, token: string) {
  const result: NonNullable<ReturnType<typeof normalizeMessage>>[] = [];
  const known = new Set<string>();
  const candidates = messageChatCandidates(chatId, phone);
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      await collectMessages(candidate, limit, token, result, known);
    } catch (error) {
      lastError = error;
    }
    if (result.length >= limit) break;
  }

  if (!result.length && lastError) throw lastError;
  return result;
}

async function collectMessages(chatId: string, limit: number, token: string, result: NonNullable<ReturnType<typeof normalizeMessage>>[], known: Set<string>) {
  const pageSize = Math.min(limit, 200);
  for (let offset = 0; offset < limit; offset += pageSize) {
    const page = items(await uazPost("/message/find", { chatid: chatId, limit: Math.min(pageSize, limit - offset), offset }, token));
    if (!page.length) break;
    for (const value of page) {
      const normalized = normalizeMessage(value);
      if (!normalized) continue;
      const id = normalized.waMessageId || `${normalized.timestamp}:${normalized.direction}`;
      if (known.has(id)) continue;
      known.add(id);
      result.push(normalized);
    }
    if (page.length < pageSize) break;
  }
}

function messageChatCandidates(chatId: string, phone: string): string[] {
  const aliases = phoneAliases(phone).flatMap((alias) => [alias, `${alias}@s.whatsapp.net`]);
  return [...new Set([chatId, normalizePhone(chatId), ...aliases].filter((value) => value && value.length >= 10))];
}

function items(value: unknown): unknown[] { if (Array.isArray(value)) return value; const data = object(value); if (!data) return []; for (const key of ["data", "chats", "messages", "results", "items"]) if (Array.isArray(data[key])) return data[key]; return []; }
function object(value: unknown): Record<string, any> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null; }
function contentObject(value: unknown): Record<string, any> | null { if (typeof value === "string") { try { return object(JSON.parse(value)); } catch { return null; } } return object(value); }
function string(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : null; }
function number(value: unknown): number | null { const result = typeof value === "number" ? value : Number(value); return Number.isFinite(result) && result > 0 ? result : null; }
function normalizePhone(value: string): string {
  const digits = value.replace(/@s\.whatsapp\.net|@c\.us|@lid/g, "").replace(/\D/g, "");
  if (!digits.startsWith("55") || digits.length !== 12) return digits;
  const areaCode = Number(digits.slice(2, 4));
  const subscriber = digits.slice(4);
  if (areaCode < 11 || areaCode > 99 || !/^[6-9]/.test(subscriber)) return digits;
  return `${digits.slice(0, 4)}9${subscriber}`;
}
function phoneAliases(value: string): string[] {
  const canonical = normalizePhone(value);
  const aliases = new Set([canonical]);
  if (canonical.startsWith("55") && canonical.length === 13 && canonical[4] === "9" && /^[6-9]/.test(canonical[5] || "")) {
    aliases.add(`${canonical.slice(0, 4)}${canonical.slice(5)}`);
  }
  return [...aliases];
}
function normalizeGroupId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("@g.us")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `${digits}@g.us` : "";
}
function extractUrl(value: unknown): string | null { const data = object(value); if (!data) return null; for (const key of ["image", "imagePreview", "avatarUrl", "profilePictureUrl", "profilePicUrl", "pictureUrl", "url", "imageUrl", "imgUrl", "wa_profilePicUrl"]) { const url = string(data[key]); if (url && /^https?:\/\//i.test(url)) return url; } for (const key of ["data", "result", "message"]) { const url = extractUrl(data[key]); if (url) return url; } return null; }
function providerMessageId(value: string): string { return value.includes(":") ? value.split(":").at(-1) || value : value; }
function clamp(value: unknown, min: number, max: number, fallback: number) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback; }
async function secretsEqual(left: string, right: string) { const encoder = new TextEncoder(); const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(left)), crypto.subtle.digest("SHA-256", encoder.encode(right))]); const x = new Uint8Array(a); const y = new Uint8Array(b); let diff = x.length ^ y.length; for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i]; return diff === 0; }
function json(body: unknown, status: number) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" } }); }
