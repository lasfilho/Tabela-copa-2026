# Integração TheSportsDB — arquitetura e troubleshooting

## Visão geral

Toda comunicação com a [TheSportsDB](https://www.thesportsdb.com/) passa pelo **backend** (BFF). O frontend **nunca** chama a API externa diretamente — consome `/api/bootstrap` (PostgreSQL) e `/api/sync/status`.

```
Frontend (app.js)
    ↓ REST
Backend (Express)
    ↓ sports-api/client.js (fila + cache + métricas)
TheSportsDB API
    ↓
PostgreSQL (match_results, match_goals, team_players)
```

## Limites do plano gratuito

| Limite | Valor usado no projeto |
|--------|------------------------|
| Requisições/minuto (oficial) | ~30 por IP |
| Throttling prático | ~2 req/s |
| Config conservadora | **28 req/min**, **500 ms** entre chamadas |

Ao receber HTTP **429**, o sistema entra em backoff global (padrão **15 min**) e usa **cache stale** quando disponível.

## Endpoints TheSportsDB utilizados

| Endpoint | Uso | TTL cache | Chamado por |
|----------|-----|-----------|-------------|
| `eventsseason.php` | Placares e status de todos os jogos da temporada | 4 min | `score-sync`, `squad-sync` |
| `lookuptimeline.php` | Gols/artilheiros (fallback) | 30 min (2 min se live) | `goal-sync` |
| `searchplayers.php` | Fotos de jogadores | 24 h | `player-photo-search` |

**Não usados no runtime:** frontend, scripts manuais de seed usam dados locais FIFA + openfootball.

## Módulos do backend

| Arquivo | Responsabilidade |
|---------|------------------|
| `backend/src/sports-api/config.js` | Variáveis de ambiente e TTLs |
| `backend/src/sports-api/rate-limiter.js` | Fila global, intervalo mínimo, teto/minuto |
| `backend/src/sports-api/cache.js` | Cache em memória + fallback stale |
| `backend/src/sports-api/metrics.js` | Contadores, latência, cache hit/miss |
| `backend/src/sports-api/endpoints.js` | URLs e chaves de cache |
| `backend/src/sports-api/client.js` | Cliente central (`getSeasonEvents`, etc.) |
| `backend/src/sportsdb-fetch.js` | Re-export (compatibilidade) |
| `backend/src/score-sync.js` | Worker periódico de placares |
| `backend/src/goal-sync.js` | Importação de gols (openfootball → API-Football → TheSportsDB) |
| `backend/src/squad-sync.js` | Elencos (FIFA local) + IDs TheSportsDB |
| `backend/src/player-photo-search.js` | Busca de fotos via cliente central |

## Fluxo de sincronização de placares

1. Worker (`startScoreSyncWorker`) roda a cada `SYNC_INTERVAL_MS` (padrão 5 min).
2. Uma única chamada `eventsseason.php` (com cache compartilhado).
3. Compara com `match_results` no PostgreSQL; atualiza só o que mudou.
4. Para jogos encerrados, importa gols com orçamento `SYNC_MAX_TIMELINE_PER_RUN` (padrão 8 timelines/sync).
5. Frontend admin faz poll de `/api/sync/status` a cada 90 s (pausa se aba inativa).

## Variáveis de ambiente

Ver `.env.example`. Principais:

```env
SYNC_ENABLED=true
SYNC_INTERVAL_MS=300000
SPORTS_API_KEY=123
SPORTS_API_MIN_INTERVAL_MS=500
SPORTS_API_MAX_PER_MINUTE=28
SPORTS_API_CACHE=true
SPORTS_CACHE_TTL_SEASON_MS=240000
SYNC_MAX_TIMELINE_PER_RUN=8
SQUAD_SYNC_SKIP_PHOTOS=true   # recomendado em produção
```

## Observabilidade

### `GET /api/sync/status` (autenticado)
Status do worker + campo `sportsApi` com métricas resumidas.

### `GET /api/sync/metrics` (admin)
Detalhes: requisições/min, cache hits, erros por endpoint, fila, fallback stale.

Logs no servidor:
- `[sync] eventsseason do cache` — sem chamada externa
- `[sync] usando cache stale` — API falhou, dados antigos usados
- `[sports-api] CACHE HIT` — com `SPORTS_API_VERBOSE=true`

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Placares não atualizam | Sync desligado ou rate limit 429 | Ver barra de sync; aguardar backoff; usar sync manual |
| "Sync pausado — limite temporário" | 429 da TheSportsDB | Normal; sistema retoma sozinho; não clicar sync repetidamente |
| Lentidão no boot | `syncAllSquads` com fotos | `SQUAD_SYNC_SKIP_PHOTOS=true` em produção |
| Muitas chamadas timeline | Muitos jogos finalizados de uma vez | Reduzir `SYNC_MAX_TIMELINE_PER_RUN` ou aumentar intervalo |
| Dados antigos mas estáveis | Cache stale ativo | Esperado durante indisponibilidade da API |

## Diagnóstico pré-refatoração (resumo)

| Problema | Gravidade | Status |
|----------|-----------|--------|
| `searchplayers` fora do rate limiter global | Alta | **Corrigido** |
| `eventsseason` duplicado (score + squad) | Média | **Corrigido** (cache compartilhado) |
| Sem fila / sem teto por minuto | Alta | **Corrigido** |
| Sem cache de respostas | Alta | **Corrigido** |
| Timeline N× por sync sem limite | Alta | **Corrigido** (orçamento por run) |
| Poll frontend 60s sempre ativo | Baixa | **Melhorado** (90s + pausa aba inativa) |
| Sync manual sem cooldown | Média | **Corrigido** (30s) |
| Frontend chamando API externa | — | Não existia (OK) |

## Recomendações futuras

- Redis para cache em múltiplas instâncias Render
- Sync adaptativo: intervalo menor só quando há jogos `live` no DB
- Persistir métricas em tabela para histórico
- Webhook/push se TheSportsDB premium disponível
