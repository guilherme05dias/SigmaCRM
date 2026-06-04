import { NextResponse } from "next/server";

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const hasSupabasePublishableKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const hasWebhookSecret = Boolean(process.env.WHATSAPP_WEBHOOK_SECRET?.trim());
  const hasMetaVerifyToken = Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN?.trim());
  const hasMetaAppSecret = Boolean(process.env.META_APP_SECRET?.trim());
  const hasMetaPhoneNumberId = Boolean(process.env.META_PHONE_NUMBER_ID?.trim());
  const hasMetaWabaId = Boolean(process.env.META_WABA_ID?.trim());

  return NextResponse.json({
    ok: hasSupabaseUrl && hasSupabasePublishableKey && hasServiceRoleKey && hasMetaVerifyToken,
    checks: {
      appUrl: Boolean(appUrl),
      supabaseUrl: hasSupabaseUrl,
      supabasePublishableKey: hasSupabasePublishableKey,
      supabaseServiceRoleKey: hasServiceRoleKey,
      whatsappWebhookSecret: hasWebhookSecret,
      metaWebhookVerifyToken: hasMetaVerifyToken,
      metaAppSecret: hasMetaAppSecret,
      metaPhoneNumberId: hasMetaPhoneNumberId,
      metaWabaId: hasMetaWabaId
    },
    endpoints: {
      metaWebhook: appUrl ? `${appUrl.replace(/\/$/, "")}/api/whatsapp/meta-webhook` : "/api/whatsapp/meta-webhook",
      genericIngest: "/api/whatsapp/messages"
    }
  });
}
