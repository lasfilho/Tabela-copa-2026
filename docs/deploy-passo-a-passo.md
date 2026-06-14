# Deploy rápido — Copa 2026

Repositório: **https://github.com/lasfilho/Tabela-copa-2026**

## Passo 1 — Neon (PostgreSQL)

1. Acesse [console.neon.tech](https://console.neon.tech) e crie uma conta
2. **New Project** → nome: `copa-2026` → região próxima (US East ou São Paulo)
3. No dashboard, aba **Connection Details**:
   - Ative **Pooled connection**
   - Copie a URL e confirme que termina com `?sslmode=require`  
     Exemplo:  
     `postgres://user:senha@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`

Guarde essa URL — é o `DATABASE_URL`.

---

## Passo 2 — Render (app)

1. Acesse [dashboard.render.com](https://dashboard.render.com) → login com GitHub
2. **New +** → **Blueprint**
3. Conecte o repositório `lasfilho/Tabela-copa-2026`
4. O Render detecta o `render.yaml` — clique **Apply**
5. Preencha os campos obrigatórios:

| Variável | Valor |
|----------|--------|
| `DATABASE_URL` | URL copiada do Neon |
| `ADMIN_EMAIL` | Seu e-mail (login admin) |
| `ADMIN_PASSWORD` | Senha forte (16+ caracteres) |

O `JWT_SECRET` é gerado automaticamente.

6. Aguarde o build (5–10 min na 1ª vez)
7. URL final: `https://copa-2026.onrender.com` (ou similar)

---

## Passo 3 — Validar

Abra no navegador:

```
https://SEU-APP.onrender.com/api/health
https://SEU-APP.onrender.com/
https://SEU-APP.onrender.com/login
https://SEU-APP.onrender.com/boloes
```

Login admin: e-mail e senha que você definiu no Render.

Na 1ª subida o app roda o seed automaticamente (times, jogos, admin).

---

## Passo 4 — Manter acordado (opcional)

Render free “dorme” após 15 min sem tráfego.

1. [uptimerobot.com](https://uptimerobot.com) → conta grátis
2. **Add Monitor** → HTTP(s) → URL: `https://SEU-APP.onrender.com/api/health`
3. Intervalo: 5 minutos

---

## Problemas comuns

| Sintoma | Solução |
|---------|---------|
| Build falha no Render | Ver logs → confirmar `dockerfilePath: backend/Dockerfile` |
| Erro de conexão DB | Conferir `DATABASE_URL` com `?sslmode=require` |
| App lento na 1ª visita | Cold start normal — use UptimeRobot |
| Sync 429 nos logs | Normal no free — placares continuam; fotos atualizam aos poucos |

---

## Atualizar produção

Cada `git push` na branch `main` dispara deploy automático no Render.

```bash
git push origin main
```

Guia completo: [planejamento-publicacao-web-gratuita.md](./planejamento-publicacao-web-gratuita.md)
