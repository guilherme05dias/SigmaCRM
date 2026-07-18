import crypto from 'crypto';

/** Valida o header X-Hub-Signature-256 enviado pela Meta. */
export function verifyMetaSignature(rawBody: Buffer, signatureHeader?: string): boolean {
  const appSecret = process.env.META_APP_SECRET;
  // Webhook real sempre falha fechado quando o segredo não está configurado.
  if (!appSecret) {
    console.error('[SIGMA] META_APP_SECRET não configurado — webhook rejeitado.');
    return false;
  }
  if (!signatureHeader) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
