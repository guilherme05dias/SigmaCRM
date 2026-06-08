import crypto from 'crypto';

/** Valida o header X-Hub-Signature-256 enviado pela Meta. */
export function verifyMetaSignature(rawBody: Buffer, signatureHeader?: string): boolean {
  const appSecret = process.env.META_APP_SECRET;
  // Sem secret configurado → não bloqueia (dev/mock). Logue um aviso.
  if (!appSecret) {
    console.warn('[SIGMA] META_APP_SECRET não configurado — assinatura do webhook NÃO validada.');
    return true;
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
