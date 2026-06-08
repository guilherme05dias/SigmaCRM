export interface MetaCloudTextMessagePayload {
    messaging_product: "whatsapp";
    recipient_type: "individual";
    to: string;
    type: "text";
    text: {
        preview_url?: boolean;
        body: string;
    };
}

export type MetaCloudMessageType =
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "sticker"
    | "location"
    | "contacts"
    | "interactive"
    | "button"
    | "order"
    | "system"
    | "unknown"
    | "unsupported";

export interface MetaCloudMediaObject {
    id?: string;
    link?: string;
    caption?: string;
    filename?: string;
    mime_type?: string;
    sha256?: string;
}

export interface MetaCloudIncomingMessage {
    from: string;
    id: string;
    timestamp: string;
    type: MetaCloudMessageType;
    text?: { body: string };
    image?: MetaCloudMediaObject;
    audio?: MetaCloudMediaObject;
    video?: MetaCloudMediaObject;
    document?: MetaCloudMediaObject;
    sticker?: MetaCloudMediaObject;
    location?: {
        latitude: number;
        longitude: number;
        name?: string;
        address?: string;
    };
    context?: {
        forwarded?: boolean;
        from?: string;
        id?: string;
    };
}

export interface MetaMediaInfoResponse {
    id: string;
    url: string;
    mime_type: string;
    sha256: string;
    file_size: number;
    messaging_product: "whatsapp";
}

export interface MetaCloudWebhookEntry {
    id: string;
    changes: Array<{
        value: {
            messaging_product: "whatsapp";
            metadata: {
                display_phone_number: string;
                phone_number_id: string;
            };
            contacts?: Array<{
                profile: { name: string };
                wa_id: string;
            }>;
            messages?: MetaCloudIncomingMessage[];
            statuses?: Array<{
                id: string;
                status: "sent" | "delivered" | "read" | "failed";
                timestamp: string;
                recipient_id: string;
            }>;
        };
        field: "messages";
    }>;
}

export interface MetaCloudWebhookPayload {
    object: "whatsapp_business_account" | string;
    entry: MetaCloudWebhookEntry[];
}

export interface MetaSendMessageResponse {
    messaging_product: "whatsapp";
    contacts: Array<{ input: string; wa_id: string }>;
    messages: Array<{ id: string; message_status?: string }>;
}
