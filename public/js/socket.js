// ===================== SOCKET.IO CLIENT =====================
'use strict';

let socketClient;

function initSocket() {
  socketClient = io({ withCredentials: true });

  socketClient.on('connect', () => {
    console.log('Socket connected:', socketClient.id);
  });

  socketClient.on('disconnect', () => {
    console.log('Socket disconnected');
  });

  // New message in channel
  socketClient.on('new_message', (msg) => {
    if (msg.channel_id !== State.currentChannel) return;
    const container = document.getElementById('messages-container');
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    const lastMsg = container.querySelector('.message:last-child');
    const lastUserId = lastMsg?.dataset?.messageId ? lastMsg.dataset.userId : null;
    const grouped = lastUserId === msg.user_id;
    const el = renderMessage(msg, grouped);
    container.appendChild(el);
    if (atBottom) container.scrollTop = container.scrollHeight;
  });

  // Message deleted
  socketClient.on('message_deleted', ({ messageId }) => {
    document.querySelector(`[data-message-id="${messageId}"]`)?.remove();
  });

  // Message edited
  socketClient.on('message_edited', ({ messageId, content }) => {
    const el = document.querySelector(`[data-message-id="${messageId}"] .msg-content`);
    if (el) { el.textContent = content; el.dataset.raw = content; }
  });

  // Message pinned
  socketClient.on('message_pinned', ({ messageId, pinned }) => {
    const header = document.querySelector(`[data-message-id="${messageId}"] .msg-header`);
    if (!header) return;
    const badge = header.querySelector('.msg-pinned-badge');
    if (pinned && !badge) header.insertAdjacentHTML('beforeend', '<span class="msg-pinned-badge">📌</span>');
    else if (!pinned && badge) badge.remove();
  });

  // New DM
  socketClient.on('new_dm', (msg) => {
    const partnerId = msg.sender_id === State.currentUser.id ? msg.receiver_id : msg.sender_id;
    if (State.currentDmUser === partnerId) {
      const container = document.getElementById('dm-messages-container');
      container.appendChild(renderDmMessage(msg));
      container.scrollTop = container.scrollHeight;
    } else if (msg.sender_id !== State.currentUser.id) {
      toast(`New message from ${msg.username}`, 'info');
    }
    loadDms();
  });

  // Group message
  socketClient.on('new_group_message', (msg) => {
    toast(`New group message from ${msg.username}`, 'info');
  });

  // Typing
  socketClient.on('user_typing', ({ userId, username, channelId }) => {
    if (channelId !== State.currentChannel || userId === State.currentUser.id) return;
    if (!State.typingUsers[userId]) State.typingUsers[userId] = { username, timeout: null };
    clearTimeout(State.typingUsers[userId].timeout);
    State.typingUsers[userId].timeout = setTimeout(() => {
      delete State.typingUsers[userId];
      renderTyping();
    }, 3000);
    renderTyping();
  });

  socketClient.on('user_stop_typing', ({ userId, channelId }) => {
    if (channelId !== State.currentChannel) return;
    if (State.typingUsers[userId]) {
      clearTimeout(State.typingUsers[userId].timeout);
      delete State.typingUsers[userId];
      renderTyping();
    }
  });

  function renderTyping() {
    const users = Object.values(State.typingUsers).map(u => u.username);
    const el = document.getElementById('typing-indicator');
    if (!el) return;
    if (!users.length) { el.textContent = ''; return; }
    const names = users.slice(0, 3).join(', ');
    el.textContent = `${names} ${users.length === 1 ? 'is' : 'are'} typing...`;
  }

  // Status changes
  socketClient.on('status_change', ({ userId, status }) => {
    // Update member list
    const member = State.members.find(m => m.id === userId);
    if (member) { member.status = status; renderMemberList(); }
    if (userId === State.currentUser.id) {
      const dot = document.querySelector('#profile-avatar .status-dot');
      if (dot) dot.className = `status-dot status-${status}`;
    }
  });

  // Channel events
  socketClient.on('channel_created', (ch) => {
    if (State.currentServer && ch.server_id === State.currentServer.id) {
      State.channels.push(ch);
      renderChannels();
    }
  });

  socketClient.on('channel_deleted', ({ channelId }) => {
    State.channels = State.channels.filter(c => c.id !== channelId);
    renderChannels();
    if (State.currentChannel === channelId) {
      State.currentChannel = null;
      showView('home-view');
    }
  });

  // Member joined
  socketClient.on('member_joined', ({ serverId, userId }) => {
    if (State.currentServer?.id === serverId) selectServer(serverId);
  });

  // Admin events
  socketClient.on('banned', ({ reason }) => {
    alert('Your account has been banned.' + (reason ? ' Reason: ' + reason : ''));
    logout();
  });

  socketClient.on('timed_out', ({ until }) => {
    toast(`You have been timed out until ${new Date(until).toLocaleString()}.`, 'error');
  });

  socketClient.on('kicked', ({ serverId }) => {
    if (State.currentServer?.id === serverId) {
      toast('You were kicked from the server.', 'error');
      State.servers = State.servers.filter(s => s.id !== serverId);
      renderDockServers();
      showHome();
    }
  });

  socketClient.on('badge_updated', ({ badge, value }) => {
    State.currentUser[`badge_${badge}`] = value;
    toast(`Badge ${badge} ${value ? 'granted' : 'removed'}!`);
  });

  socketClient.on('friend_request', ({ from, username }) => {
    toast(`Friend request from ${username}!`, 'info');
    loadFriendRequests();
    loadNotifications();
  });

  socketClient.on('friend_accepted', ({ userId }) => {
    toast('Friend request accepted!', 'success');
    loadFriends();
  });
}
