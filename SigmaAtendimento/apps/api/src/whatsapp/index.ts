import { IWhatsAppProvider } from "./IWhatsAppProvider";
import { EvolutionWhatsAppProvider } from "./providers/EvolutionWhatsAppProvider";
import { MetaCloudWhatsAppProvider } from "./providers/MetaCloudWhatsAppProvider";
import { MockWhatsAppProvider } from "./providers/MockWhatsAppProvider";
import { MuriloWhatsAppApiProvider } from "./providers/MuriloWhatsAppApiProvider";

let providerInstance: IWhatsAppProvider | null = null;

export function getWhatsAppProvider(): IWhatsAppProvider {
    if (!providerInstance) {
        const providerType = process.env.WHATSAPP_PROVIDER || "mock";

        if (providerType === "meta-cloud") {
            console.log("[SIGMA] Using MetaCloudWhatsAppProvider as WhatsApp Provider");
            providerInstance = new MetaCloudWhatsAppProvider();
        } else if (providerType === "murilo-api") {
            console.log("[SIGMA] Using MuriloWhatsAppApiProvider as WhatsApp Provider");
            providerInstance = new MuriloWhatsAppApiProvider();
        } else if (providerType === "evolution") {
            console.log("[SIGMA] Using EvolutionWhatsAppProvider as WhatsApp Provider");
            providerInstance = new EvolutionWhatsAppProvider();
        } else {
            console.log("[SIGMA] Using MockWhatsAppProvider as default WhatsApp Provider");
            providerInstance = new MockWhatsAppProvider();
        }
    }
    return providerInstance as IWhatsAppProvider;
}
