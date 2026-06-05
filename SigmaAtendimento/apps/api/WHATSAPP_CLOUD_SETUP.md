# Configuração do WhatsApp Business Cloud API (Meta)

O Sigma Atendimento agora está preparado para integrar nativamente com a **WhatsApp Business Cloud API** oficial da Meta, substituindo integrações não-oficiais (WAHA).

A Cloud API oferece maior estabilidade, não necessita manter uma sessão no celular rodando, e atua de baixo do teto de segurança e estabilidade do Facebook/Meta.

## Requisitos Iniciais
1. Uma conta no **Meta for Developers**.
2. Um **Aplicativo configurado** no Meta App Dashboard (tipo "Business").
3. Um número de telefone válido e verificado dentro de uma **Conta do WhatsApp Business**.

> [!IMPORTANTE]
> O número não pode estar sendo usado no aplicativo comum ou aplicativo WhatsApp Business simultaneamente na rede convencional de celular. O registro deve ser migrado e ativado na Cloud API.

<br>

## Guia de Instalação Rápida

### 1) Ações no Dashboard da Meta
1. Cesse developers.facebook.com, vá até os seus apps e adicione o produto "WhatsApp" ao seu aplicativo.
2. Anote o `Phone Number ID` de disparo e configure a sua URL de acesso e o Token.

### 2) Váriaveis de Ambiente Necessárias (`.env`)

Configure o Sigma localmente (ou no seu servidor):
```env
# Define o provider oficial em uso:
WHATSAPP_PROVIDER=meta-cloud

# Cloud API Settings
META_WHATSAPP_API_BASE_URL=https://graph.facebook.com/v20.0
META_WHATSAPP_PHONE_NUMBER_ID=123456789012345
META_WHATSAPP_ACCESS_TOKEN=EAA_MEU_TOKEN_DE_ACESSO_LONGO...
META_WHATSAPP_VERIFY_TOKEN=sigma_verify_token_123
```

### 3) Configuração do Webhook

Vá ao seu Meta App > WhatsApp > Configuration > Edit Webhook

- **Callback URL:** `https://SUA_URL.com/api/whatsapp/webhook`
- **Verify Token:** O valor que definiu em `META_WHATSAPP_VERIFY_TOKEN` (ex: `sigma_verify_token_123`).

Clique em **Verify and Save**. (O Sigma responderá positivamente e habilitará o Webhook via rota GET implementada para isso).
Obrigatoriamente assine (Subscribe) as _webhook fields_: `messages`.

## Documentações Oficiais 
Caso o endpoint das APIs mudem acompanhe as alterações aqui.
- [Get Started - Meta Developer](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)
- [Webhooks para Whatsapp - Meta Developer](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components)
