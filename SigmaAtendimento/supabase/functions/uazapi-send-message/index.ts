import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type SendMessageRequest = {
  to?: string;
  body?: string;
  conversationId?: string;
  companyId?: string;
  userId?: string;
  sessionId?: string;
  record?: boolean;
  mediaDataUrl?: string;
  mediaType?: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT";
  fileName?: string;
  replyToMessageId?: string;
  editMessageId?: string;
};

type UazapiSendResponse = {
  id?: string;
  messageId?: string;
  messageid?: string;
  status?: string;
  error?: string;
  detail?: string;
  message?: {
    id?: string;
    messageId?: string;
    messageid?: string;
  };
};

const RETRYABLE_UAZAPI_STATUSES = new Set([500, 502, 503, 504]);

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, x-internal-token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true }, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedToken = Deno.env.get("SIGMA_INTERNAL_TOKEN")?.trim() || "";
  const receivedToken = req.headers.get("x-internal-token") || "";

  if (!expectedToken) {
    return json({ error: "Missing SIGMA_INTERNAL_TOKEN" }, 500);
  }

  if (!receivedToken || !(await secretsEqual(receivedToken, expectedToken))) {
    return json({ error: "Invalid internal token" }, 401);
  }

  const uazapiToken = Deno.env.get("UAZAPI_TOKEN");

  if (!uazapiToken) {
    return json({ error: "Missing UAZAPI_TOKEN" }, 500);
  }

  let payload: SendMessageRequest;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON payload" }, 400);
  }

  const body = payload.body?.trim();
  const isMedia = Boolean(payload.mediaDataUrl && payload.mediaType);
  const isEdit = Boolean(payload.editMessageId);
  const to = normalizeRecipient(payload.to || "");

  if (!body && !isMedia) return json({ error: "body or media is required" }, 400);
  if (isEdit && (!body || isMedia)) return json({ error: "message edit requires text body" }, 400);
  if (isMedia && !["IMAGE", "AUDIO", "VIDEO", "DOCUMENT"].includes(payload.mediaType!)) {
    return json({ error: "Unsupported media type" }, 400);
  }
  if (!to && !payload.conversationId) return json({ error: "to or conversationId is required" }, 400);

  if (payload.record === false) {
    if (!to) return json({ error: "to is required when record=false" }, 400);

    const sendResult = isEdit
      ? await editMessageInUazapi({ messageId: payload.editMessageId!, body: body!, token: uazapiToken })
      : isMedia
      ? await sendMediaToUazapi({ to, body: body || "", dataUrl: payload.mediaDataUrl!, type: payload.mediaType!, fileName: payload.fileName, sessionId: payload.sessionId, token: uazapiToken, replyToMessageId: payload.replyToMessageId })
      : await sendTextToUazapi({ to, body: body!, sessionId: payload.sessionId, token: uazapiToken, replyToMessageId: payload.replyToMessageId });
    if (!sendResult.ok) {
      return json({ error: "Falha ao enviar pela UAZAPI", details: sendResult.error }, 502);
    }

    return json({
      ok: true,
      providerMessageId: isEdit
        ? extractOptionalMessageId(sendResult.data) || providerMessageId(payload.editMessageId!)
        : extractMessageId(sendResult.data),
      recorded: false,
    }, 200);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const now = new Date().toISOString();
  const configuredCompanyId = await resolveConfiguredCompanyId(supabase);
  if (!configuredCompanyId) {
    return json({ error: "SIGMA_DEFAULT_COMPANY_ID ausente ou aponta para uma empresa inativa" }, 503);
  }
  if (payload.companyId && payload.companyId !== configuredCompanyId) {
    return json({ error: "companyId não corresponde à empresa configurada" }, 403);
  }

  const conversation = payload.conversationId
    ? await findConversation(supabase, payload.conversationId)
    : null;
  if (payload.conversationId && !conversation) {
    return json({ error: "Atendimento não encontrado" }, 404);
  }
  if (conversation?.companyId !== undefined && conversation.companyId !== configuredCompanyId) {
    return json({ error: "Atendimento pertence a outra empresa" }, 403);
  }
  const companyId = configuredCompanyId;

  if (payload.userId && !(await userBelongsToCompany(supabase, payload.userId, companyId))) {
    return json({ error: "Usuário não pertence à empresa configurada" }, 403);
  }

  const conversationPhone = normalizePhone(conversation?.Contact?.phone || "");
  if (conversation && to && to !== conversationPhone) {
    return json({ error: "Destinatário não corresponde ao contato do atendimento" }, 409);
  }
  const toPhone = to || conversationPhone;
  if (!toPhone) return json({ error: "Telefone do destinatário não encontrado" }, 400);

  const messageId = crypto.randomUUID();
  const outboxId = crypto.randomUUID();

  if (conversation?.id) {
    const { error: messageError } = await supabase
      .from("Message")
      .insert({
        id: messageId,
        companyId,
        conversationId: conversation.id,
        direction: "OUTBOUND",
        type: "TEXT",
        body,
        userId: payload.userId || null,
        createdAt: now,
        updatedAt: now,
      });

    if (messageError) {
      return json({ error: "Falha ao registrar mensagem", details: messageError.message }, 500);
    }
  }

  const { error: outboxError } = await supabase
    .from("WhatsAppOutbox")
    .insert({
      id: outboxId,
      companyId,
      conversationId: conversation?.id || payload.conversationId || null,
      messageId: conversation?.id ? messageId : null,
      provider: "UAZAPI",
      toPhone,
      payload: { kind: "text", body },
      status: "PENDING",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });

  if (outboxError) {
    return json({ error: "Falha ao registrar outbox", details: outboxError.message }, 500);
  }

  const sendResult = await sendTextToUazapi({ to: toPhone, body, sessionId: payload.sessionId, token: uazapiToken });

  if (!sendResult.ok) {
    await supabase
      .from("WhatsAppOutbox")
      .update({
        status: "FAILED",
        attempts: 1,
        lastError: sendResult.error,
        updatedAt: new Date().toISOString(),
      })
      .eq("id", outboxId);

    return json({ error: "Falha ao enviar pela UAZAPI", details: sendResult.error, outboxId }, 502);
  }

  const providerMessageId = extractMessageId(sendResult.data);
  const sentAt = new Date().toISOString();

  await supabase
    .from("WhatsAppOutbox")
    .update({
      status: "SENT",
      attempts: 1,
      lastError: null,
      providerMessageId,
      updatedAt: sentAt,
    })
    .eq("id", outboxId);

  if (conversation?.id) {
    await supabase
      .from("Message")
      .update({ waMessageId: providerMessageId, updatedAt: sentAt })
      .eq("id", messageId)
      .eq("companyId", companyId);

    await supabase
      .from("Conversation")
      .update({ lastMessageAt: sentAt, updatedAt: sentAt })
      .eq("id", conversation.id)
      .eq("companyId", companyId);
  }

  return json({
    ok: true,
    companyId,
    conversationId: conversation?.id || null,
    messageId: conversation?.id ? messageId : null,
    outboxId,
    providerMessageId,
  }, 200);
});

