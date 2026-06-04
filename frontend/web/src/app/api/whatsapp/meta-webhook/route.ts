import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ingestWhatsappMessage } from "@/lib/whatsapp-ingest";

type MetaTextMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
};

type MetaContact = {
  wa_id?: string;
  profile?: { name?: string };
};

type MetaWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: MetaContact[];
        messages?: MetaTextMessage[];
      };
    }>;
  }>;
};

function getVerifyToken() {
  return process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || process.env.WHATSAPP_WEBHOOK_SECRET?.trim();
}

function getAppSecret() {
  return process.env.META_APP_SECRET?.trim();
}

function toIsoTimestamp(value: string | undefined) {
  if (!value) return new Date().toISOString();

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function getMessageBody(message: MetaTextMessage) {
  if (message.type === "text") return message.text?.body ?? "";
  if (message.type === "button") return message.button?.text ?? "";
  if (message.type === "interactive") {
    return message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? "";
  }

  return message.type ? `[Mensagem ${message.type}]` : "";
}

function findContactName(contacts: MetaContact[] | undefined, contactNumber: string) {
  const contact = contacts?.find((item) => item.wa_id === contactNumber) ?? contacts?.[0];
  return contact?.profile?.name ?? contactNumber;
}

function isValidSignature(rawBody: string, signatureHeader: string | null) {
  const appSecret = getAppSecret();
  if (!appSecret) return true;
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signatureHeader);

  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === getVerifyToken() && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" }
    });
  }

  return NextResponse.json({ ok: false, message: "Webhook nao verificado." }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!isValidSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ ok: false, message: "Assinatura invalida." }, { status: 401 });
  }

  const payload = JSON.parse(rawBody || "{}") as MetaWebhookPayload;
  const messagesToStore = payload.entry?.flatMap((entry) =>
    entry.changes?.flatMap((change) => {
      const contacts = change.value?.contacts;
      return (
        change.value?.messages?.map((message) => {
          const contactNumber = message.from ?? "";
          return {
            contactName: findContactName(contacts, contactNumber),
            contactNumber,
            direction: "in" as const,
            body: getMessageBody(message),
            timestamp: toIsoTimestamp(message.timestamp),
            waMessageId: message.id
          };
        }) ?? []
      );
    }) ?? []
  ) ?? [];

  const validMessages = messagesToStore.filter((message) => message.contactNumber && message.body);

  for (const message of validMessages) {
    const result = await ingestWhatsappMessage(message);

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
    }
  }

  return NextResponse.json({
    ok: true,
    stored: validMessages.length
  });
}
