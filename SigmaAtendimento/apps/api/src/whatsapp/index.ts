import { IWhatsAppProvider } from "./IWhatsAppProvider";
import { EvolutionWhatsAppProvider } from "./providers/EvolutionWhatsAppProvider";
import { MetaCloudWhatsAppProvider } from "./providers/MetaCloudWhatsAppProvider";
import { MockWhatsAppProvider } from "./providers/MockWhatsAppProvider";
import { MuriloWhatsAppApiProvider } from "./providers/MuriloWhatsAppApiProvider";
import { UazApiWhatsAppProvider } from "./providers/UazApiWhatsAppProvider";

let providerInstance: IWhatsAppProvider | null = null;

export function getWhatsAppProvider(): IWhatsAppProvider {
    if (!providerInstance) {
        const configuredProvider = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase();
        if (!configuredProvider && process.env.NODE_ENV === 'production') {
            throw new Error('WHATSAPP_PROVIDER é obrigatório em produção.');
        }
        const providerType = configuredProvider || "mock";

        if (providerType === 'mock' && process.env.NODE_ENV === 'production') {
            throw new Error('WHATSAPP_PROVIDER=mock não é permitido em produção.');
        }
        if (providerType === 'evolution' && !process.env.EVOLUTION_WEBHOOK_TOKEN) {
            throw new Error('EVOLUTION_WEBHOOK_TOKEN é obrigatório com WHATSAPP_PROVIDER=evolution.');
        }
        if (providerType === 'uazapi' && !process.env.UAZAPI_WEBHOOK_SECRET) {
            throw new Error('UAZAPI_WEBHOOK_SECRET é obrigatório com WHATSAPP_PROVIDER=uazapi.');
        }
        if (providerType === 'meta-cloud' && !process.env.META_APP_SECRET) {
            throw new Error('META_APP_SECRET é obrigatório com WHATSAPP_PROVIDER=meta-cloud.');
        }

        if (providerType === "meta-cloud") {
            console.log("[SIGMA] Using MetaCloudWhatsAppProvider as WhatsApp Provider");
            providerInstance = new MetaCloudWhatsAppProvider();
        } else if (providerType === "murilo-api") {
            console.log("[SIGMA] Using MuriloWhatsAppApiProvider as WhatsApp Provider");
            providerInstance = new MuriloWhatsAppApiProvider();
        } else if (providerType === "evolution") {
            console.log("[SIGMA] Using EvolutionWhatsAppProvider as WhatsApp Provider");
            providerInstance = new EvolutionWhatsAppProvider();
        } else if (providerType === "uazapi") {
            console.log("[SIGMA] Using UazApiWhatsAppProvider as WhatsApp Provider");
            providerInstance = new UazApiWhatsAppProvider();
        } else if (providerType === 'mock') {
            console.log("[SIGMA] Using MockWhatsAppProvider as WhatsApp Provider");
            providerInstance = new MockWhatsAppProvider();
        } else {
            throw new Error(`WHATSAPP_PROVIDER não suportado: ${providerType}`);
        }
    }
    return providerInstance as IWhatsAppProvider;
}
