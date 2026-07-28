import {
    IWhatsAppProvider,
    ParsedIncomingPayload,
    SessionSummary,
    WhatsAppContactCheck,
    WhatsAppGroup,
    WhatsAppHistoryChat,
    WhatsAppHistorySyncOptions,
    WhatsAppUnreadChat,
} from "../IWhatsAppProvider";

type UazApiSendResponse = {
    id?: string;
    messageId?: string;
    messageid?: string;
    message?: {
        id?: string;
        messageid?: string;
    };
    error?: string;
    detail?: string;
    status?: string;
};

type SupabaseEdgeSendResponse = {
    ok?: boolean;
    providerMessageId?: string;
    error?: string;
    details?: string;
    code?: string;
    message?: string;
};

export class UazApiWhatsAppProvider implements IWhatsAppProvider {
    private readonly baseUrl = (process.env.UAZAPI_BASE_URL || "https://free.uazapi.com").replace(/\/$/, "");
    private readonly token = process.env.UAZAPI_TOKEN || "";
    private readonly defaultSessionId = process.env.UAZAPI_DEFAULT_SESSION_ID || "sigma-teste";
    private readonly sendTextPath = process.env.UAZAPI_SEND_TEXT_PATH || "/send/text";
    private readonly sendViaSupabaseEdge = process.env.UAZAPI_SEND_VIA_SUPABASE_EDGE === "true";
    private readonly supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
    private readonly internalToken = process.env.SIGMA_INTERNAL_TOKEN || "";

    async createSession(_sessionId: string): Promise<void> {
        if (this.sendViaSupabaseEdge) {
            await this.edgeJson({ instanceAction: "connect" });
            return;
        }
        if (!this.token) throw new Error("UAZAPI_TOKEN não configurado.");
        await this.postJson("/instance/connect", {});
    }

    async disconnectSession(_sessionId: string): Promise<void> {
        if (this.sendViaSupabaseEdge) {
            await this.edgeJson({ instanceAction: "disconnect" });
            return;
        }
        if (!this.token) throw new Error("UAZAPI_TOKEN não configurado.");
        await this.postJson("/instance/disconnect", {});
    }

    async listSessions(): Promise<SessionSummary[]> {
        if (this.sendViaSupabaseEdge) {
            const result = await this.edgeJson<{ instance?: Record<string, unknown>; status?: Record<string, unknown> }>({ instanceAction: "status" });
            const instance = this.asObject(result.instance);
            const status = this.asObject(result.status);
            return [{
                name: this.stringOrNull(instance?.name) || this.defaultSessionId,
                status: this.stringOrNull(instance?.status) || (status?.connected === true ? "connected" : "disconnected"),
            }];
        }
        if (!this.token) return [{ name: this.defaultSessionId, status: "MISSING_UAZAPI_TOKEN" }];
        const payload = this.asObject(await this.getJson("/instance/status"));
        const instance = this.asObject(payload?.instance);
        const status = this.asObject(payload?.status);
        return [
            {
                name: this.stringOrNull(instance?.name) || this.defaultSessionId,
                status: this.stringOrNull(instance?.status) || (status?.connected === true ? "connected" : "disconnected"),
            },
        ];
    }