async function sendTextToUazapi(params: {
  to: string;
  body: string;
  sessionId?: string;
  token: string;
  replyToMessageId?: string;
}): Promise<{ ok: true; data: UazapiSendResponse | null } | { ok: false; error: string }> {
  const baseUrl = (Deno.env.get("UAZAPI_BASE_URL") || "https://free.uazapi.com").replace(/\/$/, "");
  const path = Deno.env.get("UAZAPI_SEND_TEXT_PATH") || "/send/text";
  const instance = params.sessionId || Deno.env.get("UAZAPI_DEFAULT_SESSION_ID") || "sigma-teste";

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.token}`,
      token: params.token,
    },
    body: JSON.stringify({
      to: params.to,
      phone: params.to,
      number: params.to,
      text: params.body,
      body: params.body,
      message: params.body,
      instance,
      ...(params.replyToMessageId ? { replyid: providerMessageId(params.replyToMessageId) } : {}),
    }),
  });

  const data = await readJson<UazapiSendResponse>(response);

  if (!response.ok) {
    return {
      ok: false,
      error: data?.error || data?.detail || data?.status || `HTTP ${response.status}`,
    };
  }

  return { ok: true, data };
}

async function editMessageInUazapi(params: {
  messageId: string;
  body: string;
  token: string;
}): Promise<{ ok: true; data: UazapiSendResponse | null } | { ok: false; error: string }> {
  const baseUrl = (Deno.env.get("UAZAPI_BASE_URL") || "https://free.uazapi.com").replace(/\/$/, "");
  const request: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.token}`,
      token: params.token,
    },
    body: JSON.stringify({
      id: providerMessageId(params.messageId),
      text: params.body,
    }),
  };

  let lastFailure = "Falha de conexão com a UAZAPI";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/message/edit`, request);
      const data = await readJson<UazapiSendResponse>(response);
      if (response.ok) return { ok: true, data };

      lastFailure = uazapiError(data, response.status);
      if (!RETRYABLE_UAZAPI_STATUSES.has(response.status) || attempt === 2) {
        return { ok: false, error: lastFailure };
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      if (attempt === 2) return { ok: false, error: lastFailure };
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return { ok: false, error: lastFailure };
}

async function findConversation(supabase: ReturnType<typeof createClient>, conversationId: string) {
  const { data, error } = await supabase
    .from("Conversation")
    .select("id, companyId, Contact:Contact(phone)")
    .eq("id", conversationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as { id: string; companyId?: string; Contact?: { phone?: string } } | null;
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

async function userBelongsToCompany(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  companyId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("User")
    .select("id")
    .eq("id", userId)
    .eq("company_id", companyId)
    .eq("ativo", true)
    .maybeSingle();
  return !error && data?.id === userId;
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

function extractMessageId(data: UazapiSendResponse | null): string {
  return (
    extractOptionalMessageId(data) ||
    `uazapi_text_${Date.now()}`
  );
}

function extractOptionalMessageId(data: UazapiSendResponse | null): string | null {
  return (
    data?.message?.messageid ||
    data?.messageid ||
    data?.message?.id ||
    data?.message?.messageId ||
    data?.messageId ||
    data?.id ||
    null
  );
}

function uazapiError(data: UazapiSendResponse | null, status: number): string {
  return data?.error || data?.detail || data?.status || `HTTP ${status}`;
}

function normalizePhone(value: string): string {
  return value.replace("@c.us", "").replace("@s.whatsapp.net", "").replace(/\D/g, "");
}

function normalizeRecipient(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("@g.us")) return normalizeGroupId(trimmed);
  return normalizePhone(trimmed);
}

function normalizeGroupId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("@g.us")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `${digits}@g.us` : "";
}

function providerMessageId(value: string): string {
  return value.includes(":") ? value.split(":").at(-1) || value : value;
}

async function sendMediaToUazapi(params: { to: string; body: string; dataUrl: string; type: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT"; fileName?: string; sessionId?: string; token: string; replyToMessageId?: string }): Promise<{ ok: true; data: UazapiSendResponse | null } | { ok: false; error: string }> {
  const baseUrl = (Deno.env.get("UAZAPI_BASE_URL") || "https://free.uazapi.com").replace(/\/$/, "");
  const instance = params.sessionId || Deno.env.get("UAZAPI_DEFAULT_SESSION_ID") || "sigma-teste";
  const type = params.type === "IMAGE" ? "image" : params.type === "AUDIO" ? "audio" : params.type === "VIDEO" ? "video" : "document";
  const response = await fetch(`${baseUrl}/send/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.token}`, token: params.token },
    body: JSON.stringify({ number: params.to, type, file: params.dataUrl, text: params.body, docName: params.fileName || undefined, instance, ...(params.replyToMessageId ? { replyid: providerMessageId(params.replyToMessageId) } : {}) }),
  });
  const data = await readJson<UazapiSendResponse>(response);
  return response.ok ? { ok: true, data } : { ok: false, error: data?.error || data?.detail || data?.status || `HTTP ${response.status}` };
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
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
