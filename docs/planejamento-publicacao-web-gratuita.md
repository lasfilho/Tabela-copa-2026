# Planejamento de publicação web — Copa 2026 Dashboard (100% gratuito)

Documento de referência para colocar o app na internet **sem custo mensal**, usando serviços com tier free.  
Estimativa total: **R$ 0/mês** (domínio `.com` opcional ~R$ 40/ano).

---

## 1. Resumo executivo

| Item | Decisão recomendada |
|------|---------------------|
| **Hospedagem da API + frontend** | [Render](https://render.com) — Web Service (Docker) |
| **Banco PostgreSQL** | [Neon](https://neon.tech) — Postgres serverless free |
| **Código-fonte** | [GitHub](https://github.com) — repositório privado ou público |
| **Domínio** | Subdomínio grátis do Render (`seu-app.onrender.com`) |
| **HTTPS** | Incluso no Render |
| **Monitoramento básico** | [UptimeRobot](https://uptimerobot.com) — ping gratuito (opcional) |

**URL final esperada:** `https://copa-2026-xxxx.onrender.com`

O app já serve HTML/CSS/JS e API no mesmo processo Node — **não precisa hospedar frontend separado**.

---

## 2. O que o app precisa para funcionar online

Com base na arquitetura atual (`docker-compose.yml`, `backend/`, PostgreSQL):

| Componente | Função | Obrigatório online? |
|------------|--------|---------------------|
| **Node.js + Express** | API REST + arquivos estáticos | Sim |
| **PostgreSQL 16** | Placares, usuários, bolões, elencos | Sim |
| **Worker de sync** | Atualiza placares (TheSportsDB) a cada 5 min | Recomendado |
| **Worker de elencos** | Importa jogadores/fotos FIFA | Opcional (roda no startup) |
| **Docker** | Facilita deploy | Recomendado (Render suporta Dockerfile) |

### Variáveis de ambiente necessárias

```env
DATABASE_URL=postgres://user:pass@host/db?sslmode=require
PORT=8080
NODE_ENV=production

JWT_SECRET=<string-longa-aleatoria-32+chars>
ADMIN_EMAIL=seu-email@dominio.com
ADMIN_PASSWORD=<senha-forte>

SYNC_ENABLED=true
SYNC_INTERVAL_MS=300000
SPORTS_API_KEY=123
```

Opcional (melhora artilheiros/placares):

```env
# API_FOOTBALL_KEY=sua-chave-api-sports.io
```

---

## 3. Arquitetura recomendada (gratuita)

```
                    ┌─────────────────────────────────────┐
  Usuário (browser) │  https://copa-2026.onrender.com     │
        │           │  ┌───────────────────────────────┐  │
        └──────────▶│  │  Render Web Service (Docker)  │  │
                    │  │  • Express API                │  │
                    │  │  • HTML/CSS/JS estático       │  │
                    │  │  • Sync placares (background) │  │
                    │  └──────────────┬────────────────┘  │
                    └─────────────────┼───────────────────┘
                                      │ DATABASE_URL (SSL)
                                      ▼
                    ┌─────────────────────────────────────┐
                    │  Neon PostgreSQL (free)             │
                    │  • Placares, bolões, elencos        │
                    │  • Backup automático (7 dias)       │
                    └─────────────────────────────────────┘
```

**Por que essa combinação?**

- **Render**: deploy direto do `Dockerfile` existente, HTTPS automático, integração com GitHub.
- **Neon**: Postgres gratuito persistente (Render não oferece Postgres free confiável desde 2024).
- **Custo zero** e setup em ~1–2 horas.

---

## 4. Comparativo de opções 100% gratuitas

| Opção | Prós | Contras | Dificuldade |
|-------|------|---------|-------------|
| **A — Neon + Render** ⭐ | Simples, usa Docker atual, docs abundantes | App “dorme” após 15 min sem acesso (~30–60 s para acordar) | Baixa |
| **B — Fly.io (app + Postgres)** | Não dorme, tudo em um lugar | Configuração mais técnica; limites de RAM (256 MB/VM) | Média |
| **C — Oracle Cloud Always Free** | VM potente (4 OCPU ARM, 24 GB RAM), sem sleep | Setup manual (SSH, Docker, firewall, nginx) | Alta |
| **D — Railway** | Muito fácil | Crédito mensal limitado (~US$ 5); pode acabar antes da Copa | Baixa |
| **E — Vercel/Netlify + API separada** | CDN rápida para estáticos | App não é estático puro; exige split desnecessário | Média |

**Recomendação:** começar com **Opção A**. Se o “cold start” incomodar durante jogos ao vivo, migrar para **Opção B** ou **C**.

---

## 5. Fases do projeto

### Fase 0 — Preparação do repositório (30–60 min)

**Checklist antes do deploy:**

- [ ] Código no GitHub (push do repositório `copa-2026`)
- [ ] Trocar credenciais padrão (`JWT_SECRET`, `ADMIN_PASSWORD`) — **nunca usar `admin123` em produção**
- [ ] Confirmar que `.env` está no `.gitignore` (já está)
- [ ] Testar build local: `docker compose up --build`
- [ ] Verificar endpoint de saúde: `GET /api/health`

**Ajustes opcionais recomendados (antes ou logo após 1º deploy):**

| Ajuste | Motivo |
|--------|--------|
| `DATABASE_URL` com `?sslmode=require` | Neon exige SSL |
| Desacelerar sync de fotos em produção | Evitar rate limit TheSportsDB (HTTP 429) |
| `SYNC_INTERVAL_MS=600000` (10 min) | Reduz carga no tier free |

**Script útil pós-deploy (já existe no projeto):**

```bash
# Reimportar elencos FIFA (sem fotos — rápido)
docker exec copa2026-app node scripts/sync-all-squads.js --skip-photos

# Reimportar uma seleção com fotos
docker exec copa2026-app node scripts/sync-all-squads.js BRA
```

---

### Fase 1 — Banco PostgreSQL no Neon (15 min)

1. Criar conta em [neon.tech](https://neon.tech)
2. **New Project** → nome: `copa-2026` → região: `US East` ou `São Paulo` (se disponível)
3. Copiar **Connection string** (modo *Pooled* recomendado para Render)
4. Adicionar `?sslmode=require` ao final da URL
5. Guardar a URL — será `DATABASE_URL` no Render

**Limites free Neon (suficientes para este app):**

- ~512 MB de storage
- Compute suspende após inatividade (acorda rápido no 1º request)
- 1 projeto, branches limitadas

**Seed automático:** o app roda `initDatabase()` no startup e popula times, jogos e admin se o banco estiver vazio.

---

### Fase 2 — Deploy no Render (30–45 min)

1. Criar conta em [render.com](https://render.com) (login com GitHub)
2. **New → Web Service**
3. Conectar repositório `copa-2026`
4. Configuração:

| Campo | Valor |
|-------|-------|
| **Name** | `copa-2026` |
| **Region** | Oregon (US West) ou Ohio |
| **Branch** | `main` |
| **Runtime** | Docker |
| **Dockerfile path** | `backend/Dockerfile` |
| **Docker build context** | `.` (raiz do repo) |
| **Instance type** | Free |
| **Health check path** | `/api/health` |

5. **Environment Variables** — adicionar todas da seção 2
6. **Create Web Service** → aguardar build (5–10 min na 1ª vez)
7. Acessar URL: `https://copa-2026-xxxx.onrender.com`

**Deploy contínuo:** cada `git push` na branch `main` gera novo deploy automaticamente.

---

### Fase 3 — Domínio e HTTPS (opcional, 15 min)

| Opção | Custo | Como |
|-------|-------|------|
| Subdomínio Render | Grátis | Já incluso (`*.onrender.com`) |
| Domínio `.com.br` / `.com` | ~R$ 40/ano | Registro.br, Namecheap, Cloudflare Registrar |
| DNS + SSL custom | Grátis | Cloudflare DNS → CNAME para Render |

Para domínio próprio no Render:

1. Render → Settings → Custom Domains → adicionar `copadomundo.seudominio.com`
2. No Cloudflare/registrador: CNAME apontando para o host do Render
3. SSL provisionado automaticamente

---

### Fase 4 — Validação pós-deploy (20 min)

**Testes manuais:**

| # | Teste | URL / ação | Resultado esperado |
|---|-------|------------|-------------------|
| 1 | Health | `/api/health` | `{ "ok": true }` ou similar |
| 2 | Dashboard | `/` | Grupos e jogos carregam |
| 3 | Login admin | `/login` | Login com `ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| 4 | Bolões públicos | `/boloes` | Lista de bolões |
| 5 | Sync | Aguardar 5–10 min | Placares atualizam (se jogos ao vivo) |
| 6 | Escalação | Página de seleção | Elenco FIFA + fotos (parcial) |

**Comandos úteis (Render Shell ou local com DATABASE_URL de produção):**

```bash
# Status do sync
curl https://SEU-APP.onrender.com/api/sync/status

# Reimportar elencos (via shell do Render, se disponível)
node scripts/sync-all-squads.js --skip-photos
```

---

## 6. Mitigando limitações do tier gratuito

### 6.1 App “dorme” no Render (cold start)

**Sintoma:** primeira visita após 15 min demora 30–60 segundos.

**Soluções gratuitas:**

| Solução | Eficácia | Observação |
|---------|----------|------------|
| [UptimeRobot](https://uptimerobot.com) — ping a cada 5 min em `/api/health` | Alta | Mantém instância acordada |
| Aviso no frontend (“Carregando…”) | UX | Já tolerável para dashboard |
| Migrar para Fly.io / Oracle | Definitiva | Mais trabalho |

### 6.2 Rate limit TheSportsDB (fotos/placares)

**Sintoma:** fotos faltando, sync com HTTP 429 nos logs.

**Soluções:**

- Manter `SYNC_ENABLED=true` (placares são prioridade)
- Sync de fotos: rodar manualmente por seleção (`sync-all-squads.js BRA`)
- Opcional: chave paga [API-Football](https://www.api-football.com) — **não é free**, só se quiser upgrade futuro

### 6.3 Limites de RAM (512 MB no Render free)

O app + Node + sync cabe confortavelmente. Se houver OOM:

- Aumentar `SYNC_INTERVAL_MS` para 600000
- Desabilitar sync de elencos no startup (`SYNC_ENABLED` só para placares — requer pequeno ajuste de código)

### 6.4 Neon suspende compute

Acorda automaticamente no primeiro query. Pode adicionar 1–2 s na primeira requisição após longa inatividade.

---

## 7. Segurança mínima para produção

| Item | Ação |
|------|------|
| Senhas | `ADMIN_PASSWORD` forte (16+ chars, gerada) |
| JWT | `JWT_SECRET` aleatório (32+ bytes) — [gerador](https://generate-secret.vercel.app/32) |
| Secrets | Só via env vars no Render — nunca no Git |
| HTTPS | Sempre (Render força) |
| Admin | Trocar email padrão `admin@copa2026.local` |
| Backups | Neon faz backup automático; export manual antes da Copa: `pg_dump` |

**Gerar secrets (PowerShell):**

```powershell
# JWT_SECRET (48 chars)
-join ((48..57 + 65..90 + 97..122 | Get-Random -Count 48 | ForEach-Object {[char]$_}))
```

---

## 8. Cronograma sugerido

| Semana | Atividade | Entregável |
|--------|-----------|------------|
| **S1** | Fase 0 — preparar repo, trocar secrets | Código pronto no GitHub |
| **S1** | Fase 1 — Neon + teste local com DATABASE_URL remoto | Banco na nuvem funcionando |
| **S1** | Fase 2 — Deploy Render | URL pública acessível |
| **S2** | Fase 4 — testes completos + UptimeRobot | App estável |
| **S2** | Divulgar link do bolão para amigos | Primeiros usuários |
| **Durante Copa** | Monitorar logs Render + sync status | Placares ao vivo |
| **Pós-Copa** | Exportar dump do banco (opcional) | Arquivo `.sql` de backup |

**Tempo total estimado:** 2–4 horas de trabalho concentrado.

---

## 9. Alternativa B — Fly.io (sem cold start)

Para quem aceita configuração extra:

1. Instalar [flyctl](https://fly.io/docs/hands-on/install-flyctl/)
2. `fly launch` na raiz (detecta Dockerfile)
3. Criar Postgres: `fly postgres create` ou usar Neon mesmo
4. `fly secrets set DATABASE_URL=... JWT_SECRET=...`
5. `fly deploy`

**Vantagem:** instância não dorme.  
**Limite free:** 3 VMs shared-cpu-1x com 256 MB RAM cada.

---

## 10. Alternativa C — Oracle Cloud Always Free

Para máximo controle e zero sleep:

1. Criar VM ARM (Ampere A1 — até 4 OCPU / 24 GB RAM)
2. Instalar Docker + Docker Compose
3. Clonar repo, configurar `.env`
4. `docker compose up -d --build`
5. Abrir porta 80/443 no Security List
6. (Opcional) Nginx + Certbot para domínio

**Vantagem:** roda exatamente como local, sem cold start.  
**Desvantagem:** 2–4 h de setup; documentação Oracle é densa.

---

## 11. CI/CD gratuito (opcional)

| Ferramenta | Uso |
|------------|-----|
| **GitHub Actions** | Lint/test antes do deploy (2.000 min/mês free) |
| **Render auto-deploy** | Deploy on push — já incluso |

Exemplo mínimo de workflow (`.github/workflows/check.yml`):

```yaml
name: check
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -f backend/Dockerfile .
```

---

## 12. Checklist final “go live”

```
Pré-deploy
[ ] Repositório no GitHub
[ ] JWT_SECRET e ADMIN_PASSWORD de produção definidos
[ ] DATABASE_URL Neon testada localmente

Deploy
[ ] Web Service Render criado (Docker, contexto raiz)
[ ] Variáveis de ambiente configuradas
[ ] Health check /api/health OK
[ ] Login admin funciona

Pós-deploy
[ ] Bootstrap carrega times e jogos
[ ] Bolão de demo ou bolão real criado
[ ] UptimeRobot configurado (opcional)
[ ] Link compartilhado com participantes do bolão

Durante a Copa
[ ] Verificar /api/sync/status periodicamente
[ ] Logs Render sem erros críticos
[ ] Backup manual do Neon antes das oitavas (opcional)
```

---

## 13. Estimativa de custos

| Serviço | Plano | Custo mensal |
|---------|-------|--------------|
| GitHub | Free | R$ 0 |
| Neon PostgreSQL | Free | R$ 0 |
| Render Web Service | Free | R$ 0 |
| UptimeRobot | Free (50 monitors) | R$ 0 |
| Cloudflare DNS | Free | R$ 0 |
| Domínio `.com` | Opcional | ~R$ 3/mês (anual) |
| **Total mínimo** | | **R$ 0/mês** |

---

## 14. Próximos passos imediatos

1. **Criar repositório GitHub** e fazer push do código atual
2. **Criar projeto Neon** e anotar `DATABASE_URL` (com `?sslmode=require`)
3. **Render → New → Blueprint** — o repositório já inclui `render.yaml`
4. **Preencher** `DATABASE_URL`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` no painel Render
5. **Testar** `https://seu-app.onrender.com/api/health`
6. **Compartilhar** `/boloes` com os participantes

### Arquivos de deploy incluídos no projeto

| Arquivo | Função |
|---------|--------|
| `render.yaml` | Blueprint Render (deploy automático) |
| `.env.example` | Documentação de variáveis de ambiente |
| `.github/workflows/check.yml` | Valida build Docker no push |
| `backend/src/db.js` | SSL automático para Neon (`DATABASE_SSL=true`) |

---

*Documento gerado para o projeto Copa 2026 Dashboard — junho/2026.*
