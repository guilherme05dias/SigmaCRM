import "server-only";

import { createSupabaseAdminClient } from "./supabase";

export type WhatsappIngestInput = {
  contactName: string;
  contactNumber: string;
  direction: "in" | "out";
  body: string;
  timestamp: string;
  waMessageId?: string;
  linkedAttendanceId?: number;
};

export async function ingestWhatsappMessage(input: WhatsappIngestInput) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false as const,
      status: 500,
      message: "SUPABASE_SERVICE_ROLE_KEY nao configurada no servidor."
    };
  }

  const now = new Date().toISOString();
  const existingConversation = await supabase
    .from("whatsapp_conversations")
    .select("id,message_count,our_message_count,linked_attendance_id,first_message_at")
    .eq("contact_number", input.contactNumber)
    .maybeSingle();

  if (existingConversation.error) {
    return {
      ok: false as const,
      status: 500,
      message: `Nao foi possivel consultar a conversa. Detalhes: ${existingConversation.error.message}`
    };
  }

  const conversationData = {
    contact_name: input.contactName,
    contact_number: input.contactNumber,
    first_message_at: existingConversation.data?.first_message_at ?? input.timestamp,
    last_message_at: input.timestamp,
    message_count: Number(existingConversation.data?.message_count ?? 0) + 1,
    our_message_count: Number(existingConversation.data?.our_message_count ?? 0) + (input.direction === "out" ? 1 : 0),
    status: "aberto",
    linked_attendance_id: input.linkedAttendanceId ?? existingConversation.data?.linked_attendance_id ?? null,
    updated_at: now
  };

  const conversationResponse = existingConversation.data
    ? await supabase
        .from("whatsapp_conversations")
        .update(conversationData)
        .eq("id", existingConversation.data.id)
        .select("id")
        .single()
    : await supabase
        .from("whatsapp_conversations")
        .insert({
          ...conversationData,
          created_at: now
        })
        .select("id")
        .single();

  if (conversationResponse.error || !conversationResponse.data) {
    return {
      ok: false as const,
      status: 500,
      message: `Nao foi possivel gravar a conversa. Detalhes: ${conversationResponse.error?.message ?? "sem retorno"}`
    };
  }

  const messageResponse = await supabase.from("whatsapp_messages").insert({
    conversation_id: conversationResponse.data.id,
    contact_number: input.contactNumber,
    direction: input.direction,
    body: input.body,
    timestamp: input.timestamp,
    wa_message_id: input.waMessageId ?? null
  });

  if (messageResponse.error) {
    return {
      ok: false as const,
      status: 500,
      message: `Nao foi possivel gravar a mensagem. Detalhes: ${messageResponse.error.message}`
    };
  }

  return {
    ok: true as const,
    conversationId: Number(conversationResponse.data.id)
  };
}
