import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ingestWhatsappMessage } from "@/lib/whatsapp-ingest";

const messageSchema = z.object({
  contactName: z.string().trim().min(1),
  contactNumber: z.string().trim().min(6),
  direction: z.enum(["in", "out"]),
  body: z.string().trim().min(1),
  timestamp: z.string().trim().min(1),
  waMessageId: z.string().trim().optional(),
  linkedAttendanceId: z.coerce.number().int().positive().optional()
});

function unauthorized() {
  return NextResponse.json({ ok: false, message: "Nao autorizado." }, { status: 401 });
}

function getWebhookSecret() {
  return process.env.WHATSAPP_WEBHOOK_SECRET?.trim();
}

function isAuthorized(request: NextRequest) {
  const secret = getWebhookSecret();
  const received = request.headers.get("x-webhook-secret")?.trim();
  return Boolean(secret && received && received === secret);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const body = await request.json().catch(() => null);
  const parsed = messageSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        message: "Payload invalido.",
        issues: parsed.error.flatten().fieldErrors
      },
      { status: 400 }
    );
  }

  const result = await ingestWhatsappMessage(parsed.data);

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    conversationId: result.conversationId
  });
}
