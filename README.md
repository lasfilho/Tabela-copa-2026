# Copa do Mundo 2026 — Dashboard com PostgreSQL + Docker

Sistema completo para acompanhar a Copa 2026 com **modo Real**, **Simulação** e **Bolão**, persistência no **PostgreSQL** e o mesmo visual do dashboard.

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e rodando

## Iniciar

```bash
cd copa-2026
docker compose up --build
```

Acesse: **http://localhost:3000**

- **Ranking público dos bolões:** http://localhost:3000/boloes
- **Login:** http://localhost:3000/login

Para parar: `Ctrl+C` e depois `docker compose down`

Para apagar os dados do banco: `docker compose down -v`

## Publicar na web (grátis)

Guia completo: **[docs/planejamento-publicacao-web-gratuita.md](docs/planejamento-publicacao-web-gratuita.md)**  
Passo a passo rápido: **[docs/deploy-passo-a-passo.md](docs/deploy-passo-a-passo.md)**

Resumo rápido:

1. Banco: [Neon](https://neon.tech) → copie `DATABASE_URL` com `?sslmode=require`
2. App: [Render](https://render.com) → **New → Blueprint** (usa `render.yaml` na raiz)
3. Preencha `DATABASE_URL`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` fortes
4. Acesse `https://copa-2026-xxxx.onrender.com`

Variáveis documentadas em [`.env.example`](.env.example).

## Arquitetura

```
┌─────────────┐     ┌──────────────┐     ┌────────────────────────────┐
│  Frontend   │────▶│  API Node    │────▶│  PostgreSQL 16           │
│  (HTML/CSS) │     │  Express     │     │  match_results (real/sim)│
└─────────────┘     └──────────────┘     │  pools, predictions, …   │
                                         └────────────────────────────┘
```

| Componente | Descrição |
|------------|-----------|
| `docker-compose.yml` | Orquestra Postgres + app |
| `backend/` | API REST + seed + módulo bolão |
| `js/` | Dashboard + `pool-ui.js` + `boloes-page.js` |
| PostgreSQL | Placares, bolões, palpites, rankings |

### Convivência dos modos

| Modo | Persistência | Quem edita |
|------|--------------|------------|
| **Real** | `match_results.mode = 'real'` | Admin + sync TheSportsDB |
| **Simulação** | `match_results.mode = 'simulation'` | Usuário logado / admin |
| **Bolão** | Tabelas `pools_*` — palpites independentes | Participantes do bolão |

No bolão, a **fonte da verdade dos resultados** continua sendo `match_results` (modo real). O ranking é recalculado quando placares oficiais são inseridos ou alterados.

---

## Modo Bolão (recreativo)

> **⚠ Importante:** bolão recreativo — **sem apostas, pagamentos, prêmios, carteiras, taxas ou transações financeiras**. Combinações entre participantes são de responsabilidade exclusiva dos envolvidos, fora desta plataforma.

### Funcionalidades

- Criar bolão (nome único, partidas, visibilidade, prazos)
- Adesão (pública, por link ou privada com convite)
- Palpites por partida (bloqueio **10 min** antes do jogo, horário **Brasília**)
- Ranking com desempate
- Página pública de rankings (`/boloes`)

### Pontuação (regras padrão v1)

| Acerto | Pontos |
|--------|--------|
| Placar exato | 10 |
| Resultado correto (vitória/empate) | 3 |
| Gols do mandante corretos (sem exato) | +1 |
| Gols do visitante corretos (sem exato) | +1 |
| Sem palpite | 0 |

Regras configuráveis em `pool_score_rules.rules` (JSONB).

### Desempate

1. Maior pontuação total
2. Mais placares exatos
3. Mais acertos de resultado
4. Mais palpites enviados no prazo
5. Participante que aderiu primeiro

### Prazos (timezone `America/Sao_Paulo`)

- **Criação:** até **1 hora** antes da primeira partida incluída
- **Adesão:** até **10 min** antes da primeira partida
- **Palpites:** editáveis até **10 min** antes de cada partida; bloqueados após o apito inicial

### Modelagem (PostgreSQL)

| Tabela | Descrição |
|--------|-----------|
| `pools` | Bolão (`uq_pools_name`, `uq_pools_slug`) |
| `pool_matches` | Partidas do bolão |
| `pool_participants` | Participantes + totais agregados |
| `pool_predictions` | Palpites |
| `pool_invites` | Convites |
| `pool_score_rules` | Regras de pontuação |
| `pool_audit_events` | Auditoria |

Enums: `pool_status`, `pool_visibility`, `pool_invite_status`.

### API — Bolão autenticado

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/pools/check-name?name=` | Verificar nome disponível |
| GET | `/api/pools` | Meus bolões |
| POST | `/api/pools` | Criar bolão |
| GET | `/api/pools/:id` | Detalhes |
| PATCH | `/api/pools/:id` | Editar |
| POST | `/api/pools/:id/join` | Aderir |
| POST | `/api/pools/:id/invites` | Criar convite |
| GET/POST | `/api/pools/:id/predictions` | Listar / salvar palpite |
| GET | `/api/pools/:id/ranking` | Ranking (paginado) |
| GET | `/api/pools/:id/rules` | Regras |
| POST | `/api/pools/:id/recalculate` | Recalcular ranking |

### API — Pública

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/public/pools` | Listar bolões públicos |
| GET | `/api/public/pools/:slug` | Detalhes |
| GET | `/api/public/pools/:slug/ranking` | Ranking |
| GET | `/api/public/pools/:slug/rules` | Regras |

### Recalcular ranking

Automático quando:
- Placar real é salvo (`PUT /api/matches/:id/score`, mode=real)
- Sync TheSportsDB atualiza resultado final

Manual (criador ou admin):

```bash
curl -X POST http://localhost:3000/api/pools/1/recalculate \
  -H "Authorization: Bearer SEU_TOKEN"
```

Idempotente: recalcula pontos por palpite → totais do participante → posições.

### Seeds de exemplo

Após primeiro `docker compose up`, se não houver bolões:

- **Bolão Demo Grupo A** (público) — admin + `joao@demo.local` / `maria@demo.local` (senha `demo1234`)
- Palpites e 1 resultado (GA-3) para demonstrar pontuação

### Testar localmente

```bash
docker compose up --build
# Login admin: admin@copa2026.local / admin123
# Modo Bolão no dashboard → Criar bolão
# Público: http://localhost:3000/boloes
```

---

## Modos Real e Simulação

- **Real** — placares oficiais (sync + admin)
- **Simulação** — cenários hipotéticos, separados no banco
- Tudo salvo no PostgreSQL — recarregar não apaga dados

## Autenticação

| Perfil | Real | Simulação | Bolão |
|--------|------|-----------|-------|
| Visitante | Leitura | — | Ranking público |
| Usuário | Leitura | Edita | Cria/participa |
| Admin | Total | Total | Total |

Admin padrão: `admin@copa2026.local` / `admin123`

## API geral

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/bootstrap?mode=real` | Times, grupos, jogos |
| PUT | `/api/matches/:id/score` | Salvar placar |
| POST | `/api/auth/login` | Login JWT |
| GET | `/api/health` | Status |

## Roadmap futuro

- Ligas privadas e temporadas
- Notificações (convite, prazo de palpite)
- Ranking por rodada/fase
- Estatísticas avançadas e avatares
- Comentários e exportação de palpites

## Estrutura

```
copa-2026/
├── docker-compose.yml
├── copa-2026-dashboard.html
├── boloes.html                  ← ranking público
├── styles.css
├── js/
│   ├── pool-client.js
│   ├── pool-ui.js
│   └── boloes-page.js
├── backend/src/
│   ├── pool/                    ← domínio bolão
│   ├── routes/pools.js
│   ├── routes/public-pools.js
│   └── schema-pools.sql
└── data/
```
