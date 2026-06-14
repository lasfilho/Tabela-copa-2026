/**
 * Painel de configurações — administrador.
 */
import {
  fetchAdminUsers, deleteAdminUser, resetUserPassword, changeOwnPassword,
} from './admin-client.js';

let showToastFn = () => {};
let currentAdminId = null;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function roleLabel(role) {
  return role === 'admin' ? 'Administrador' : 'Usuário';
}

export async function renderAdminSettings(container, opts = {}) {
  showToastFn = opts.showToast ?? showToastFn;
  currentAdminId = opts.currentUser?.id ?? null;

  if (!opts.currentUser || opts.currentUser.role !== 'admin') {
    container.innerHTML = '<div class="empty">Acesso restrito a administradores.</div>';
    return;
  }

  container.innerHTML = `
    <div class="view-header">
      <h1>Configurações</h1>
      <p class="view-subtitle">Administração de conta e usuários do sistema</p>
    </div>

    <div class="settings-grid">
      <section class="card settings-section">
        <h2>Minha senha</h2>
        <form id="admin-change-password-form" class="pool-form">
          <label>Senha atual<input type="password" name="currentPassword" required autocomplete="current-password" /></label>
          <label>Nova senha<input type="password" name="newPassword" required minlength="6" autocomplete="new-password" /></label>
          <label>Confirmar nova senha<input type="password" name="confirmPassword" required minlength="6" autocomplete="new-password" /></label>
          <p class="auth-form__error" id="password-change-error" hidden></p>
          <button type="submit" class="btn btn--primary">Alterar senha</button>
        </form>
      </section>

      <section class="card settings-section settings-section--wide">
        <h2>Usuários cadastrados</h2>
        <p class="pool-form__hint">Excluir um usuário remove bolões criados por ele e participações. Não é possível excluir a si mesmo nem o único admin.</p>
        <div id="admin-users-list" class="pool-loading">Carregando usuários...</div>
      </section>
    </div>`;

  await loadUsersList();
  bindPasswordForm(container);
}

async function loadUsersList() {
  const el = document.getElementById('admin-users-list');
  if (!el) return;
  try {
    const data = await fetchAdminUsers();
    const items = data.items ?? [];
    if (!items.length) {
      el.innerHTML = '<p class="pool-empty">Nenhum usuário.</p>';
      return;
    }
    el.innerHTML = `
      <table class="pool-table">
        <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Cadastro</th><th>Ações</th></tr></thead>
        <tbody>
          ${items.map((u) => {
            const isSelf = u.id === currentAdminId;
            return `<tr>
              <td>${esc(u.name)}${isSelf ? ' <small>(você)</small>' : ''}</td>
              <td>${esc(u.email)}</td>
              <td><span class="badge badge--pool badge--${u.role === 'admin' ? 'open' : 'draft'}">${roleLabel(u.role)}</span></td>
              <td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : '—'}</td>
              <td class="settings-actions">
                <button type="button" class="btn btn--ghost btn--sm" data-reset-pwd="${u.id}" title="Definir nova senha">Redefinir senha</button>
                ${isSelf ? '' : `<button type="button" class="btn btn--ghost btn--sm settings-btn--danger" data-delete-user="${u.id}">Excluir</button>`}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    el.innerHTML = `<p class="pool-empty">${esc(err.message)}</p>`;
  }
}

function bindPasswordForm(container) {
  container.querySelector('#admin-change-password-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('password-change-error');
    errEl.hidden = true;
    const fd = new FormData(e.target);
    const newPwd = fd.get('newPassword');
    const confirm = fd.get('confirmPassword');
    if (newPwd !== confirm) {
      errEl.textContent = 'As senhas não coincidem';
      errEl.hidden = false;
      return;
    }
    try {
      await changeOwnPassword(fd.get('currentPassword'), newPwd);
      showToastFn('Senha alterada com sucesso');
      e.target.reset();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    }
  });
}

export function initAdminSettingsUI(container, opts = {}) {
  showToastFn = opts.showToast ?? (() => {});
  currentAdminId = opts.currentUser?.id ?? null;

  container.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('[data-delete-user]');
    if (delBtn) {
      const id = Number(delBtn.dataset.deleteUser);
      const name = delBtn.closest('tr')?.querySelector('td')?.textContent?.trim();
      if (!confirm(`Excluir o usuário "${name}"? Bolões criados por ele serão removidos.`)) return;
      try {
        await deleteAdminUser(id);
        showToastFn('Usuário excluído');
        await loadUsersList();
      } catch (err) { showToastFn(err.message); }
      return;
    }

    const resetBtn = e.target.closest('[data-reset-pwd]');
    if (resetBtn) {
      const id = Number(resetBtn.dataset.resetPwd);
      const newPwd = prompt('Nova senha para o usuário (mínimo 6 caracteres):');
      if (!newPwd) return;
      if (newPwd.length < 6) {
        showToastFn('Senha deve ter pelo menos 6 caracteres');
        return;
      }
      try {
        await resetUserPassword(id, newPwd);
        showToastFn('Senha redefinida');
      } catch (err) { showToastFn(err.message); }
    }
  });
}
