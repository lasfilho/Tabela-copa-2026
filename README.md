# Copa do Mundo 2026 — Dashboard com PostgreSQL + Docker

Sistema completo para acompanhar a Copa 2026 com **modo Real** e **Simulação**, persistência no **PostgreSQL** e o mesmo visual do dashboard.

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e rodando

## Iniciar

```bash
cd copa-2026
docker compose up --build
```

Acesse: **http://localhost:3000**

Para parar: `Ctrl+C` e depois `docker compose down`

Para apagar os dados do banco: `docker compose down -v`

## Arquitetura

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│  Frontend   │────▶│  API Node    │────▶│  PostgreSQL 16 │
│  (HTML/CSS) │     │  Express     │     │  match_results │
└─────────────┘     └──────────────┘     └────────────────┘
```

| Componente | Descrição |
|------------|-----------|
| `docker-compose.yml` | Orquestra Postgres + app |
| `backend/` | API REST + seed do calendário |
| `js/` | Dashboard interativo (visual existente) |
| PostgreSQL | Placares real/simulação, preferências |

## Modos Real e Simulação

- **Real** — placares oficiais que você registra após cada jogo
- **Simulação** — cenários hipotéticos, totalmente separados
- Tudo salvo no banco — **recarregar a página não apaga nada**
- Volume Docker `copa_pgdata` mantém dados entre reinícios

## API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/bootstrap?mode=real` | Times, grupos, jogos + placares |
| PUT | `/api/matches/:id/score` | Salvar placar `{ mode, homeScore, awayScore }` |
| DELETE | `/api/scores?mode=real` | Limpar placares do modo |
| PUT | `/api/preferences` | Tema, favoritos, grupos expandidos |
| GET | `/api/health` | Status da API |

## Calendário corrigido

Horários atualizados para **Brasília (BRT)** conforme calendário oficial, por exemplo:

- 11/06 16h — México × África do Sul
- 11/06 23h — Coreia do Sul × Tchéquia
- 13/06 19h — Brasil × Marrocos
- Jogos de madrugada (01h) aparecem no dia correto

## Desenvolvimento local (sem Docker)

```bash
# Terminal 1 — Postgres local ou docker só do db
docker compose up db

# Terminal 2
cd backend
npm install
set DATABASE_URL=postgres://copa:copa2026@localhost:5432/copa2026
npm start
```

## Estrutura

```
copa-2026/
├── docker-compose.yml
├── copa-2026-dashboard.html
├── styles.css
├── js/
├── backend/
│   ├── Dockerfile
│   └── src/
│       ├── index.js
│       ├── schema.sql
│       ├── seed.js
│       └── seed/schedule.js   ← calendário oficial BRT
└── data/                        ← fallback offline
```
