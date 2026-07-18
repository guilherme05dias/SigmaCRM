import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type UazapiPayload = {
  event?: string;
  EventType?: string;
  eventType?: string;
  data?: Record<string, unknown>;
  message?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
};

type ParsedIncoming = {
  providerMessageId: string | null;
  replyToProviderMessageId: string | null;
  phone: string;
  name: string | null;
  isGroup: boolean;
  direction: "INBOUND" | "OUTBOUND";
  type: "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT";
  body: string | null;
  mediaUrl: string | null;
  timestamp: number | null;
};

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, x-signature, x-webhook-token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true }, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedToken = Deno.env.get("UAZAPI_WEBHOOK_SECRET")?.trim() || "";
  const receivedToken =
    req.headers.get("x-webhook-token") ||
    req.headers.get("x-signature") ||
    // A UAZAPI hospedada no servidor gratuito não permite headers
    // personalizados no webhook; ela anexa o token à URL configurada.
    new URL(req.url).searchParams.get("token") ||
    "";

  if (!expectedToken) {
    return json({ error: "Webhook authentication is not configured" }, 503);
  }

  if (!receivedToken || !(await secretsEqual(receivedToken, expectedToken))) {
    return json({ error: "Invalid webhook token" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  let payload: UazapiPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON payload" }, 400);
  }

  const parsedItems = messageCandidates(payload)
    .map((item) => parseUazapiPayload(item as UazapiPayload, payload))
    .filter((item): item is ParsedIncoming => Boolean(item));
  const parsed = parsedItems[0];
  if (!parsed) {
    return json({ ok: true, ignored: true, reason: "Payload sem mensagem processável" }, 200);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const companyId = await resolveConfiguredCompanyId(supabase);
  if (!companyId) {
    return json({ error: "SIGMA_DEFAULT_COMPANY_ID ausente ou aponta para uma empresa inativa" }, 503);
  }

  const eventType = String(payload.event || payload.EventType || payload.eventType || "").toLowerCase();
  if (eventType.includes("history")) {
    let imported = 0;
    for (const historyMessage of parsedItems) {
      imported += await persistHistoryMessage(supabase, companyId, historyMessage, payload);
    }
    return json({ ok: true, history: true, imported }, 200);
  }

  const now = new Date().toISOString();

  const { data: existingContact, error: contactFindError } = await supabase
    .from("Contact")
    .select("id, name, is_whatsapp_group, welcome_message_enabled, include_in_service_reports")
    .eq("companyId", companyId)
    .eq("phone", parsed.phone)
    .maybeSingle();
  if (contactFindError) return json({ error: "Falha ao buscar contato", details: contactFindError.message }, 500);

  const inboundContactName = parsed.direction === "INBOUND" ? providerContactName(parsed.name) : null;
  const contactResult = existingContact
    ? await supabase.from("Contact").update({ ...(parsed.isGroup ? { is_whatsapp_group: true } : {}), updatedAt: now }).eq("id", existingContact.id).select("id, is_whatsapp_group, welcome_message_enabled, include_in_service_reports").single()
    : await supabase.from("Contact").insert({ id: crypto.randomUUID(), companyId, phone: parsed.phone, name: inboundContactName, is_whatsapp_group: parsed.isGroup, createdAt: now, updatedAt: now }).select("id, is_whatsapp_group, welcome_message_enabled, include_in_service_reports").single();
  const contact = contactResult.data;
  const contactError = contactResult.error;

  if (contactError || !contact) {
    return json({ error: "Falha ao criar/atualizar contato", details: contactError?.message }, 500);
  }

  // Uma nota enviada após o encerramento pertence ao último atendimento
  // aguardando avaliação; ela não deve abrir uma nova conversa.
  const inboundProviderMessageId = parsed.providerMessageId || stableId(payload, parsed.phone, parsed.body);
  if (parsed.direction === "INBOUND") {
    const { data: previouslyProcessed, error: previouslyProcessedError } = await supabase
      .from("WhatsAppInboundEvent")
      .select("id")
      .eq("provider", "UAZAPI")
      .eq("providerMessageId", inboundProviderMessageId)
      .limit(1)
      .maybeSingle();
    if (previouslyProcessedError) {
      return json({ error: "Falha ao verificar duplicidade do webhook", details: previouslyProcessedError.message }, 500);
    }
    if (previouslyProcessed) {
      return json({ ok: true, duplicate: true, consumed: true }, 200);
    }
  }

  const rating = parsed.direction === "INBOUND" && parsed.type === "TEXT" ? extractRating(parsed.body) : null;
  if (rating !== null) {
    const { data: pendingRating, error: pendingRatingError } = await supabase
      .from("Conversation")
      .select("id")
      .eq("companyId", companyId)
      .eq("contactId", contact.id)
      .eq("status", "CLOSED")
      .not("ratingRequestedAt", "is", null)
      .is("ratedAt", null)
      .gte("ratingRequestedAt", daysAgoIso(30))
      .order("closedAt", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingRatingError) return json({ error: "Falha ao buscar avaliação pendente", details: pendingRatingError.message }, 500);
    if (pendingRating) {
      const { data: ratingInboundEvent, error: ratingInboundError } = await supabase
        .from("WhatsAppInboundEvent")
        .insert({
          id: crypto.randomUUID(),
          companyId,
          provider: "UAZAPI",
          providerMessageId: inboundProviderMessageId,
          fromPhone: parsed.phone,
          rawPayload: payload,
          processedAt: now,
        })
        .select("id")
        .single();
      if (isUniqueViolation(ratingInboundError)) {
        return json({ ok: true, duplicate: true, ratingConsumed: true }, 200);
      }
      if (ratingInboundError || !ratingInboundEvent) {
        return json({ error: "Falha ao reservar evento da avaliacao", details: ratingInboundError?.message }, 500);
      }

      const { error: ratingUpdateError } = await supabase
        .from("Conversation")
        .update({ rating, ratedAt: now, updatedAt: now })
        .eq("id", pendingRating.id)
        .is("ratedAt", null);
      if (ratingUpdateError) return json({ error: "Falha ao registrar avaliação", details: ratingUpdateError.message }, 500);

      await supabase.from("Message").insert({
        id: crypto.randomUUID(), companyId, conversationId: pendingRating.id,
        direction: "INBOUND", type: "TEXT", body: String(rating), waMessageId: parsed.providerMessageId,
        createdAt: now, updatedAt: now,
      });
      return json({ ok: true, ratingRecorded: true, conversationId: pendingRating.id, rating }, 200);
    }
  }

  let { data: conversation, error: conversationFindError } = await supabase
    .from("Conversation")
    .select("id, status, companyId, lastWelcomeSentAt, lastAwaySentAt")
    .eq("companyId", companyId)
    .eq("contactId", contact.id)
    .neq("status", "CLOSED")
    .order("createdAt", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (conversationFindError) {
    return json({ error: "Falha ao buscar atendimento", details: conversationFindError.message }, 500);
  }

  if (conversation && conversation.companyId !== companyId) {
    return json({ error: "Atendimento pertence a outra empresa" }, 409);
  }

  let isNewConversation = false;
  if (!conversation) {
    const { data: createdConversation, error: conversationCreateError } = await supabase
      .from("Conversation")
      .insert({
        id: crypto.randomUUID(),
        companyId,
        contactId: contact.id,
        status: "OPEN",
        startedAt: now,
        lastMessageAt: now,
        updatedAt: now,
      })
      .select("id, status, companyId, lastWelcomeSentAt, lastAwaySentAt")
      .single();

    if (conversationCreateError && isUniqueViolation(conversationCreateError)) {
      const { data: concurrentlyCreatedConversation, error: concurrentFindError } = await supabase
        .from("Conversation")
        .select("id, status, companyId, lastWelcomeSentAt, lastAwaySentAt")
        .eq("companyId", companyId)
        .eq("contactId", contact.id)
        .neq("status", "CLOSED")
        .order("createdAt", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (concurrentFindError || !concurrentlyCreatedConversation) {
        return json({ error: "Falha ao recuperar atendimento concorrente", details: concurrentFindError?.message }, 500);
      }
      conversation = concurrentlyCreatedConversation;
    } else if (conversationCreateError || !createdConversation) {
      return json({ error: "Falha ao criar atendimento", details: conversationCreateError?.message }, 500);
    } else {
      conversation = createdConversation;
      isNewConversation = true;
    }
  }

  if (parsed.direction === "INBOUND") {
    const { error: inboundError } = await supabase
      .from("WhatsAppInboundEvent")
      .insert({
        id: crypto.randomUUID(),
        companyId,
        provider: "UAZAPI",
        providerMessageId: parsed.providerMessageId || stableId(payload, parsed.phone, parsed.body),
        fromPhone: parsed.phone,
        rawPayload: payload,
        processedAt: now,
      });

    if (isUniqueViolation(inboundError)) return json({ ok: true, duplicate: true }, 200);
    if (inboundError) {
      return json({ error: "Falha ao registrar evento inbound", details: inboundError.message }, 500);
    }
  }

  const { data: message, error: messageError } = await supabase
    .from("Message")
    .insert({
      id: crypto.randomUUID(),
      companyId,
      conversationId: conversation.id,
      direction: parsed.direction,
      type: parsed.type,
      body: parsed.body,
      mediaUrl: parsed.mediaUrl,
      waMessageId: parsed.providerMessageId,
      replyToMessageId: await resolveReplyToMessageId(supabase, companyId, conversation.id, parsed.replyToProviderMessageId),
      createdAt: now,
      updatedAt: now,
    })
    .select("id")
    .single();

  if (messageError) {
    return json({ error: "Falha ao salvar mensagem", details: messageError.message }, 500);
  }

  await supabase
    .from("Conversation")
    .update({ lastMessageAt: now, updatedAt: now })
    .eq("id", conversation.id)
    .eq("companyId", companyId);

  if (parsed.direction === "INBOUND") {
    const { data: settings, error: settingsError } = await supabase
      .from("Settings")
      .select("businessHours, welcomeMessage, awayMessage")
      .eq("company_id", companyId)
      .maybeSingle();
    const withinBusinessHours = isWithinBusinessHours(now, settings?.businessHours);
    const automaticType = withinBusinessHours ? "WELCOME" : "AWAY";
    const automaticMessage = (withinBusinessHours ? settings?.welcomeMessage : settings?.awayMessage)?.trim();
    const markerField = withinBusinessHours ? "lastWelcomeSentAt" : "lastAwaySentAt";
    const previousMarker = conversation[markerField] as string | null | undefined;
    let attendantAlreadyReplied = false;
    const automaticMessageBlocked = contact.is_whatsapp_group === true || (withinBusinessHours && contact.welcome_message_enabled === false);
    if (withinBusinessHours) {
      const { data: attendantMessage, error: attendantMessageError } = await supabase
        .from("Message")
        .select("id")
        .eq("companyId", companyId)
        .eq("conversationId", conversation.id)
        .eq("direction", "OUTBOUND")
        .limit(1)
        .maybeSingle();

      if (attendantMessageError) {
        console.error("Falha ao verificar resposta do atendente; saudação automática ignorada:", attendantMessageError.message);
        attendantAlreadyReplied = true;
      } else {
        attendantAlreadyReplied = Boolean(attendantMessage);
      }
    }

    if (!automaticMessageBlocked && !settingsError && automaticMessage && !attendantAlreadyReplied && !wasAutomaticMessageSentToday(previousMarker, now)) {
      const claimed = await claimAutomaticMessage(supabase, companyId, conversation.id, markerField, previousMarker, now);
      if (!claimed) return json({ ok: true, duplicateAutomaticMessage: true, conversationId: conversation.id }, 200);

      const sent = await sendTextToUazapi(parsed.phone, automaticMessage);
      if (sent.ok) {
        const { data: systemMessage, error: systemMessageError } = await supabase.from("Message").insert({
          id: crypto.randomUUID(), companyId, conversationId: conversation.id,
          direction: "SYSTEM", type: "TEXT", body: automaticMessage, waMessageId: sent.messageId,
          createdAt: now, updatedAt: now,
        }).select("id").maybeSingle();
        if (systemMessageError) console.error(`Falha ao salvar mensagem automática ${automaticType}:`, systemMessageError.message);
        if (systemMessage?.id) {
          await supabase.from("WhatsAppOutbox").insert({
            id: crypto.randomUUID(), companyId, conversationId: conversation.id, messageId: systemMessage.id,
            provider: "UAZAPI", toPhone: parsed.phone, payload: { kind: "automatic", automaticType, body: automaticMessage },
            status: "SENT", attempts: 1, providerMessageId: sent.messageId, createdAt: now, updatedAt: now,
          });
        }
      } else {
        await rollbackAutomaticMessageClaim(supabase, companyId, conversation.id, markerField, previousMarker, now);
        console.error(`Falha ao enviar mensagem automática ${automaticType}:`, sent.error);
      }
    }
  }

  return json({
    ok: true,
    companyId,
    contactId: contact.id,
    conversationId: conversation.id,
    messageId: message?.id,
    isNewConversation,
  }, 200);
});

function parseUazapiPayload(payload: UazapiPayload, envelope: UazapiPayload = payload): ParsedIncoming | null {
  const chat = asObject(payload.chat) || asObject(envelope.chat);
  const data = asObject(payload.data) || asObject(payload.message) || asObject(payload.payload) || payload;
  const eventType = String(envelope.event || envelope.EventType || envelope.eventType || data.event || data.EventType || data.eventType || "");

  if (eventType && !eventType.toLowerCase().includes("message") && !eventType.toLowerCase().includes("history")) return null;

  const fromMe = data.fromMe === true || data.wa_fromMe === true || data.wasSentByApi === true || data.direction === "OUTBOUND";

  const fromRaw =
    data.chatid ||
    data.remoteJid ||
    data.sender_pn ||
    chat?.phone ||
    data.phone ||
    data.number ||
    (!fromMe ? data.from : null) ||
    data.contact ||
    data.sender_lid ||
    data.sender ||
    "";

  const rawChatId = String(data.chatid || data.remoteJid || asObject(data.key)?.remoteJid || chat?.wa_chatid || fromRaw || "");
  const isGroup = data.wa_isGroup === true || data.isGroup === true || chat?.wa_isGroup === true || chat?.isGroup === true || rawChatId.includes("@g.us");
  const phone = normalizePhone(String(fromRaw));
  const content = contentObject(data.content) || contentObject(data.message);
  const body =
    stringOrNull(data.body) ||
    stringOrNull(data.text) ||
    stringOrNull(data.caption) ||
    stringOrNull(content?.text) ||
    stringOrNull(content?.caption) ||
    stringOrNull(content?.conversation) ||
    (!content ? stringOrNull(data.content) : null);
  const mediaUrl =
    stringOrNull(data.fileURL) ||
    stringOrNull(data.fileUrl) ||
    stringOrNull(data.mediaUrl) ||
    stringOrNull(data.media_url) ||
    stringOrNull(data.url) ||
    stringOrNull(content?.url);

  // Em eventos de mídia, a UAZAPI pode usar `type: media` e colocar o tipo
  // concreto em `mediaType` (por exemplo, `audio`). Priorize essa informação
  // para não descartar áudios sem texto ou URL no payload inicial.
  const declaredType = String(data.messageType || data.type || "").toLowerCase();
  const rawType = String(
    declaredType === "media"
      ? data.mediaType || data.media_type || data.mimetype || declaredType
      : declaredType || data.mediaType || data.media_type || data.mimetype || "text",
  ).toLowerCase();
  const type = mapMessageType(rawType);
  // A UAZAPI pode notificar áudios e documentos sem uma URL no próprio webhook.
  // Ainda registramos o evento para ele aparecer na conversa e poder ser baixado em seguida.
  if (!phone || (!body && !mediaUrl && type === "TEXT")) return null;

  return {
    providerMessageId: stringOrNull(data.messageid) || stringOrNull(data.messageId) || stringOrNull(asObject(data.key)?.id) || stringOrNull(data.key) || stringOrNull(data.id),
    replyToProviderMessageId:
      stringOrNull(data.quoted) ||
      stringOrNull(data.quotedMessageId) ||
      stringOrNull(asObject(data.contextInfo)?.stanzaId) ||
      stringOrNull(asObject(content?.contextInfo)?.stanzaId),
    phone,
    isGroup,
    name: stringOrNull(data.name) || stringOrNull(data.senderName) || stringOrNull(chat?.wa_name) || stringOrNull(data.pushName) || stringOrNull(data.notifyName),
    direction: fromMe ? "OUTBOUND" : "INBOUND",
    type,
    body: body || mediaLabel(type),
    mediaUrl,
    timestamp: numberOrNull(data.messageTimestamp ?? data.timestamp ?? data.wa_timestamp ?? data.createdAt),
  };
}

function messageCandidates(payload: UazapiPayload): unknown[] {
  const root = asObject(payload) || {};
  const candidates: unknown[] = [];
  for (const key of ["messages", "history", "items", "records"]) {
    if (Array.isArray(root[key])) candidates.push(...root[key] as unknown[]);
  }
  if (Array.isArray(root.data)) candidates.push(...root.data);
  const data = asObject(root.data);
  if (data) {
    for (const key of ["messages", "history", "items", "records"]) {
      if (Array.isArray(data[key])) candidates.push(...data[key] as unknown[]);
    }
  }
  return candidates.length ? candidates : [payload];
}

function contentObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try { return asObject(JSON.parse(value)); } catch { return null; }
  }
  return asObject(value);
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function timestampIso(value: number | null): string {
  if (!value) return new Date().toISOString();
  const date = new Date(value > 9_999_999_999 ? value : value * 1000);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

async function persistHistoryMessage(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  parsed: ParsedIncoming,
  rawPayload: UazapiPayload,
): Promise<number> {
  const occurredAt = timestampIso(parsed.timestamp);
  const found = await supabase
    .from("Contact")
    .select("id, name")
    .eq("companyId", companyId)
    .eq("phone", parsed.phone)
    .maybeSingle();
  if (found.error) throw new Error(found.error.message);
  const inboundContactName = parsed.direction === "INBOUND" ? providerContactName(parsed.name) : null;
  const contactResult = found.data
    ? await supabase.from("Contact").update({ updatedAt: occurredAt }).eq("id", found.data.id).select("id").single()
    : await supabase.from("Contact").insert({ id: crypto.randomUUID(), companyId, phone: parsed.phone, name: inboundContactName, createdAt: occurredAt, updatedAt: occurredAt }).select("id").single();
  const contact = contactResult.data;
  const contactError = contactResult.error;
  if (contactError || !contact) throw new Error(contactError?.message || "Falha ao salvar contato do histórico");

  let { data: conversation, error: conversationError } = await supabase
    .from("Conversation")
    .select("id, status, lastMessageAt")
    .eq("companyId", companyId)
    .eq("contactId", contact.id)
    .order("updatedAt", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (conversationError) throw new Error(conversationError.message);
  if (!conversation) {
    const created = await supabase.from("Conversation").insert({
      id: crypto.randomUUID(), companyId, contactId: contact.id, status: "CLOSED",
      startedAt: occurredAt, closedAt: occurredAt, lastMessageAt: occurredAt, createdAt: occurredAt, updatedAt: occurredAt,
    }).select("id, status, lastMessageAt").single();
    if (created.error || !created.data) throw new Error(created.error?.message || "Falha ao criar conversa histórica");
    conversation = created.data;
  }

  const providerMessageId = parsed.providerMessageId || stableId(rawPayload, parsed.phone, parsed.body);
  const existing = await supabase.from("Message").select("id").eq("companyId", companyId).eq("conversationId", conversation.id).eq("waMessageId", providerMessageId).limit(1).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return 0;

  const inserted = await supabase.from("Message").insert({
    id: crypto.randomUUID(), companyId, conversationId: conversation.id,
    direction: parsed.direction, type: parsed.type, body: parsed.body,
    mediaUrl: parsed.mediaUrl, waMessageId: providerMessageId,
    replyToMessageId: await resolveReplyToMessageId(supabase, companyId, conversation.id, parsed.replyToProviderMessageId),
    createdAt: occurredAt, updatedAt: occurredAt,
  });
  if (inserted.error) throw new Error(inserted.error.message);

  const currentLast = conversation.lastMessageAt ? new Date(conversation.lastMessageAt).getTime() : 0;
  if (new Date(occurredAt).getTime() > currentLast) {
    await supabase.from("Conversation").update({ lastMessageAt: occurredAt, updatedAt: occurredAt }).eq("id", conversation.id).eq("companyId", companyId);
  }
  return 1;
}

async function resolveReplyToMessageId(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  conversationId: string,
  providerId: string | null,
): Promise<string | null> {
  if (!providerId) return null;
  const normalizedId = providerId.includes(":") ? providerId.split(":").at(-1) || providerId : providerId;
  const result = await supabase
    .from("Message")
    .select("id")
    .eq("companyId", companyId)
    .eq("conversationId", conversationId)
    .eq("waMessageId", normalizedId)
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data?.id || null;
}

function extractRating(body: string | null): number | null {
  const match = /^\s*(10|[1-9])\s*$/.exec(body || "");
  return match ? Number(match[1]) : null;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

type AutomaticMessageMarker = "lastWelcomeSentAt" | "lastAwaySentAt";
type BusinessHour = { day?: string; status?: string; startTime?: string; endTime?: string };

function zonedBusinessParts(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return {
    weekdayIndex: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(part("weekday")),
    minutes: Number(part("hour")) * 60 + Number(part("minute")),
    dateKey: `${part("year")}-${part("month")}-${part("day")}`,
  };
}

function normalizedDay(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function isWithinBusinessHours(now: string, value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 7) return true;
  const hours = value.filter((item): item is BusinessHour => Boolean(item && typeof item === "object"));
  if (hours.length !== 7) return true;

  const current = zonedBusinessParts(now);
  const weekdays = ["domingo", "segunda-feira", "terca-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sabado"];
  const expectedDay = weekdays[current.weekdayIndex];
  const byLabel = hours.find((item) => item.day && normalizedDay(item.day) === expectedDay);
  const hasLabels = hours.some((item) => Boolean(item.day));
  const today = byLabel || (hasLabels ? hours[(current.weekdayIndex + 6) % 7] : hours[current.weekdayIndex]);
  if (!today || today.status === "CLOSED" || !today.startTime || !today.endTime) return false;

  const [startHour, startMinute] = today.startTime.split(":").map(Number);
  const [endHour, endMinute] = today.endTime.split(":").map(Number);
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return false;
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return end <= start
    ? current.minutes >= start || current.minutes < end
    : current.minutes >= start && current.minutes < end;
}

function wasAutomaticMessageSentToday(lastSentAt: string | null | undefined, now: string): boolean {
  if (!lastSentAt) return false;
  return zonedBusinessParts(lastSentAt).dateKey === zonedBusinessParts(now).dateKey;
}

async function claimAutomaticMessage(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  conversationId: string,
  markerField: AutomaticMessageMarker,
  previousMarker: string | null | undefined,
  now: string,
): Promise<boolean> {
  let query = supabase
    .from("Conversation")
    .update({ [markerField]: now, updatedAt: now })
    .eq("id", conversationId)
    .eq("companyId", companyId);
  query = previousMarker ? query.eq(markerField, previousMarker) : query.is(markerField, null);
  const result = await query.select("id");
  if (result.error) throw new Error(result.error.message);
  return result.data?.length === 1;
}

async function rollbackAutomaticMessageClaim(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  conversationId: string,
  markerField: AutomaticMessageMarker,
  previousMarker: string | null | undefined,
  claimedAt: string,
): Promise<void> {
  const result = await supabase
    .from("Conversation")
    .update({ [markerField]: previousMarker || null, updatedAt: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("companyId", companyId)
    .eq(markerField, claimedAt);
  if (result.error) console.error("Falha ao liberar marcador de mensagem automática:", result.error.message);
}

async function sendTextToUazapi(to: string, body: string): Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }> {
  const token = Deno.env.get("UAZAPI_TOKEN")?.trim();
  const baseUrl = (Deno.env.get("UAZAPI_BASE_URL") || "https://free.uazapi.com").replace(/\/$/, "");
  const instance = Deno.env.get("UAZAPI_DEFAULT_SESSION_ID") || "sigma-teste";
  if (!token) return { ok: false, error: "UAZAPI_TOKEN ausente" };
  const response = await fetch(`${baseUrl}/send/text`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, token },
    body: JSON.stringify({ number: normalizePhone(to), text: body, instance }),
  });
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) return { ok: false, error: String(data?.error || data?.detail || `HTTP ${response.status}`) };
  const message = asObject(data?.message);
  return { ok: true, messageId: stringOrNull(message?.id) || stringOrNull(message?.messageid) || stringOrNull(data?.id) || stringOrNull(data?.messageId) };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function providerContactName(value: string | null): string | null {
  if (!value) return null;
  const normalized = normalizeName(value);
  if (!normalized) return null;
  if (normalized.includes("suporte sigma") || normalized.includes("sigma pdv")) return null;
  return value.trim();
}

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizePhone(value: string): string {
  const digits = value.replace("@c.us", "").replace("@s.whatsapp.net", "").replace(/\D/g, "");
  if (!digits.startsWith("55") || digits.length !== 12) return digits;
  const areaCode = Number(digits.slice(2, 4));
  const subscriber = digits.slice(4);
  if (areaCode < 11 || areaCode > 99 || !/^[6-9]/.test(subscriber)) return digits;
  return `${digits.slice(0, 4)}9${subscriber}`;
}

function mapMessageType(type: string): ParsedIncoming["type"] {
  if (type.includes("image")) return "IMAGE";
  if (type.includes("audio") || type.includes("ptt")) return "AUDIO";
  if (type.includes("video")) return "VIDEO";
  if (type.includes("document") || type.includes("file")) return "DOCUMENT";
  return "TEXT";
}

function mediaLabel(type: ParsedIncoming["type"]): string | null {
  if (type === "AUDIO") return "Áudio recebido";
  if (type === "IMAGE") return "Imagem recebida";
  if (type === "VIDEO") return "Vídeo recebido";
  if (type === "DOCUMENT") return "Documento recebido";
  return null;
}

async function resolveConfiguredCompanyId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const configuredCompanyId = Deno.env.get("SIGMA_DEFAULT_COMPANY_ID")?.trim();
  if (!configuredCompanyId) return null;

  const { data, error } = await supabase
    .from("Company")
    .select("id")
    .eq("id", configuredCompanyId)
    .eq("ativo", true)
    .maybeSingle();

  if (error) return null;
  return data?.id === configuredCompanyId ? data.id : null;
}

async function secretsEqual(received: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [receivedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(received)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(receivedHash);
  const right = new Uint8Array(expectedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

function stableId(payload: unknown, phone: string, body: string | null): string {
  const serialized = JSON.stringify({ phone, body, payload });
  let hash = 0;
  for (let i = 0; i < serialized.length; i += 1) {
    hash = ((hash << 5) - hash + serialized.charCodeAt(i)) | 0;
  }
  return `uazapi_${Math.abs(hash)}`;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
    },
  });
}
