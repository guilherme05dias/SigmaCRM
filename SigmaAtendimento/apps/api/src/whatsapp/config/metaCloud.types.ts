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
            messages?: Array<{
                from: string;
                id: string;
                timestamp: string;
                type: string;
                text?: { body: string };
            }>;
            statuses?: Array<any>;
        };
        field: "messages";
    }>;
}

export interface MetaCloudWebhookPayload {
    object: "whatsapp_business_account" | string;
    entry: MetaCloudWebhookEntry[];
}
