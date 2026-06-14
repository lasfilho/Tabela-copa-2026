/**
 * Página pública — ranking dos bolões (sem login).
 */
import { getToken } from './auth-client.js';
import {
  fetchPublicPools, fetchPublicPool, fetchPublicRanking, fetchPublicRules,
  fetchInvitePreview, joinByToken, savePendingJoinToken,
  statusLabel, formatDate, formatDateShort, POOL_DISCLAIMER,
} from './pool-client.js';
import { esc, matchTeamsHTML } from './pool-match-display.js';

const app = document.getElementById('public-pools-app');
const params = new URLSearchParams(location.search);
const slug = params.get('slug');
const joinToken = params.get('join');
const autoJoin = params.get('auto') === '1';

async function renderList() {
  try {
    const data = await fetchPublicPools();
    const items = data.items ?? [];
    if (!items.length) {
      app.innerHTML = `<div class="pool-empty"><h2>Nenhum bolão público</h2><p>Quando houver bolões públicos, eles aparecerão aqui.</p></div>`;
      return;
    }
    app.innerHTML = `
      <div class="pool-grid">
        ${items.map((p) => `
          <article class="pool-card">
            <h3><a href="/boloes?slug=${encodeURIComponent(p.slug)}">${esc(p.name)}</a></h3>
            <p class="pool-card__meta">${statusLabel(p.status)} · ${p.participantCount ?? 0} participantes</p>
            ${p.description ? `<p>${esc(p.description)}</p>` : ''}
            <a href="/boloes?slug=${encodeURIComponent(p.slug)}" class="btn btn--ghost btn--sm">Ver ranking</a>
          </article>
        `).join('')}
      </div>`;
  } catch (err) {
    app.innerHTML = `<div class="pool-empty"><p>${esc(err.message)}</p></div>`;
  }
}

async function renderDetail(poolSlug, page = 1) {
  app.innerHTML = '<div class="pool-loading">Carregando...</div>';
  try {
    const [detail, ranking, rules] = await Promise.all([
      fetchPublicPool(poolSlug),
      fetchPublicRanking(poolSlug, page),
      fetchPublicRules(poolSlug),
    ]);
    const p = detail.pool;
    const items = ranking.items ?? [];
    const pages = Math.max(1, Math.ceil(ranking.total / ranking.limit));

    app.innerHTML = `
      <a href="/boloes" class="btn btn--ghost btn--sm">← Todos os bolões</a>
      <div class="pool-detail-head">
        <h2>${esc(p.name)}</h2>
        <p>${statusLabel(p.status)} · ${p.participantCount} participantes · ${detail.matches?.length ?? 0} jogos</p>
        ${p.description ? `<p>${esc(p.description)}</p>` : ''}
      </div>

      <section class="card pool-section">
        <h3>Ranking atual</h3>
        <p class="pool-ranking-meta">Atualizado: ${formatDate(ranking.updatedAt)}</p>
        ${items.length ? `
          <table class="pool-table pool-table--ranking">
            <thead><tr><th>#</th><th>Participante</th><th>Pts</th><th>Exatos</th><th>Resultados</th></tr></thead>
            <tbody>${items.map((r) => `<tr>
              <td>${r.rank ?? '—'}</td>
              <td>${p.showParticipants ? esc(r.name) : 'Participante'}</td>
              <td><strong>${r.totalPoints}</strong></td>
              <td>${r.exactHits}</td>
              <td>${r.resultHits}</td>
            </tr>`).join('')}</tbody>
          </table>
          ${pages > 1 ? `<div class="pool-pagination">
            ${page > 1 ? `<a href="/boloes?slug=${encodeURIComponent(poolSlug)}&page=${page - 1}" class="btn btn--ghost btn--sm">← Anterior</a>` : ''}
            <span>Página ${page} de ${pages}</span>
            ${page < pages ? `<a href="/boloes?slug=${encodeURIComponent(poolSlug)}&page=${page + 1}" class="btn btn--ghost btn--sm">Próxima →</a>` : ''}
          </div>` : ''}` : '<p class="pool-empty">Ranking ainda vazio.</p>'}
      </section>

      <section class="card pool-section">
        <h3>Partidas do bolão</h3>
        <ul class="pool-matches-public">
          ${(detail.matches ?? []).map((m) =>
            `<li class="pool-matches-public__item">
              ${matchTeamsHTML(m)}
              <span class="pool-matches-public__when">${formatDateShort(m.match_date)} ${m.match_time?.slice?.(0, 5) ?? ''}</span>
            </li>`
          ).join('')}
        </ul>
      </section>

      <section class="card pool-section pool-rules">
        <h3>Regras de pontuação</h3>
        ${rules.rulesHtml ?? ''}
      </section>`;
  } catch (err) {
    app.innerHTML = `<div class="pool-empty"><p>${esc(err.message)}</p><a href="/boloes">Voltar</a></div>`;
  }
}

