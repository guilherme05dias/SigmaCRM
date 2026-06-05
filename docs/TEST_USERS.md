# Usuários padrão de teste

Todos os usuários abaixo usam a senha:

```text
123456
```

## DragonByte Solutions

| Perfil | E-mail | Status |
|---|---|---|
| Admin | `admin@dragonbyte.com` | Ativo |
| Supervisor | `supervisor@dragonbyte.com` | Ativo |
| Atendente | `ana@dragonbyte.com` | Ativo |
| Atendente | `rafael@dragonbyte.com` | Ativo |
| Técnico | `carlos@dragonbyte.com` | Ativo |
| Técnico | `julia@dragonbyte.com` | Ativo |
| Atendente | `inativo@dragonbyte.com` | Inativo |

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