    async getQrCode(): Promise<string | null> {
        const payload = this.sendViaSupabaseEdge
            ? await this.edgeJson<{ instance?: Record<string, unknown> }>({ instanceAction: "status" })
            : this.asObject(await this.getJson("/instance/status"));
        const instance = this.asObject(payload?.instance);
        const qrCode = this.stringOrNull(instance?.qrcode);
        if (!qrCode) return null;
        return qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`;
    }

    async checkContact(phone: string): Promise<WhatsAppContactCheck> {
        const normalizedPhone = this.normalizePhone(phone);
        if (!normalizedPhone) return { exists: false, phone: normalizedPhone, name: null, wid: null };
        if (this.sendViaSupabaseEdge) {
            if (!this.supabaseUrl || !this.internalToken) throw new Error("Integração UAZAPI via Supabase não configurada.");
            const response = await fetch(`${this.supabaseUrl}/functions/v1/uazapi-history`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-internal-token": this.internalToken },
                body: JSON.stringify({ checkPhone: normalizedPhone }),
            });
            const result = await this.readJson<{ ok?: boolean; contact?: WhatsAppContactCheck; error?: string; details?: string }>(response);
            if (!response.ok || !result?.ok || !result.contact) throw new Error(result?.details || result?.error || `Falha ao validar contato (${response.status})`);
            return result.contact;
        }
        if (!this.token) throw new Error("UAZAPI_TOKEN não configurado.");
        const result = this.collectionItems(await this.postJson("/chat/check", { numbers: [normalizedPhone] }));
        const checked = this.asObject(result[0]);
        return {
            exists: checked?.isInWhatsapp === true,
            phone: normalizedPhone,
            name: this.stringOrNull(checked?.verifiedName),
            wid: this.stringOrNull(checked?.jid) || `${normalizedPhone}@s.whatsapp.net`,
        };
    }

    async syncHistory(options: WhatsAppHistorySyncOptions = {}): Promise<WhatsAppHistoryChat[]> {
        if (this.sendViaSupabaseEdge) return this.syncHistoryViaSupabaseEdge(options);
        // A primeira fase usa webhook em tempo real. Histórico da UAZAPI pode ser ligado depois,
        // quando o endpoint oficial estiver validado.
        if (!this.token) throw new Error("UAZAPI_TOKEN não configurado.");

        const chatLimit = Math.max(1, Math.min(options.chatLimit || 500, 500));
        const messageLimit = Math.max(1, Math.min(options.messageLimit || 1000, 1000));
        let payload: unknown = null;
        if (options.phone) {
            for (const candidate of this.phoneAliases(options.phone)) {
                payload = await this.postJson("/chat/find", {
                    limit: 1,
                    offset: 0,
                    wa_isGroup: false,
                    wa_chatid: candidate,
                });
                if (this.collectionItems(payload).length > 0) break;
            }
        } else {
            payload = await this.postJson("/chat/find", {
                limit: chatLimit,
                offset: 0,
                sort: "-wa_lastMsgTimestamp",
                wa_isGroup: false,
            });
        }
        const result: WhatsAppHistoryChat[] = [];

        for (const source of this.collectionItems(payload)) {
            const chat = this.asObject(source);
            if (!chat || this.isGroupChat(chat)) continue;
            const chatId = this.stringOrNull(chat.wa_chatid ?? chat.chatid ?? chat.chatId ?? chat.remoteJid ?? chat.id ?? chat.phone ?? chat.number);
            const phone = this.normalizePhone(chatId || "");
            if (phone.length < 10) continue;

            let messages: WhatsAppHistoryChat["messages"] = [];
            try {
                messages = await this.fetchChatMessages(chatId || phone, phone, messageLimit);
            } catch (error) {
                console.warn(`[UAZAPI] Não foi possível importar mensagens de ${phone}:`, error);
            }

            let avatarUrl = this.extractAvatarUrl(chat);
            if (!avatarUrl) {
                try {
                    avatarUrl = await this.getProfilePictureUrl({ phone, sessionId: options.sessionId });
                } catch (error) {
                    console.warn(`[UAZAPI] Não foi possível obter foto de ${phone}:`, error);
                }
            }

            result.push({
                phone,
                name: this.stringOrNull(chat.name ?? chat.wa_contactName ?? chat.wa_name ?? chat.pushName ?? chat.notifyName),
                avatarUrl,
                unreadCount: this.numberOrNull(chat.wa_unreadCount ?? chat.unreadCount) || 0,
                lastMessageAt: this.numberOrNull(chat.wa_lastMsgTimestamp ?? chat.lastMessageAt ?? chat.timestamp),
                messages,
            });
        }

        return result;
    }

    async getProfilePictureUrl(params: { phone: string; sessionId?: string }): Promise<string | null> {
        if (this.sendViaSupabaseEdge) {
            const result = await this.edgeJson<{ avatarUrl?: string | null }>({ profilePhone: this.normalizePhone(params.phone) });
            return result.avatarUrl || null;
        }
        if (!this.token) throw new Error("UAZAPI_TOKEN não configurado.");
        const number = this.normalizePhone(params.phone);
        if (!number) return null;

        const payload = await this.postJson("/chat/details", { number, preview: true });
        return this.extractAvatarUrl(payload);
    }

    async listChatUnreadCounts(): Promise<WhatsAppUnreadChat[]> {
        let chats: WhatsAppUnreadChat[];
        if (this.sendViaSupabaseEdge) {
            const payload = await this.edgeJson<{ chats?: WhatsAppUnreadChat[] }>({ summaryOnly: true, chatLimit: 500 });
            chats = Array.isArray(payload.chats) ? payload.chats : [];
        } else {
            chats = this.collectionItems(await this.postJson("/chat/find", {
                limit: 500,
                offset: 0,
                sort: "-wa_lastMsgTimestamp",
                wa_isGroup: false,
            })).map<WhatsAppUnreadChat | null>((source) => {
                const chat = this.asObject(source);
                if (!chat || this.isGroupChat(chat)) return null;
                const chatId = this.stringOrNull(chat.wa_chatid ?? chat.chatid ?? chat.chatId ?? chat.remoteJid ?? chat.id ?? chat.phone ?? chat.number);
                const phone = this.normalizePhone(chatId || "");
                if (phone.length < 10) return null;
                return {
                    phone,
                    unreadCount: Math.max(0, this.numberOrNull(chat.wa_unreadCount ?? chat.unreadCount) || 0),
                    name: this.stringOrNull(chat.name ?? chat.wa_contactName ?? chat.wa_name ?? chat.pushName ?? chat.notifyName),
                    lastMessageAt: this.numberOrNull(chat.wa_lastMsgTimestamp ?? chat.lastMessageAt ?? chat.timestamp),
                };
            }).filter((chat): chat is WhatsAppUnreadChat => chat !== null);
        }

        return chats
            .map((chat) => ({
                phone: this.normalizePhone(String(chat.phone || "")),
                unreadCount: Math.max(0, Number(chat.unreadCount) || 0),
                name: this.stringOrNull(chat.name),
                lastMessageAt: this.numberOrNull(chat.lastMessageAt),
            }))
            .filter((chat) => chat.phone.length >= 10);
    }

    async listGroups(options: { limit?: number; sessionId?: string } = {}): Promise<WhatsAppGroup[]> {
        const limit = Math.max(1, Math.min(options.limit || 500, 500));
        if (this.sendViaSupabaseEdge) {
            const result = await this.edgeJson<{ groups?: WhatsAppGroup[] }>({ listGroups: true, groupLimit: limit });
            return Array.isArray(result.groups) ? result.groups.map((group) => ({
                id: this.normalizeGroupId(String(group.id || "")),
                name: this.stringOrNull(group.name) || this.normalizeGroupId(String(group.id || "")),
                participantCount: this.numberOrNull(group.participantCount),
                unreadCount: Math.max(0, Number(group.unreadCount) || 0),
                lastMessageAt: this.numberOrNull(group.lastMessageAt),
            })).filter((group) => group.id.endsWith("@g.us")) : [];
        }
        if (!this.token) throw new Error("UAZAPI_TOKEN nÃ£o configurado.");
        const payload = await this.postJson("/chat/find", {
            limit,
            offset: 0,
            sort: "-wa_lastMsgTimestamp",
            wa_isGroup: true,
        });
        return this.collectionItems(payload).flatMap((source) => {
            const group = this.asObject(source);
            if (!group) return [];
            const id = this.normalizeGroupId(this.stringOrNull(group.wa_chatid ?? group.chatid ?? group.chatId ?? group.remoteJid ?? group.id ?? group.phone ?? group.number) || "");
            if (!id) return [];
            return [{
                id,
                name: this.stringOrNull(group.name ?? group.wa_contactName ?? group.wa_name ?? group.subject ?? group.pushName ?? group.notifyName) || id,
                participantCount: this.numberOrNull(group.participantCount ?? group.participantsCount ?? group.wa_participantCount),
                unreadCount: Math.max(0, this.numberOrNull(group.wa_unreadCount ?? group.unreadCount) || 0),
                lastMessageAt: this.numberOrNull(group.wa_lastMsgTimestamp ?? group.lastMessageAt ?? group.timestamp),
            }];
        });
    }

    async requestHistorySync(params: { phone: string; messageId?: string; count?: number }): Promise<void> {
        if (this.sendViaSupabaseEdge) {
            if (!this.supabaseUrl || !this.internalToken) throw new Error("Integração de histórico via Supabase não configurada.");
            const response = await fetch(`${this.supabaseUrl}/functions/v1/uazapi-history`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-internal-token": this.internalToken },
                body: JSON.stringify({ requestOnly: true, ...params }),
            });
            const result = await this.readJson<{ ok?: boolean; error?: string; details?: string }>(response);
            if (!response.ok || !result?.ok) throw new Error(result?.details || result?.error || `Falha ao solicitar histórico (${response.status})`);
            return;
        }
        if (!this.token) throw new Error("UAZAPI_TOKEN não configurado.");
        await this.postJson("/message/history-sync", {
            mode: "history",
            number: this.toChatId(params.phone),
            ...(params.messageId ? { messageid: this.providerMessageId(params.messageId) } : {}),
            count: Math.max(1, Math.min(params.count || 100, 100)),
        });
    }

    async markChatRead(params: { phone: string; read?: boolean }): Promise<void> {
        if (this.sendViaSupabaseEdge) {
            await this.edgeJson({ readPhone: this.normalizePhone(params.phone), read: params.read !== false });
            return;
        }
        if (!this.token) return;
        await this.postJson("/chat/read", { number: this.toChatId(params.phone), read: params.read !== false });
    }

    async reactToMessage(params: { phone: string; messageId: string; emoji: string }): Promise<void> {
        if (!this.token) throw new Error("UAZAPI_TOKEN não configurado.");
        await this.postJson("/message/react", {
            number: this.toChatId(params.phone),
            id: this.providerMessageId(params.messageId),
            text: params.emoji,
        });
    }

    async editMessage(params: { phone: string; messageId: string; body: string }): Promise<{ waMessageId?: string }> {
        if (this.sendViaSupabaseEdge) return this.editMessageViaSupabaseEdge(params);
        if (!this.token) throw new Error("UAZAPI_TOKEN não configurado.");
        const result = this.asObject(await this.postJson("/message/edit", {
            id: this.providerMessageId(params.messageId),
            text: params.body,
        }));
        const resultMessage = this.asObject(result?.message);
        return {
            waMessageId:
                this.stringOrNull(resultMessage?.messageid) ||
                this.stringOrNull(resultMessage?.id) ||
                this.stringOrNull(result?.messageid) ||
                this.stringOrNull(result?.messageId) ||
                this.stringOrNull(result?.id) ||
                params.messageId,
        };
    }

    async parseIncoming(payload: any): Promise<ParsedIncomingPayload> {
        const parsedMessages = this.messageCandidates(payload)
            .map((candidate) => this.parseUazApiMessage(candidate, payload))
            .filter((message): message is NonNullable<typeof message> => Boolean(message));
        if (!parsedMessages.length) {
            return { contact: { phone: "" }, messages: [] };
        }

        const grouped = new Map<string, typeof parsedMessages>();
        for (const parsed of parsedMessages) {
            const messages = grouped.get(parsed.phone) || [];
            messages.push(parsed);
            grouped.set(parsed.phone, messages);
        }
        const batches = [...grouped.values()].map((items) => ({
            contact: {
                phone: items[0].phone,
                name: items.find((item) => item.name)?.name || null,
                isGroup: items.some((item) => item.isGroup),
            },
            messages: items.map((item) => ({
                direction: item.direction,
                type: item.type,
                body: item.body || undefined,
                mediaUrl: item.mediaUrl || undefined,
                waMessageId: item.waMessageId || `uazapi_${item.phone}_${item.timestamp || Date.now()}`,
                replyToProviderMessageId: item.replyToProviderMessageId,
                timestamp: item.timestamp,
                event: item.event,
            })),
        }));

        return { ...batches[0], ...(batches.length > 1 ? { batches } : {}) };
    }

    async sendText(params: { to: string; body: string; sessionId?: string; replyToMessageId?: string }): Promise<{ waMessageId: string }> {
        if (this.sendViaSupabaseEdge) {
            return this.sendTextViaSupabaseEdge(params);
        }

        if (!this.token) {
            throw new Error("UAZAPI_TOKEN não configurado.");
        }

        const recipient = this.normalizeRecipient(params.to);
        const payload = {
            to: recipient,
            phone: recipient,
            number: recipient,
            text: params.body,
            body: params.body,
            message: params.body,
            instance: params.sessionId || this.defaultSessionId,
            ...(params.replyToMessageId ? { replyid: this.providerMessageId(params.replyToMessageId) } : {}),
        };

        const response = await fetch(`${this.baseUrl}${this.sendTextPath}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.token}`,
                token: this.token,
            },
            body: JSON.stringify(payload),
        });

        const result = await this.readJson<UazApiSendResponse>(response);
        if (!response.ok) {
            const detail = result?.error || result?.detail || result?.status;
            throw new Error(detail || `Falha ao enviar mensagem UAZAPI (${response.status})`);
        }

        return {
            waMessageId:
                result?.message?.messageid ||
                result?.messageid ||
                result?.message?.id ||
                result?.messageId ||
                result?.id ||
                `uazapi_text_${Date.now()}`,
        };
    }

    async sendMedia(params: { to: string; type: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT"; mediaUrl: string; caption?: string; sessionId?: string; replyToMessageId?: string }): Promise<{ waMessageId: string }> {
        if (this.sendViaSupabaseEdge) return this.sendMediaViaSupabaseEdge(params);
        if (!this.token) throw new Error("UAZAPI_TOKEN não configurado.");
        const type = params.type === "IMAGE" ? "image" : params.type === "AUDIO" ? "audio" : params.type === "VIDEO" ? "video" : "document";
        const response = await fetch(`${this.baseUrl}/send/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}`, token: this.token },
            body: JSON.stringify({
                number: this.normalizePhone(params.to),
                type,
                file: params.mediaUrl,
                text: params.caption || "",
                instance: params.sessionId || this.defaultSessionId,
                ...(params.replyToMessageId ? { replyid: this.providerMessageId(params.replyToMessageId) } : {}),
            }),
        });
        const result = await this.readJson<UazApiSendResponse>(response);
        if (!response.ok) throw new Error(result?.error || result?.detail || result?.status || `Falha ao enviar mídia UAZAPI (${response.status})`);
        return { waMessageId: result?.message?.messageid || result?.messageid || result?.message?.id || result?.messageId || result?.id || `uazapi_media_${Date.now()}` };
    }

    async downloadMedia(params: { messageId: string }): Promise<{ data: Buffer; contentType: string }> {
        const response = this.sendViaSupabaseEdge
            ? await fetch(`${this.supabaseUrl}/functions/v1/uazapi-download-media`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-internal-token": this.internalToken },
                body: JSON.stringify({ messageId: params.messageId }),
            })
            : await fetch(`${this.baseUrl}/message/download`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}`, token: this.token },
                body: JSON.stringify({ id: this.providerMessageId(params.messageId), return_base64: true, return_link: true }),
                signal: AbortSignal.timeout(30_000),
            });

        if (!response.ok) {
            const details = await response.json().catch(() => null) as { error?: string; details?: unknown } | null;
            const reason = details?.details ?? details?.error;
            throw new Error(
                typeof reason === "string"
                    ? reason
                    : reason ? JSON.stringify(reason) : `Falha ao baixar mídia (${response.status})`,
            );
        }

        const contentType = response.headers.get("content-type") || "application/octet-stream";
        if (contentType.includes("application/json")) {
            const payload = await this.readJson<Record<string, unknown>>(response);
            const source = this.mediaSource(payload);
            if (!source) throw new Error("A UAZAPI não retornou o arquivo da mídia.");
            if (/^https?:\/\//i.test(source)) {
                const file = await fetch(source, { headers: { Authorization: `Bearer ${this.token}`, token: this.token } });
                if (!file.ok) throw new Error(`Link de mídia indisponível (${file.status}).`);
                return { data: Buffer.from(await file.arrayBuffer()), contentType: file.headers.get("content-type") || this.mediaContentType(payload) };
            }
            const match = /^data:([^;,]+)?;base64,(.+)$/s.exec(source);
            return {
                data: Buffer.from(match?.[2] || source.replace(/^base64,/, ""), "base64"),
                contentType: match?.[1] || this.mediaContentType(payload),
            };
        }

        const data = Buffer.from(await response.arrayBuffer());
        if (!data.length) throw new Error("A UAZAPI retornou uma mídia vazia.");
        return { data, contentType };
    }

    private parseUazApiMessage(payload: any, envelope: any = payload): {
        phone: string;
        name: string | null;
        isGroup: boolean;
        direction: "INBOUND" | "OUTBOUND";
        type: "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT";
        body: string | null;
        mediaUrl: string | null;
        waMessageId: string | null;
        replyToProviderMessageId: string | null;
        timestamp: number | null;
        event: "MESSAGE" | "EDIT" | "DELETE" | "REACTION";
    } | null {
        const chat = this.asObject(payload?.chat) || this.asObject(envelope?.chat);
        const data = this.asObject(payload?.data) || this.asObject(payload?.message) || this.asObject(payload?.payload) || payload;
        const eventType = String(envelope?.event || envelope?.EventType || envelope?.eventType || data?.event || data?.EventType || data?.eventType || "");

        if (eventType && !eventType.toLowerCase().includes("message") && !eventType.toLowerCase().includes("history")) return null;

        const fromMe = data?.fromMe === true || data?.wa_fromMe === true || data?.wasSentByApi === true || data?.direction === "OUTBOUND";

        const rawPhone =
            data?.chatid ||
            data?.remoteJid ||
            data?.sender_pn ||
            chat?.phone ||
            data?.phone ||
            data?.number ||
            (!fromMe ? data?.from : null) ||
            data?.contact ||
            data?.sender_lid ||
            data?.sender ||
            "";

        const rawChatId = String(data?.chatid || data?.remoteJid || data?.key?.remoteJid || chat?.wa_chatid || rawPhone || '');
        const isGroup = data?.wa_isGroup === true || data?.isGroup === true || chat?.wa_isGroup === true || chat?.isGroup === true || rawChatId.includes('@g.us');
        const phone = this.normalizePhone(String(rawPhone));
        const content = this.contentObject(data?.content) || this.contentObject(data?.message);
        const body =
            this.stringOrNull(data?.body) ||
            this.stringOrNull(data?.text) ||
            this.stringOrNull(data?.caption) ||
            this.stringOrNull(content?.text) ||
            this.stringOrNull(content?.caption) ||
            this.stringOrNull(content?.conversation) ||
            (!content ? this.stringOrNull(data?.content) : null);
        const mediaUrl = this.stringOrNull(data?.fileURL) || this.stringOrNull(data?.fileUrl) || this.stringOrNull(data?.mediaUrl) || this.stringOrNull(data?.media_url) || this.stringOrNull(data?.url) || this.stringOrNull(content?.url);
        const declaredType = String(data?.messageType || data?.type || "").toLowerCase();
        const type = this.mapMessageType(String(declaredType === "media" ? data?.mediaType || data?.mimetype : declaredType || data?.mediaType || data?.mimetype || content?.mimetype || "text").toLowerCase());
        const normalizedEventType = eventType.toLowerCase();
        const status = String(data?.status || data?.messageStatus || "").toLowerCase();
        const isReaction = declaredType.includes("reaction") || Boolean(this.stringOrNull(data?.reaction));
        const event: "MESSAGE" | "EDIT" | "DELETE" | "REACTION" = status === "deleted" || declaredType.includes("revok") || declaredType.includes("delete")
            ? "DELETE"
            : isReaction
                ? "REACTION"
                : normalizedEventType.includes("messages_update") && Boolean(data?.edited)
                    ? "EDIT"
                    : "MESSAGE";

        if (!phone || (event === "MESSAGE" && !body && !mediaUrl && type === "TEXT")) return null;

        return {
            phone,
            isGroup,
            name:
                this.stringOrNull(data?.name) ||
                this.stringOrNull(data?.senderName) ||
                this.stringOrNull(chat?.wa_name) ||
                this.stringOrNull(data?.pushName) ||
                this.stringOrNull(data?.notifyName),
            direction: fromMe ? "OUTBOUND" : "INBOUND",
            type,
            body,
            mediaUrl,
            waMessageId: this.stringOrNull(data?.messageid) || this.stringOrNull(data?.messageId) || this.stringOrNull(data?.key?.id) || this.stringOrNull(data?.key) || this.stringOrNull(data?.id),
            replyToProviderMessageId:
                this.stringOrNull(data?.quoted) ||
                this.stringOrNull(data?.quotedMessageId) ||
                this.stringOrNull(data?.contextInfo?.stanzaId) ||
                this.stringOrNull(content?.contextInfo?.stanzaId),
            timestamp: this.numberOrNull(data?.messageTimestamp ?? data?.timestamp ?? data?.wa_timestamp ?? data?.createdAt),
            event,
        };
    }

    private mapMessageType(type: string): "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT" {
        if (type.includes("image")) return "IMAGE";
        if (type.includes("audio") || type.includes("ptt")) return "AUDIO";
        if (type.includes("video")) return "VIDEO";
        if (type.includes("document") || type.includes("file")) return "DOCUMENT";
        return "TEXT";
    }

    private normalizePhone(value: string): string {
        const digits = value.replace("@s.whatsapp.net", "").replace("@c.us", "").replace("@lid", "").replace(/\D/g, "");
        if (!digits.startsWith("55") || digits.length !== 12) return digits;
        const areaCode = Number(digits.slice(2, 4));
        const subscriber = digits.slice(4);
        if (areaCode < 11 || areaCode > 99 || !/^[6-9]/.test(subscriber)) return digits;
        return `${digits.slice(0, 4)}9${subscriber}`;
    }

    private normalizeRecipient(value: string): string {
        const trimmed = value.trim();
        if (trimmed.includes("@g.us")) return this.normalizeGroupId(trimmed);
        return this.normalizePhone(trimmed);
    }

    private phoneAliases(value: string): string[] {
        const canonical = this.normalizePhone(value);
        const aliases = new Set([canonical]);
        if (canonical.startsWith("55") && canonical.length === 13 && canonical[4] === "9" && /^[6-9]/.test(canonical[5] || "")) {
            aliases.add(`${canonical.slice(0, 4)}${canonical.slice(5)}`);
        }
        return [...aliases];
    }

    private normalizeGroupId(value: string): string {
        const trimmed = value.trim();
        if (trimmed.includes("@g.us")) return trimmed;
        const digits = trimmed.replace(/\D/g, "");
        return digits ? `${digits}@g.us` : "";
    }

    private toChatId(value: string): string {
        return value.includes("@") ? value : `${this.normalizePhone(value)}@s.whatsapp.net`;
    }

    private providerMessageId(value: string): string {
        return value.includes(":") ? value.split(":").at(-1) || value : value;
    }

    private asObject(value: unknown): Record<string, any> | null {
        return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
    }

    private stringOrNull(value: unknown): string | null {
        if (typeof value === "string" && value.trim()) return value.trim();
        if (typeof value === "number") return String(value);
        return null;
    }

    private numberOrNull(value: unknown): number | null {
        const number = typeof value === "number" ? value : Number(value);
        return Number.isFinite(number) && number > 0 ? number : null;
    }

    private contentObject(value: unknown): Record<string, any> | null {
        if (typeof value === "string") {
            try {
                return this.asObject(JSON.parse(value));
            } catch {
                return null;
            }
        }
        return this.asObject(value);
    }

    private messageCandidates(payload: unknown): unknown[] {
        if (Array.isArray(payload)) return payload;
        const root = this.asObject(payload);
        if (!root) return [];
        const candidates: unknown[] = [];
        for (const key of ["messages", "history", "items", "records"]) {
            if (Array.isArray(root[key])) candidates.push(...root[key]);
        }
        const data = root.data;
        if (Array.isArray(data)) candidates.push(...data);
        const dataObject = this.asObject(data);
        if (dataObject) {
            for (const key of ["messages", "history", "items", "records"]) {
                if (Array.isArray(dataObject[key])) candidates.push(...dataObject[key]);
            }
        }
        return candidates.length ? candidates : [payload];
    }

    private isGroupChat(chat: Record<string, any>) {
        return chat.wa_isGroup === true || chat.isGroup === true || String(chat.wa_chatid ?? chat.chatid ?? chat.remoteJid ?? "").includes("@g.us");
    }

    private collectionItems(payload: unknown): unknown[] {
        if (Array.isArray(payload)) return payload;
        const object = this.asObject(payload);
        if (!object) return [];
        for (const key of ["data", "chats", "messages", "results", "items"]) {
            if (Array.isArray(object[key])) return object[key];
        }
        return [];
    }

    private extractAvatarUrl(payload: unknown): string | null {
        const object = this.asObject(payload);
        if (!object) return null;
        for (const key of ["image", "imagePreview", "avatarUrl", "profilePictureUrl", "profilePicUrl", "pictureUrl", "url", "imageUrl", "imgUrl", "wa_profilePicUrl"]) {
            const value = this.stringOrNull(object[key]);
            if (value && /^https?:\/\//i.test(value)) return value;
        }
        for (const key of ["data", "result", "message"]) {
            const nested = this.extractAvatarUrl(object[key]);
            if (nested) return nested;
        }
        return null;
    }

    private async fetchChatMessages(chatId: string, phone: string, messageLimit: number): Promise<WhatsAppHistoryChat["messages"]> {
        const messages: WhatsAppHistoryChat["messages"] = [];
        const knownIds = new Set<string>();
        const candidates = this.messageChatCandidates(chatId, phone);
        let lastError: unknown = null;

        for (const candidate of candidates) {
            try {
                await this.collectChatMessages(candidate, messageLimit, messages, knownIds);
            } catch (error) {
                lastError = error;
            }
            if (messages.length >= messageLimit) break;
        }

        if (!messages.length && lastError) throw lastError;
        return messages;
    }

    private async collectChatMessages(
        chatId: string,
        messageLimit: number,
        messages: WhatsAppHistoryChat["messages"],
        knownIds: Set<string>,
    ): Promise<void> {
        const pageSize = Math.min(messageLimit, 200);

        for (let offset = 0; offset < messageLimit; offset += pageSize) {
            const payload = await this.postJson("/message/find", { chatid: chatId, limit: Math.min(pageSize, messageLimit - offset), offset });
            const page = this.collectionItems(payload);
            if (!page.length) break;

            let added = 0;
            for (const value of page) {
                const message = this.asObject(value);
                if (!message) continue;
                const id = this.stringOrNull(message.messageid ?? message.messageId ?? message.key?.id ?? message.id);
                if (id && knownIds.has(id)) continue;
                if (id) knownIds.add(id);

                const content = this.contentObject(message.content) || this.contentObject(message.message);
                const declaredType = String(message.messageType ?? message.type ?? "").toLowerCase();
                const type = this.mapMessageType(String(declaredType === "media" ? message.mediaType ?? message.mimetype : declaredType || message.mediaType || message.mimetype || content?.mimetype || "text").toLowerCase());
                const body = this.stringOrNull(message.body ?? message.text ?? message.caption ?? content?.text ?? content?.caption ?? content?.conversation ?? (!content ? message.content : null));
                const mediaUrl = this.stringOrNull(message.fileURL ?? message.fileUrl ?? message.mediaUrl ?? message.media_url ?? message.url ?? content?.url);
                if (!body && !mediaUrl && type === "TEXT") continue;

                messages.push({
                    direction: message.fromMe === true || message.wa_fromMe === true || message.direction === "OUTBOUND" ? "OUTBOUND" : "INBOUND",
                    type,
                    body,
                    mediaUrl,
                    waMessageId: id,
                    replyToProviderMessageId:
                        this.stringOrNull(message.quoted) ||
                        this.stringOrNull(message.quotedMessageId) ||
                        this.stringOrNull(message.contextInfo?.stanzaId) ||
                        this.stringOrNull(content?.contextInfo?.stanzaId),
                    timestamp: this.numberOrNull(message.messageTimestamp ?? message.timestamp ?? message.wa_timestamp ?? message.createdAt),
                });
                added += 1;
            }
            if (page.length < pageSize || added === 0) break;
        }
    }

    private messageChatCandidates(chatId: string, phone: string): string[] {
        const aliases = this.phoneAliases(phone).flatMap((alias) => [alias, `${alias}@s.whatsapp.net`]);
        return [...new Set([chatId, this.normalizePhone(chatId), ...aliases].filter((value) => value && value.length >= 10))];
    }

    private async postJson(path: string, body: Record<string, unknown>): Promise<unknown> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.token}`,
                token: this.token,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15_000),
        });
        const payload = await this.readJson<any>(response);
        if (!response.ok) {
            throw new Error(payload?.error || payload?.detail || payload?.message || `UAZAPI respondeu ${response.status}`);
        }
        return payload;
    }

    private async getJson(path: string): Promise<unknown> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            headers: { Authorization: `Bearer ${this.token}`, token: this.token },
            signal: AbortSignal.timeout(15_000),
        });
        const payload = await this.readJson<any>(response);
        if (!response.ok) throw new Error(payload?.error || payload?.detail || payload?.message || `UAZAPI respondeu ${response.status}`);
        return payload;
    }

    private async edgeJson<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
        if (!this.supabaseUrl || !this.internalToken) throw new Error("Integração UAZAPI via Supabase não configurada.");
        const response = await fetch(`${this.supabaseUrl}/functions/v1/uazapi-history`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal-token": this.internalToken },
            body: JSON.stringify(body),
        });
        const result = await this.readJson<(T & { ok?: boolean; error?: string; details?: string })>(response);
        if (!response.ok || !result?.ok) throw new Error(result?.details || result?.error || `Falha na integração UAZAPI (${response.status})`);
        return result;
    }

    private mediaSource(value: unknown): string | null {
        const object = this.asObject(value);
        if (!object) return null;
        for (const key of ["fileURL", "fileUrl", "base64Data", "dataUrl", "mediaUrl", "url", "file", "base64"]) {
            const source = this.stringOrNull(object[key]);
            if (source) return source;
        }
        for (const key of ["data", "message", "media", "result"]) {
            const source = this.mediaSource(object[key]);
            if (source) return source;
        }
        return null;
    }

    private mediaContentType(value: unknown): string {
        const object = this.asObject(value);
        if (!object) return "application/octet-stream";
        return this.stringOrNull(object.mimetype ?? object.mimeType ?? object.contentType) || "application/octet-stream";
    }

    private async readJson<T>(response: Response): Promise<T | null> {
        try {
            return (await response.json()) as T;
        } catch {
            return null;
        }
    }

    private async syncHistoryViaSupabaseEdge(options: WhatsAppHistorySyncOptions): Promise<WhatsAppHistoryChat[]> {
        if (!this.supabaseUrl || !this.internalToken) {
            throw new Error("Integração de histórico via Supabase não configurada.");
        }
        const response = await fetch(`${this.supabaseUrl}/functions/v1/uazapi-history`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal-token": this.internalToken },
            body: JSON.stringify(options),
        });
        const result = await this.readJson<{ ok?: boolean; chats?: WhatsAppHistoryChat[]; error?: string; details?: string }>(response);
        if (!response.ok || !result?.ok) {
            throw new Error(result?.details || result?.error || `Falha ao consultar histórico (${response.status})`);
        }
        return result.chats || [];
    }

    private async sendTextViaSupabaseEdge(params: { to: string; body: string; sessionId?: string; replyToMessageId?: string }): Promise<{ waMessageId: string }> {
        if (!this.supabaseUrl) {
            throw new Error("SUPABASE_URL não configurado para envio via Edge Function.");
        }
        if (!this.internalToken) {
            throw new Error("SIGMA_INTERNAL_TOKEN não configurado para envio via Edge Function.");
        }

        const response = await fetch(`${this.supabaseUrl}/functions/v1/uazapi-send-message`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-internal-token": this.internalToken,
            },
            body: JSON.stringify({
                to: this.normalizeRecipient(params.to),
                body: params.body,
                sessionId: params.sessionId || this.defaultSessionId,
                replyToMessageId: params.replyToMessageId,
                record: false,
            }),
        });

        const result = await this.readJson<SupabaseEdgeSendResponse>(response);
        if (!response.ok || !result?.ok) {
            throw new Error(result?.details || result?.error || `Falha ao enviar via Edge Function (${response.status})`);
        }

        return {
            waMessageId: result.providerMessageId || `uazapi_edge_text_${Date.now()}`,
        };
    }

    private async editMessageViaSupabaseEdge(params: { phone: string; messageId: string; body: string }): Promise<{ waMessageId?: string }> {
        if (!this.supabaseUrl || !this.internalToken) {
            throw new Error("Integração de edição via Supabase não configurada.");
        }

        const response = await fetch(`${this.supabaseUrl}/functions/v1/uazapi-send-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal-token": this.internalToken },
            body: JSON.stringify({
                to: this.normalizeRecipient(params.phone),
                body: params.body,
                editMessageId: this.providerMessageId(params.messageId),
                record: false,
            }),
        });
        const result = await this.readJson<SupabaseEdgeSendResponse>(response);
        if (!response.ok || !result?.ok) {
            throw new Error(
                result?.details ||
                result?.error ||
                result?.message ||
                result?.code ||
                `Falha ao editar via Edge Function (${response.status})`,
            );
        }
        return { waMessageId: result.providerMessageId || params.messageId };
    }

    private async sendMediaViaSupabaseEdge(params: { to: string; type: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT"; mediaUrl: string; caption?: string; sessionId?: string; replyToMessageId?: string }): Promise<{ waMessageId: string }> {
        if (!this.supabaseUrl || !this.internalToken) throw new Error("Integração de mídia via Edge Function não configurada.");
        const response = await fetch(`${this.supabaseUrl}/functions/v1/uazapi-send-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal-token": this.internalToken },
            body: JSON.stringify({ to: this.normalizeRecipient(params.to), body: params.caption || "", mediaDataUrl: params.mediaUrl, mediaType: params.type, sessionId: params.sessionId || this.defaultSessionId, replyToMessageId: params.replyToMessageId, record: false }),
        });
        const result = await this.readJson<SupabaseEdgeSendResponse>(response);
        if (!response.ok || !result?.ok) throw new Error(result?.details || result?.error || `Falha ao enviar mídia via Edge Function (${response.status})`);
        return { waMessageId: result.providerMessageId || `uazapi_edge_media_${Date.now()}` };
    }
}
