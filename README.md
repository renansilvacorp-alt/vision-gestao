# Vision - Gestão Integrada

Migração da Vision para infraestrutura independente do AppDeploy.

## Produção

Arquitetura:
- Next.js / Vercel
- Neon Postgres
- Neon Auth
- Multiempresa
- Containers funcionais instaláveis
- Perfis Superadmin, Administrador e Operador

## Variáveis obrigatórias

Copie `.env.example` para `.env.local` e configure:

- `DATABASE_URL`
- `NEON_AUTH_BASE_URL`
- `NEON_AUTH_COOKIE_SECRET`

Nunca envie segredos para o GitHub.
