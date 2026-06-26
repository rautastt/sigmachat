// ===================== ADMIN PANEL =====================
'use strict';

let currentAdminTab = 'users';

async function showAdminTab(tab) {
  currentAdminTab = tab;
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-tab').forEach(t => {
    if (t.getAttribute('onclick').includes(`'${tab}'`)) t.classList.add('active');
  });
  const content = document.getElementById('admin-content');
  if (!content) return;
  content.innerHTML = '<p class="text-muted">Loading...</p>';
  try {
    if (tab === 'users') await renderAdminUsers(content);
    else if (tab === 'logs') await renderAdminLogs(content);
    else if (tab === 'bans') await renderAdminBans(content);
  } catch (err) {
    content.innerHTML = `<p class="text-danger">${err.message}</p>`;
  }
}

async function renderAdminUsers(container) {
  const { users } = await get('/api/admin/users');
  container.innerHTML = `
    <table class="admin-table">
      <thead><tr>
        <th>User</th><th>Email</th><th>Level</th><th>Points</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${users.map(u => `
          <tr style="${u.is_banned ? 'opacity:0.5' : ''}">
            <td>
              <strong style="color:${u.name_color||'inherit'}">${escHtml(u.username)}</strong>
              ${u.is_admin ? '<span class="badge badge-admin">ADMIN</span>' : ''}
              ${u.badge_blue ? '<span class="badge badge-blue">✓</span>' : ''}
              ${u.badge_gold ? '<span class="badge badge-gold">★</span>' : ''}
              ${u.badge_rail ? '<span class="badge badge-rail">⚡</span>' : ''}
            </td>
            <td class="text-muted">${escHtml(u.email)}</td>
            <td>Lv.${u.level}</td>
            <td>${u.points}</td>
            <td>${u.is_banned ? '<span class="text-danger">BANNED</span>' : u.timeout_until && new Date(u.timeout_until) > new Date() ? '<span class="text-muted">TIMED OUT</span>' : '<span class="text-success">Active</span>'}</td>
            <td>
              <div class="admin-actions">
                ${u.is_banned
                  ? `<button class="btn-success btn-sm" onclick="adminUnban('${u.id}')">Unban</button>`
                  : `<button class="btn-danger btn-sm" onclick="adminBan('${u.id}','${escHtml(u.username)}')">Ban</button>`}
                <button class="btn-secondary btn-sm" onclick="adminTimeout('${u.id}')">Timeout</button>
                <button class="btn-secondary btn-sm" onclick="adminBadge('${u.id}')">Badges</button>
                <button class="btn-secondary btn-sm" onclick="adminPoints('${u.id}')">Points</button>
                <button class="btn-danger btn-sm" onclick="adminResetXp('${u.id}')">Reset XP</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function renderAdminLogs(container) {
  const { logs } = await get('/api/admin/logs');
  container.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Admin</th><th>Action</th><th>Target</th><th>Reason</th><th>Time</th></tr></thead>
      <tbody>
        ${logs.map(l => `
          <tr>
            <td>${escHtml(l.admin_username || 'System')}</td>
            <td><strong>${escHtml(l.action)}</strong></td>
            <td>${escHtml(l.target_username || '-')}</td>
            <td class="text-muted">${escHtml(l.reason || '-')}</td>
            <td class="text-muted">${formatTime(l.created_at)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function renderAdminBans(container) {
  const { bans } = await get('/api/admin/bans');
  container.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Username</th><th>Email</th><th>Reason</th><th>Date</th><th>Status</th></tr></thead>
      <tbody>
        ${bans.map(b => `
          <tr>
            <td>${escHtml(b.username)}</td>
            <td>${escHtml(b.email)}</td>
            <td class="text-muted">${escHtml(b.reason || '-')}</td>
            <td class="text-muted">${formatTime(b.created_at)}</td>
            <td>${b.unbanned ? '<span class="text-success">Unbanned</span>' : '<span class="text-danger">Active</span>'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function adminBan(userId, username) {
  const reason = prompt(`Ban reason for ${username}:`);
  if (reason === null) return;
  try {
    await post(`/api/admin/ban/${userId}`, { reason });
    toast(`${username} has been banned.`, 'success');
    showAdminTab('users');
  } catch (err) { toast(err.message, 'error'); }
}

async function adminUnban(userId) {
  try {
    await post(`/api/admin/unban/${userId}`, {});
    toast('User unbanned.', 'success');
    showAdminTab('users');
  } catch (err) { toast(err.message, 'error'); }
}

async function adminTimeout(userId) {
  const mins = prompt('Timeout duration in minutes (e.g. 60):');
  if (!mins || isNaN(parseInt(mins))) return;
  try {
    await post(`/api/admin/timeout/${userId}`, { minutes: parseInt(mins) });
    toast('User timed out.', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function adminBadge(userId) {
  openModal(`
    <h3 class="modal-title">Manage Badges</h3>
    <div class="flex flex-col gap-8">
      <button class="btn-primary btn-sm" onclick="grantBadge('${userId}','blue',true)">Grant ✓ Blue</button>
      <button class="btn-secondary btn-sm" onclick="grantBadge('${userId}','blue',false)">Revoke ✓ Blue</button>
      <button class="btn-primary btn-sm" onclick="grantBadge('${userId}','gold',true)">Grant ★ Gold</button>
      <button class="btn-secondary btn-sm" onclick="grantBadge('${userId}','gold',false)">Revoke ★ Gold</button>
      <button class="btn-primary btn-sm" onclick="grantBadge('${userId}','rail',true)">Grant ⚡ Rail</button>
      <button class="btn-secondary btn-sm" onclick="grantBadge('${userId}','rail',false)">Revoke ⚡ Rail</button>
    </div>
  `);
}

async function grantBadge(userId, badge, value) {
  try {
    await post(`/api/admin/badge/${userId}`, { badge, value });
    toast(`Badge ${badge} ${value ? 'granted' : 'revoked'}!`, 'success');
    closeModal();
  } catch (err) { toast(err.message, 'error'); }
}

async function adminPoints(userId) {
  const amt = prompt('Add or remove points (use negative to remove, e.g. -100):');
  if (amt === null || isNaN(parseInt(amt))) return;
  try {
    await post(`/api/admin/points/${userId}`, { amount: parseInt(amt) });
    toast('Points updated!', 'success');
    showAdminTab('users');
  } catch (err) { toast(err.message, 'error'); }
}

async function adminResetXp(userId) {
  if (!confirm('Reset this user\'s XP and level?')) return;
  try {
    await post(`/api/admin/reset-xp/${userId}`, {});
    toast('XP reset.', 'success');
    showAdminTab('users');
  } catch (err) { toast(err.message, 'error'); }
}

async function showAdminActions(userId) {
  closeModal();
  setTimeout(() => { showAdmin(); }, 100);
}