async function renderJoinFlow(token) {
  app.innerHTML = '<div class="pool-loading">Verificando convite...</div>';
  try {
    const preview = await fetchInvitePreview(token);
    const loggedIn = !!getToken();

    if (loggedIn && autoJoin) {
      try {
        const result = await joinByToken(token);
        app.innerHTML = `
          <div class="pool-empty pool-join-success">
            <h2>Você entrou no bolão!</h2>
            <p><strong>${esc(preview.poolName)}</strong></p>
            <p>Bolão recreativo — sem premiação pelo sistema.</p>
            <a href="/?mode=pool#pool" class="btn btn--primary">Ir para meus palpites</a>
            ${preview.slug ? `<a href="/boloes?slug=${encodeURIComponent(preview.slug)}" class="btn btn--ghost">Ver ranking</a>` : ''}
          </div>`;
        return;
      } catch (err) {
        if (err.message.includes('já participa')) {
          app.innerHTML = `
            <div class="pool-empty">
              <h2>Você já participa deste bolão</h2>
              <a href="/?mode=pool" class="btn btn--primary">Abrir bolão</a>
            </div>`;
          return;
        }
        throw err;
      }
    }

    app.innerHTML = `
      <div class="card pool-join-card">
        <h2>Convite para bolão</h2>
        <p class="pool-disclaimer"><strong>Recreativo:</strong> ${POOL_DISCLAIMER}</p>
        <h3>${esc(preview.poolName)}</h3>
        ${preview.description ? `<p>${esc(preview.description)}</p>` : ''}
        <p class="pool-card__meta">${statusLabel(preview.status)} · Adesão até ${formatDate(preview.joinDeadline)}</p>
        ${loggedIn
          ? `<button type="button" class="btn btn--primary" id="btn-join-pool">Participar do bolão</button>`
          : `<p>Faça login ou cadastre-se para participar.</p>
             <button type="button" class="btn btn--primary" id="btn-go-login">Entrar / Cadastrar</button>`}
        <a href="/boloes" class="btn btn--ghost btn--sm">Voltar</a>
      </div>`;

    document.getElementById('btn-go-login')?.addEventListener('click', () => {
      savePendingJoinToken(token);
      window.location.href = `/auth.html?redirect=${encodeURIComponent(`/boloes?join=${token}&auto=1`)}`;
    });

    document.getElementById('btn-join-pool')?.addEventListener('click', async () => {
      try {
        await joinByToken(token);
        window.location.href = `/boloes?join=${encodeURIComponent(token)}&auto=1`;
      } catch (err) {
        alert(err.message);
      }
    });
  } catch (err) {
    app.innerHTML = `<div class="pool-empty">
      <h2>Convite inválido</h2>
      <p>${esc(err.message)}</p>
      <a href="/boloes" class="btn btn--ghost">Voltar</a>
    </div>`;
  }
}

if (joinToken) {
  renderJoinFlow(joinToken);
} else if (slug) {
  renderDetail(slug, Number(params.get('page')) || 1);
} else {
  renderList();
}
