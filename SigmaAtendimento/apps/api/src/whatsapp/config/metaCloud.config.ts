export const metaCloudConfig = {
    accessToken: process.env.META_WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: process.env.META_WHATSAPP_VERIFY_TOKEN || 'sigma_verify_token_123',
    baseUrl: process.env.META_WHATSAPP_API_BASE_URL || 'https://graph.facebook.com/v20.0',
    timeout: 10000,
};
