// ===================== SIGMA CHAT - APP CORE =====================
'use strict';

const State = {
  currentUser: null,
  currentServer: null,
  currentChannel: null,
  currentDmUser: null,
  servers: [],
  channels: [],
  members: [],
  friends: [],
  dms: [],
  notifications: [],
  typingUsers: {},
  lastMessageId: null,
  memberListOpen: false,
};

// ==================== API HELPERS ====================
async function api(method, url, data) {
  const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
  if (data) opts.body = JSON.stringify(data);
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

const get = (url) => api('GET', url);
const post = (url, data) => api('POST', url, data);
const del = (url) => api('DELETE', url);
const patch = (url, data) => api('PATCH', url, data);

// ==================== TOAST ====================
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => { el.classList.add('removing'); setTimeout(() => el.remove(), 200); }, 3000);
}

// ==================== MODAL ====================
let modalStack = [];
function openModal(html) {
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal(e) {
  if (!e || e.target === document.getElementById('modal-overlay') || !e.target) {
    document.getElementById('modal-overlay').classList.add('hidden');
  }
}

// ==================== INIT ====================
async function init() {
  // Check reset token in URL
  const params = new URLSearchParams(window.location.search);
  if (params.get('token') && window.location.pathname.includes('reset')) {
    showAuthTab('reset');
    document.getElementById('reset-token').value = params.get('token');
  }
  if (params.get('verified') === '1') {
    document.getElementById('verified-banner').classList.remove('hidden');
    setTimeout(() => document.getElementById('verified-banner').classList.add('hidden'), 5000);
  }

  try {
    const { user } = await get('/auth/me');
    State.currentUser = user;
    showApp();
  } catch (_) {
    showAuthScreen();
  }
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  initApp();
}

function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

async function initApp() {
  updateProfileBar();
  await loadServers();
  await loadFriends();
  await loadDms();
  loadNotifications();
  if (window.initSocket) initSocket();

  if (!State.currentUser.email_verified) {
    document.getElementById('verify-bar').classList.remove('hidden');
  }
  if (State.currentUser.is_admin) {
    document.getElementById('admin-btn').style.display = '';
  }
}

// ==================== PROFILE BAR ====================
function updateProfileBar() {
  const u = State.currentUser;
  const avatarEl = document.getElementById('profile-avatar');
  avatarEl.innerHTML = u.avatar
    ? `<img src="${u.avatar}" />`
    : `<div class="avatar-initial">${(u.display_name || u.username)[0].toUpperCase()}</div>`;
  avatarEl.innerHTML += `<div class="status-dot status-${u.status || 'online'}"></div>`;
  document.getElementById('profile-name').textContent = u.display_name || u.username;
  document.getElementById('profile-status').textContent = u.custom_status || u.status || 'online';

  // Apply name color
  if (u.name_color) {
    document.getElementById('profile-name').style.color = u.name_color;
  }
}

// ==================== SERVERS ====================
async function loadServers() {
  try {
    const { servers } = await get('/api/servers');
    State.servers = servers;
    renderDockServers();
  } catch (_) {}
}

function renderDockServers() {
  const dock = document.getElementById('dock-servers');
  dock.innerHTML = '';
  State.servers.forEach(s => {
    const el = document.createElement('div');
    el.className = 'dock-item';
    el.title = s.name;
    el.dataset.serverId = s.id;
    el.innerHTML = s.icon
      ? `<img src="${s.icon}" alt="${s.name}" />`
      : `<span>${s.name[0].toUpperCase()}</span>`;
    el.innerHTML += `<span class="tooltip">${s.name}</span>`;
    el.addEventListener('click', () => selectServer(s.id));
    dock.appendChild(el);
  });
}

async function selectServer(serverId) {
  try {
    const { server, members, channels } = await get(`/api/servers/${serverId}`);
    State.currentServer = server;
    State.channels = channels;
    State.members = members;
    State.currentDmUser = null;

    // Update dock
    document.querySelectorAll('.dock-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-server-id="${serverId}"]`)?.classList.add('active');

    // Show server sidebar
    document.getElementById('home-sidebar').classList.add('hidden');
    document.getElementById('server-sidebar').classList.remove('hidden');
    document.getElementById('server-name-header').textContent = server.name;

    renderChannels();
    renderMemberList();
    showChatView();

    // Join server room via socket
    if (window.socketClient) socketClient.emit('join_server', serverId);

    // Select first channel
    if (channels.length > 0) selectChannel(channels[0].id);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderChannels() {
  const list = document.getElementById('channel-list');
  list.innerHTML = '';
  State.channels.forEach(ch => {
    const el = document.createElement('div');
    el.className = 'sidebar-item';
    el.dataset.channelId = ch.id;
    el.innerHTML = `<span class="channel-hash">#</span><span class="item-name">${ch.name}</span>`;
    el.addEventListener('click', () => selectChannel(ch.id));
    list.appendChild(el);
  });
}

function selectChannel(channelId) {
  State.currentChannel = channelId;
  document.querySelectorAll('#channel-list .sidebar-item').forEach(el => {
    el.classList.toggle('active', el.dataset.channelId === channelId);
  });
  const ch = State.channels.find(c => c.id === channelId);
  document.getElementById('chat-channel-name').textContent = ch ? ch.name : '';
  document.getElementById('chat-channel-topic').textContent = ch?.topic || '';
  document.getElementById('message-input').placeholder = `Message #${ch?.name || ''}`;
  document.getElementById('messages-container').innerHTML = '<button class="load-more-btn" id="load-more-btn" onclick="loadMoreMessages()">Load older messages</button>';
  State.lastMessageId = null;

  if (window.socketClient) {
    socketClient.emit('leave_channel', State.currentChannel);
    socketClient.emit('join_channel', channelId);
  }
  loadMessages(channelId);
}

function renderMemberList() {
  const content = document.getElementById('member-list-content');
  content.innerHTML = '';
  const online = State.members.filter(m => m.status && m.status !== 'offline');
  const offline = State.members.filter(m => !m.status || m.status === 'offline');

  const renderGroup = (label, users) => {
    if (!users.length) return;
    const header = document.createElement('div');
    header.className = 'member-list-header';
    header.textContent = `${label} — ${users.length}`;
    content.appendChild(header);
    users.forEach(m => {
      const el = document.createElement('div');
      el.className = 'member-item';
      el.innerHTML = `
        ${avatarHtml(m, 32)}
        <span class="member-name" style="color:${m.name_color||''}">${m.display_name || m.username}</span>
        ${badgesHtml(m)}
      `;
      el.addEventListener('click', () => showUserProfile(m.id));
      content.appendChild(el);
    });
  };
  renderGroup('Online', online);
  renderGroup('Offline', offline);
}

function toggleMemberList() {
  State.memberListOpen = !State.memberListOpen;
  document.getElementById('app').classList.toggle('member-open', State.memberListOpen);
}

// ==================== HOME / DMs ====================
function showHome() {
  document.querySelectorAll('.dock-item').forEach(el => el.classList.remove('active'));
  document.getElementById('dock-home').classList.add('active');
  document.getElementById('home-sidebar').classList.remove('hidden');
  document.getElementById('server-sidebar').classList.add('hidden');
  State.currentServer = null;
  State.currentChannel = null;
  showView('home-view');
}

async function loadFriends() {
  try {
    const { friends } = await get('/api/friends');
    State.friends = friends;
    renderFriendsList();
    loadFriendRequests();
  } catch (_) {}
}

function renderFriendsList() {
  const list = document.getElementById('friends-list');
  list.innerHTML = '';
  State.friends.forEach(f => {
    const el = document.createElement('div');
    el.className = 'sidebar-item';
    el.innerHTML = `${avatarHtml(f, 28)}<span class="item-name">${f.display_name || f.username}</span>`;
    el.addEventListener('click', () => openDm(f.id, f));
    list.appendChild(el);
  });
}

async function loadDms() {
  try {
    const { conversations } = await get('/api/dms');
    State.dms = conversations;
    renderDmList();
  } catch (_) {}
}

function renderDmList() {
  const list = document.getElementById('dm-list');
  list.innerHTML = '';
  State.dms.forEach(conv => {
    if (!conv.user) return;
    const el = document.createElement('div');
    el.className = 'sidebar-item';
    el.innerHTML = `${avatarHtml(conv.user, 28)}<span class="item-name">${conv.user.display_name || conv.user.username}</span>`;
    el.addEventListener('click', () => openDm(conv.user.id, conv.user));
    list.appendChild(el);
  });
}

async function openDm(userId, userInfo) {
  State.currentDmUser = userId;
  State.currentServer = null;
  State.currentChannel = null;
  showView('dm-view');

  const partner = userInfo || {};
  document.getElementById('dm-partner-name').textContent = partner.display_name || partner.username || userId;
  const avEl = document.getElementById('dm-partner-avatar');
  avEl.innerHTML = partner.avatar ? `<img src="${partner.avatar}" />` : `<div class="avatar-initial">${((partner.display_name || partner.username || 'U')[0]).toUpperCase()}</div>`;
  document.getElementById('dm-message-input').placeholder = `Message ${partner.username || ''}`;

  if (window.socketClient) socketClient.emit('join_dm', userId);
  await loadDmMessages(userId);
}

async function loadDmMessages(userId) {
  try {
    const { messages } = await get(`/api/dms/${userId}`);
    const container = document.getElementById('dm-messages-container');
    container.innerHTML = '';
    messages.forEach(m => container.appendChild(renderDmMessage(m)));
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderDmMessage(m) {
  const div = document.createElement('div');
  div.className = 'message';
  const isMine = m.sender_id === State.currentUser.id;
  div.innerHTML = `
    <div class="msg-avatar">${m.avatar ? `<img src="${m.avatar}" />` : `<div class="avatar-initial">${(m.display_name || m.username || 'U')[0].toUpperCase()}</div>`}</div>
    <div class="msg-body">
      <div class="msg-header">
        <span class="msg-username">${m.display_name || m.username}</span>
        <span class="msg-time">${formatTime(m.created_at)}</span>
      </div>
      <div class="msg-content">${escHtml(m.content)}</div>
    </div>
  `;
  return div;
}

async function sendDm() {
  const input = document.getElementById('dm-message-input');
  const content = input.value.trim();
  if (!content || !State.currentDmUser) return;
  input.value = '';
  try {
    await post(`/api/dms/${State.currentDmUser}`, { content });
  } catch (err) {
    toast(err.message, 'error');
  }
}

function handleDmKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDm(); }
}

// ==================== MESSAGES ====================
async function loadMessages(channelId) {
  try {
    const { messages } = await get(`/api/messages/channel/${channelId}`);
    const container = document.getElementById('messages-container');
    // Remove old msgs but keep load-more btn
    const btn = document.getElementById('load-more-btn');
    container.innerHTML = '';
    if (btn) container.appendChild(btn);

    let lastUser = null, lastTime = null;
    messages.forEach((m, i) => {
      const grouped = lastUser === m.user_id && timeDiff(lastTime, m.created_at) < 5;
      container.appendChild(renderMessage(m, grouped));
      lastUser = m.user_id; lastTime = m.created_at;
    });
    if (messages.length > 0) State.lastMessageId = messages[0].id;
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function loadMoreMessages() {
  if (!State.currentChannel || !State.lastMessageId) return;
  try {
    const { messages } = await get(`/api/messages/channel/${State.currentChannel}?before=${State.lastMessageId}`);
    if (!messages.length) { document.getElementById('load-more-btn')?.remove(); return; }
    const container = document.getElementById('messages-container');
    const btn = document.getElementById('load-more-btn');
    const scrollBefore = container.scrollHeight;
    messages.forEach(m => {
      const el = renderMessage(m);
      btn ? container.insertBefore(el, btn.nextSibling) : container.prepend(el);
    });
    container.scrollTop = container.scrollHeight - scrollBefore;
    State.lastMessageId = messages[0].id;
  } catch (_) {}
}

function renderMessage(m, grouped = false) {
  const div = document.createElement('div');
  div.className = `message${grouped ? ' grouped' : ''}`;
  div.dataset.messageId = m.id;
  div.dataset.userId = m.user_id;
  const nameStyle = m.name_color ? `style="color:${m.name_color}"` : '';
  const effectClass = m.chat_effect ? `effect-${m.chat_effect}` : '';
  const badges = badgesHtml(m);
  const pinBadge = m.is_pinned ? '<span class="msg-pinned-badge">📌</span>' : '';

  const isOwner = m.user_id === State.currentUser.id;
  const canDelete = isOwner || State.currentUser.is_admin ||
    (State.currentServer && State.members.find(mb => mb.id === State.currentUser.id && ['owner','admin','moderator'].includes(mb.role)));

  div.innerHTML = `
    <div class="msg-avatar" onclick="showUserProfile('${m.user_id}')">
      ${m.avatar ? `<img src="${m.avatar}" />` : `<div class="avatar-initial">${(m.display_name || m.username || 'U')[0].toUpperCase()}</div>`}
    </div>
    <div class="msg-body">
      ${!grouped ? `<div class="msg-header">
        <span class="msg-username" onclick="showUserProfile('${m.user_id}')" ${nameStyle}>${m.display_name || m.username}</span>
        ${badges}
        ${pinBadge}
        <span class="msg-time">${formatTime(m.created_at)}</span>
      </div>` : ''}
      <div class="msg-content ${effectClass}">${escHtml(m.content)}${m.edited_at ? '<span class="msg-edited">(edited)</span>' : ''}</div>
    </div>
    <div class="msg-actions">
      ${isOwner ? `<button class="msg-action-btn" onclick="editMessage('${m.id}', this)">✏</button>` : ''}
      ${canDelete ? `<button class="msg-action-btn" onclick="deleteMessage('${m.id}')">🗑</button>` : ''}
      ${State.currentUser.is_admin ? `<button class="msg-action-btn" onclick="togglePin('${m.id}')">📌</button>` : ''}
    </div>
  `;
  return div;
}

async function sendMessage() {
  const input = document.getElementById('message-input');
  const content = input.value.trim();
  if (!content || !State.currentChannel) return;
  input.value = '';
  input.style.height = 'auto';
  if (window.socketClient) socketClient.emit('typing_stop', { channelId: State.currentChannel });
  try {
    await post(`/api/messages/channel/${State.currentChannel}`, { content });
  } catch (err) {
    toast(err.message, 'error');
  }
}

let typingTimeout;
function handleTyping() {
  const input = document.getElementById('message-input');
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  if (!State.currentChannel) return;
  if (window.socketClient) socketClient.emit('typing_start', { channelId: State.currentChannel });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    if (window.socketClient) socketClient.emit('typing_stop', { channelId: State.currentChannel });
  }, 2000);
}

function handleMessageKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

async function deleteMessage(id) {
  if (!confirm('Delete this message?')) return;
  try {
    await del(`/api/messages/${id}`);
    document.querySelector(`[data-message-id="${id}"]`)?.remove();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function editMessage(id, btn) {
  const msgEl = btn.closest('.message');
  const contentEl = msgEl.querySelector('.msg-content');
  const orig = contentEl.dataset.raw || contentEl.textContent;
  const input = document.createElement('textarea');
  input.value = orig;
  input.className = 'field-group input';
  input.style.cssText = 'width:100%;background:var(--bg-input);border:1px solid var(--accent);border-radius:6px;padding:6px;color:var(--text-primary);font-size:14px;resize:vertical';
  contentEl.replaceWith(input);
  input.focus();
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      try {
        await patch(`/api/messages/${id}`, { content: input.value.trim() });
        const newContent = document.createElement('div');
        newContent.className = 'msg-content';
        newContent.dataset.raw = input.value.trim();
        newContent.textContent = input.value.trim();
        input.replaceWith(newContent);
      } catch (err) { toast(err.message, 'error'); }
    }
    if (e.key === 'Escape') {
      const restore = document.createElement('div');
      restore.className = 'msg-content';
      restore.textContent = orig;
      input.replaceWith(restore);
    }
  });
}

async function togglePin(id) {
  try {
    const { pinned } = await post(`/api/messages/${id}/pin`, {});
    toast(pinned ? 'Message pinned.' : 'Message unpinned.', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function showPinned() {
  if (!State.currentChannel) return;
  try {
    const { messages } = await get(`/api/messages/channel/${State.currentChannel}/pinned`);
    const html = messages.length
      ? messages.map(m => `<div style="border-bottom:1px solid var(--border);padding:8px 0"><strong>${m.username}:</strong> ${escHtml(m.content)}</div>`).join('')
      : '<p class="text-muted">No pinned messages.</p>';
    openModal(`<h3 class="modal-title">📌 Pinned Messages</h3><div>${html}</div>`);
  } catch (_) {}
}

// ==================== ADD SERVER ==================== 
function showAddServer() {
  openModal(`
    <h3 class="modal-title">Add a Server</h3>
    <div class="flex flex-col gap-8">
      <button class="btn-primary" onclick="showCreateServer()">Create a Server</button>
      <button class="btn-secondary" onclick="showJoinServer()">Join via Invite</button>
    </div>
  `);
}

function showCreateServer() {
  openModal(`
    <h3 class="modal-title">Create Server</h3>
    <form onsubmit="createServer(event)">
      <div class="field-group mt-8"><label>Server Name</label><input type="text" id="new-server-name" placeholder="My Server" required /></div>
      <div class="field-group mt-8"><label>Description</label><input type="text" id="new-server-desc" placeholder="What's this server about?" /></div>
      <button type="submit" class="btn-primary btn-full mt-16">Create</button>
    </form>
  `);
}

async function createServer(e) {
  e.preventDefault();
  const name = document.getElementById('new-server-name').value;
  const description = document.getElementById('new-server-desc').value;
  try {
    const { server } = await post('/api/servers', { name, description });
    toast('Server created!', 'success');
    closeModal();
    State.servers.push(server);
    renderDockServers();
    selectServer(server.id);
  } catch (err) { toast(err.message, 'error'); }
}

function showJoinServer() {
  openModal(`
    <h3 class="modal-title">Join Server</h3>
    <form onsubmit="joinServer(event)">
      <div class="field-group mt-8"><label>Invite Code</label><input type="text" id="invite-code" placeholder="Enter invite code" required /></div>
      <button type="submit" class="btn-primary btn-full mt-16">Join</button>
    </form>
  `);
}

async function joinServer(e) {
  e.preventDefault();
  const code = document.getElementById('invite-code').value.trim();
  try {
    const { server } = await post(`/api/servers/join/${code}`, {});
    toast(`Joined ${server.name}!`, 'success');
    closeModal();
    if (!State.servers.find(s => s.id === server.id)) State.servers.push(server);
    renderDockServers();
    selectServer(server.id);
  } catch (err) { toast(err.message, 'error'); }
}

function showExplore() {
  openModal(`
    <h3 class="modal-title">Explore Servers</h3>
    <input type="text" id="explore-search" placeholder="Search servers..." oninput="searchServers(this.value)"
      style="width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-primary);margin-bottom:12px" />
    <div id="explore-results"></div>
  `);
  searchServers('');
}

async function searchServers(q) {
  try {
    const { servers } = await get(`/api/servers/search?q=${encodeURIComponent(q)}`);
    const div = document.getElementById('explore-results');
    div.innerHTML = servers.map(s => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
        <div>
          <strong>${escHtml(s.name)}</strong>
          <div class="text-muted" style="font-size:12px">${s.member_count} members</div>
        </div>
        <button class="btn-primary btn-sm" onclick="quickJoin('${s.invite_code}')">Join</button>
      </div>
    `).join('') || '<p class="text-muted">No servers found.</p>';
  } catch (_) {}
}

async function quickJoin(code) {
  try {
    const { server } = await post(`/api/servers/join/${code}`, {});
    toast(`Joined ${server.name}!`, 'success');
    closeModal();
    if (!State.servers.find(s => s.id === server.id)) State.servers.push(server);
    renderDockServers();
    selectServer(server.id);
  } catch (err) { toast(err.message, 'error'); }
}

// ==================== ADD CHANNEL ====================
function showAddChannel() {
  if (!State.currentServer) return;
  openModal(`
    <h3 class="modal-title">Create Channel</h3>
    <form onsubmit="createChannel(event)">
      <div class="field-group mt-8"><label>Channel Name</label><input type="text" id="new-ch-name" placeholder="new-channel" required /></div>
      <div class="field-group mt-8"><label>Topic</label><input type="text" id="new-ch-topic" placeholder="Optional topic" /></div>
      <button type="submit" class="btn-primary btn-full mt-16">Create</button>
    </form>
  `);
}

async function createChannel(e) {
  e.preventDefault();
  const name = document.getElementById('new-ch-name').value;
  const topic = document.getElementById('new-ch-topic').value;
  try {
    const { channel } = await post(`/api/servers/${State.currentServer.id}/channels`, { name, topic });
    State.channels.push(channel);
    renderChannels();
    selectChannel(channel.id);
    closeModal();
    toast('Channel created!', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

// ==================== SERVER SETTINGS ====================
function showServerSettings() {
  if (!State.currentServer) return;
  const s = State.currentServer;
  openModal(`
    <h3 class="modal-title">Server Settings — ${escHtml(s.name)}</h3>
    <form onsubmit="updateServer(event)">
      <div class="field-group"><label>Name</label><input type="text" id="ss-name" value="${escHtml(s.name)}" /></div>
      <div class="field-group"><label>Description</label><input type="text" id="ss-desc" value="${escHtml(s.description || '')}" /></div>
      <button type="submit" class="btn-primary btn-full mt-16">Save</button>
    </form>
    <hr class="divider" />
    <div class="flex gap-8">
      <button class="btn-secondary" onclick="copyInvite()">Copy Invite Link</button>
      <button class="btn-secondary" onclick="regenInvite()">Regen Invite</button>
    </div>
    <hr class="divider" />
    <button class="btn-danger btn-sm" onclick="deleteServer()">Delete Server</button>
  `);
}

async function updateServer(e) {
  e.preventDefault();
  try {
    await patch(`/api/servers/${State.currentServer.id}`, {
      name: document.getElementById('ss-name').value,
      description: document.getElementById('ss-desc').value,
    });
    toast('Saved!', 'success'); closeModal(); loadServers();
  } catch (err) { toast(err.message, 'error'); }
}

function copyInvite() {
  const url = `${location.origin}/?invite=${State.currentServer.invite_code}`;
  navigator.clipboard.writeText(url).then(() => toast('Invite link copied!', 'success'));
}

async function regenInvite() {
  try {
    const { invite_code } = await post(`/api/servers/${State.currentServer.id}/regen-invite`, {});
    State.currentServer.invite_code = invite_code;
    toast('Invite regenerated!', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteServer() {
  if (!confirm(`Delete "${State.currentServer.name}"? This cannot be undone.`)) return;
  try {
    await del(`/api/servers/${State.currentServer.id}`);
    toast('Server deleted.', 'success');
    closeModal();
    State.servers = State.servers.filter(s => s.id !== State.currentServer.id);
    State.currentServer = null;
    renderDockServers();
    showHome();
  } catch (err) { toast(err.message, 'error'); }
}

// ==================== FRIEND REQUESTS ====================
async function loadFriendRequests() {
  try {
    const { incoming } = await get('/api/friends/requests');
    const section = document.getElementById('friend-requests-section');
    if (!incoming.length) { section.innerHTML = ''; return; }
    section.innerHTML = `<h3 style="margin-bottom:12px">Pending Friend Requests</h3>` +
      incoming.map(r => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg-secondary);border-radius:8px;margin-bottom:8px">
          <div class="avatar-sm"><div class="avatar-initial">${r.username[0].toUpperCase()}</div></div>
          <span style="flex:1">${escHtml(r.username)}</span>
          <button class="btn-success btn-sm" onclick="acceptFriend('${r.id}')">Accept</button>
          <button class="btn-danger btn-sm" onclick="declineFriend('${r.id}')">Decline</button>
        </div>
      `).join('');
  } catch (_) {}
}

async function acceptFriend(id) {
  try { await post(`/api/friends/accept/${id}`, {}); toast('Friend added!', 'success'); loadFriends(); }
  catch (err) { toast(err.message, 'error'); }
}

async function declineFriend(id) {
  try { await post(`/api/friends/decline/${id}`, {}); toast('Request declined.'); loadFriendRequests(); }
  catch (err) { toast(err.message, 'error'); }
}

// ==================== USER SEARCH ====================
let searchDebounce;
async function searchUsers(q) {
  clearTimeout(searchDebounce);
  const results = document.getElementById('search-results');
  if (!q.trim()) { results.classList.add('hidden'); return; }
  searchDebounce = setTimeout(async () => {
    try {
      const { users } = await get(`/api/users/search?q=${encodeURIComponent(q)}`);
      results.classList.remove('hidden');
      results.innerHTML = users.map(u => `
        <div class="search-result-item" onclick="showUserProfile('${u.id}')">
          ${avatarHtml(u, 32)}
          <span>${escHtml(u.display_name || u.username)}</span>
        </div>
      `).join('') || '<div class="search-result-item text-muted">No users found.</div>';
    } catch (_) {}
  }, 300);
}

// ==================== USER PROFILE ====================
async function showUserProfile(userId) {
  try {
    const { user } = await get(`/api/users/${userId}`);
    const xpToNext = Math.pow((user.level) / 0.1, 2);
    const xpPct = Math.min(100, Math.round((user.xp / xpToNext) * 100));
    const isMe = userId === State.currentUser.id;
    openModal(`
      <div class="profile-popup" style="margin:-28px">
        <div class="profile-popup-banner">${user.banner ? `<img src="${user.banner}" />` : ''}
          <div class="profile-popup-avatar">${user.avatar ? `<img src="${user.avatar}" />` : `<div class="avatar-initial" style="height:100%;display:flex;align-items:center;justify-content:center;font-size:48px">${(user.display_name||user.username||'U')[0].toUpperCase()}</div>`}
        </div>
        <div class="profile-popup-body">
          <div class="profile-popup-name" style="color:${user.name_color||'var(--text-primary)'}">${escHtml(user.display_name || user.username)}</div>
          <div class="profile-popup-username">@${escHtml(user.username)} ${user.is_admin ? '<span class="badge badge-admin">ADMIN</span>' : ''}</div>
          <div class="profile-popup-badges">
            ${user.badge_blue ? '<span class="badge badge-blue">✓ Verified</span>' : ''}
            ${user.badge_gold ? '<span class="badge badge-gold">★ Gold</span>' : ''}
            ${user.badge_rail ? '<span class="badge badge-rail">⚡ Rail</span>' : ''}
          </div>
          ${user.bio ? `<div class="profile-popup-bio">${escHtml(user.bio)}</div>` : ''}
          <div class="profile-stats">
            <div class="profile-stat"><div class="profile-stat-val">${user.level}</div><div class="profile-stat-label">Level</div></div>
            <div class="profile-stat"><div class="profile-stat-val">${user.points}</div><div class="profile-stat-label">Points</div></div>
            <div class="profile-stat"><div class="profile-stat-val">${user.friend_count}</div><div class="profile-stat-label">Friends</div></div>
          </div>
          <div class="xp-bar" title="${user.xp} XP"><div class="xp-bar-fill" style="width:${xpPct}%"></div></div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${user.xp} XP • Level ${user.level}</div>
          <div style="margin-top:12px;display:flex;gap:8px">
            ${!isMe ? `<button class="btn-primary btn-sm" onclick="openDm('${user.id}',{username:'${user.username}',avatar:'${user.avatar||''}',display_name:'${user.display_name||user.username}'})">Message</button>` : ''}
            ${!isMe && !user.is_friend ? `<button class="btn-secondary btn-sm" onclick="sendFriendRequest('${user.id}')">Add Friend</button>` : ''}
            ${State.currentUser.is_admin ? `<button class="btn-danger btn-sm" onclick="showAdminActions('${user.id}')">Admin</button>` : ''}
          </div>
        </div>
      </div>
    `);
  } catch (err) { toast(err.message, 'error'); }
}

async function sendFriendRequest(userId) {
  try { await post(`/api/friends/request/${userId}`, {}); toast('Friend request sent!', 'success'); }
  catch (err) { toast(err.message, 'error'); }
}

// ==================== NOTIFICATIONS ====================
async function loadNotifications() {
  try {
    const { notifications } = await get('/api/users/me/notifications');
    State.notifications = notifications;
    const unread = notifications.filter(n => !n.read).length;
    const btn = document.querySelector('[onclick="showNotifications()"]');
    if (btn && unread > 0) btn.innerHTML = `🔔<span class="notif-dot"></span>`;
  } catch (_) {}
}

function showNotifications() {
  const n = State.notifications;
  openModal(`
    <h3 class="modal-title">Notifications</h3>
    <button class="btn-secondary btn-sm" onclick="markAllRead()">Mark all read</button>
    <div style="margin-top:12px">
      ${n.length ? n.map(notif => `
        <div style="padding:8px;border-bottom:1px solid var(--border);${!notif.read ? 'background:var(--accent-light);border-radius:6px;margin-bottom:4px' : ''}">
          <div style="font-size:13px">${escHtml(notif.content)}</div>
          <div class="text-muted" style="font-size:11px">${formatTime(notif.created_at)}</div>
        </div>`).join('') : '<p class="text-muted">No notifications.</p>'}
    </div>
  `);
}

async function markAllRead() {
  await post('/api/users/me/notifications/read-all', {});
  State.notifications.forEach(n => n.read = true);
  const btn = document.querySelector('[onclick="showNotifications()"]');
  if (btn) btn.innerHTML = '🔔';
  showNotifications();
}

// ==================== VIEWS ====================
function showChatView() { showView('chat-view'); }
function showView(id) {
  document.querySelectorAll('#main-content .view').forEach(el => el.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

// ==================== SETTINGS ====================
function showSettings() {
  openModal(`
    <h3 class="modal-title">Settings</h3>
    <div class="settings-layout">
      <nav class="settings-nav">
        <div class="settings-nav-item active" onclick="loadSettingsPanel('profile',this)">Profile</div>
        <div class="settings-nav-item" onclick="loadSettingsPanel('account',this)">Account</div>
        <div class="settings-nav-item" onclick="loadSettingsPanel('appearance',this)">Appearance</div>
        <hr class="divider" />
        <div class="settings-nav-item" style="color:var(--danger)" onclick="logout()">Log Out</div>
      </nav>
      <div class="settings-panel" id="settings-panel"></div>
    </div>
  `);
  loadSettingsPanel('profile', document.querySelector('.settings-nav-item.active'));
}

function loadSettingsPanel(panel, el) {
  document.querySelectorAll('.settings-nav-item').forEach(e => e.classList.remove('active'));
  el?.classList.add('active');
  const u = State.currentUser;
  const panels = {
    profile: `
      <div class="settings-section">
        <div class="settings-section-title">Display Name</div>
        <div class="field-group"><input type="text" id="s-display" value="${escHtml(u.display_name || u.username)}" /></div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">Bio</div>
        <div class="field-group"><textarea id="s-bio" rows="3" style="resize:vertical">${escHtml(u.bio || '')}</textarea></div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">Status</div>
        <select id="s-status" style="background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-primary);width:100%">
          <option value="online" ${u.status==='online'?'selected':''}>Online</option>
          <option value="idle" ${u.status==='idle'?'selected':''}>Idle</option>
          <option value="dnd" ${u.status==='dnd'?'selected':''}>Do Not Disturb</option>
          <option value="invisible" ${u.status==='invisible'?'selected':''}>Invisible</option>
        </select>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">Custom Status</div>
        <div class="field-group"><input type="text" id="s-custom-status" value="${escHtml(u.custom_status || '')}" placeholder="What are you up to?" /></div>
      </div>
      <button class="btn-primary" onclick="saveProfile()">Save Profile</button>
      <hr class="divider" />
      <div class="settings-section-title">Avatar</div>
      <input type="file" id="avatar-file" accept="image/*" onchange="uploadAvatar(this)" />
      <hr class="divider" />
      <div class="settings-section-title">Banner</div>
      <input type="file" id="banner-file" accept="image/*" onchange="uploadBanner(this)" />
    `,
    account: `
      <div class="settings-section">
        <div class="settings-section-title">Username</div>
        <div style="display:flex;gap:8px">
          <input type="text" id="s-username" value="${escHtml(u.username)}" style="flex:1;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-primary)" />
          <button class="btn-secondary btn-sm" onclick="changeUsername()">Change</button>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">Email</div>
        <div style="display:flex;gap:8px">
          <input type="email" id="s-email" value="${escHtml(u.email)}" style="flex:1;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-primary)" />
          <input type="password" id="s-email-pass" placeholder="Password" style="width:120px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-primary)" />
          <button class="btn-secondary btn-sm" onclick="changeEmail()">Change</button>
        </div>
      </div>
      <hr class="divider" />
      <div class="settings-section-title">Change Password</div>
      <div class="field-group"><label>Current Password</label><input type="password" id="s-cur-pass" /></div>
      <div class="field-group"><label>New Password</label><input type="password" id="s-new-pass" /></div>
      <button class="btn-primary btn-sm" onclick="changePassword()">Update Password</button>
      <hr class="divider" />
      <button class="btn-danger btn-sm" onclick="logoutAll()">Logout All Devices</button>
    `,
    appearance: `
      <div class="settings-section">
        <div class="settings-section-title">Theme</div>
        <select id="s-theme" style="background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-primary);width:100%" onchange="saveTheme(this.value)">
          <option value="default" ${u.theme==='default'?'selected':''}>Default Dark</option>
          <option value="dark_matter" ${u.theme==='dark_matter'?'selected':''}>Dark Matter</option>
          <option value="sakura" ${u.theme==='sakura'?'selected':''}>Sakura</option>
        </select>
      </div>
    `,
  };
  document.getElementById('settings-panel').innerHTML = panels[panel] || '';
}

function applyTheme(theme) {
  document.body.className = `theme-${theme}`;
}

async function saveTheme(theme) {
  try {
    await post('/auth/update-profile', { theme });
    State.currentUser.theme = theme;
    applyTheme(theme);
    toast('Theme saved!', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function saveProfile() {
  try {
    await post('/auth/update-profile', {
      display_name: document.getElementById('s-display').value,
      bio: document.getElementById('s-bio').value,
      status: document.getElementById('s-status').value,
      custom_status: document.getElementById('s-custom-status').value,
    });
    const { user } = await get('/auth/me');
    State.currentUser = user;
    updateProfileBar();
    toast('Profile saved!', 'success');
    if (window.socketClient) socketClient.emit('set_status', user.status);
  } catch (err) { toast(err.message, 'error'); }
}

async function uploadAvatar(input) {
  const file = input.files[0]; if (!file) return;
  const form = new FormData(); form.append('avatar', file);
  const res = await fetch('/auth/upload-avatar', { method: 'POST', body: form, credentials: 'include' });
  const json = await res.json();
  if (json.success) { State.currentUser.avatar = json.url; updateProfileBar(); toast('Avatar updated!', 'success'); }
  else toast(json.error, 'error');
}

async function uploadBanner(input) {
  const file = input.files[0]; if (!file) return;
  const form = new FormData(); form.append('banner', file);
  const res = await fetch('/auth/upload-banner', { method: 'POST', body: form, credentials: 'include' });
  const json = await res.json();
  if (json.success) { toast('Banner updated!', 'success'); }
  else toast(json.error, 'error');
}

async function changeUsername() {
  const username = document.getElementById('s-username').value;
  try { await post('/auth/change-username', { username }); toast('Username updated!', 'success'); }
  catch (err) { toast(err.message, 'error'); }
}

async function changeEmail() {
  try {
    await post('/auth/change-email', {
      email: document.getElementById('s-email').value,
      password: document.getElementById('s-email-pass').value,
    });
    toast('Check your new email to verify.', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function changePassword() {
  try {
    await post('/auth/change-password', {
      currentPassword: document.getElementById('s-cur-pass').value,
      newPassword: document.getElementById('s-new-pass').value,
    });
    toast('Password changed!', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function logout() {
  await post('/auth/logout', {});
  State.currentUser = null;
  showAuthScreen();
}

async function logoutAll() {
  await post('/auth/logout-all', {});
  State.currentUser = null;
  showAuthScreen();
}

async function resendVerification() {
  try { await post('/auth/resend-verification', {}); toast('Verification email sent!', 'success'); }
  catch (err) { toast(err.message, 'error'); }
}

// ==================== HELPERS ====================
function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function avatarHtml(u, size = 32) {
  const s = size;
  return `<div class="avatar-sm" style="width:${s}px;height:${s}px">
    ${u.avatar ? `<img src="${u.avatar}" />` : `<div class="avatar-initial" style="font-size:${Math.round(s*0.4)}px">${((u.display_name||u.username||'?')[0]).toUpperCase()}</div>`}
    <div class="status-dot status-${u.status||'offline'}"></div>
  </div>`;
}

function badgesHtml(u) {
  let out = '';
  if (u.is_admin) out += '<span class="badge badge-admin">ADMIN</span>';
  if (u.badge_blue) out += '<span class="badge badge-blue">✓</span>';
  if (u.badge_gold) out += '<span class="badge badge-gold">★</span>';
  if (u.badge_rail) out += '<span class="badge badge-rail">⚡</span>';
  return out;
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  return isToday ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function timeDiff(t1, t2) {
  return Math.abs(new Date(t2) - new Date(t1)) / 60000;
}

// ==================== STORE ====================
function showStore() { showView('store-view'); loadStore(); }

// ==================== ADMIN ====================
function showAdmin() { showView('admin-view'); showAdminTab('users'); }

// Start app
window.addEventListener('DOMContentLoaded', init);
