# Usuários padrão de teste

Todos os usuários abaixo usam a senha:

```text
123456
```

## SigmaPDV

| Perfil | E-mail | Status |
|---|---|---|
| Admin | `admin@sigmapdv.com` | Ativo |
| Supervisor | `supervisor@sigmapdv.com` | Ativo |
| Atendente | `atendente@sigmapdv.com` | Ativo |
| Atendente | `rafael@sigmapdv.com` | Ativo |
| Técnico | `carlos@sigmapdv.com` | Ativo |
| Técnico | `julia@sigmapdv.com` | Ativo |
| Atendente | `inativo@sigmapdv.com` | Inativo |

## Acme Tech

| Perfil | E-mail | Status |
|---|---|---|
| Admin | `admin@acme.com` | Ativo |
| Supervisor | `supervisor@acme.com` | Ativo |
| Atendente | `lia@acme.com` | Ativo |
| Técnico | `mauro@acme.com` | Ativo |
| Atendente | `inativo@acme.com` | Inativo |

## Observações

- Usuários inativos retornam `403` no login.
- Os dados são recriados pelo comando:

```bash
npm run prisma:seed
```

Executar o seed limpa e recria os dados de desenvolvimento.
