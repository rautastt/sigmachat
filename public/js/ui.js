// ===================== UI HELPERS =====================
'use strict';

// Invite code from URL on load
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const invite = params.get('invite');
  if (invite) {
    window._pendingInvite = invite;
  }
});

// After login, handle pending invite
const _origShowApp = typeof showApp !== 'undefined' ? showApp : null;

// Check for invite after app init
const _origInitApp = typeof initApp !== 'undefined' ? initApp : null;

async function handlePendingInvite() {
  if (window._pendingInvite) {
    const code = window._pendingInvite;
    window._pendingInvite = null;
    try {
      const { server } = await post(`/api/servers/join/${code}`, {});
      toast(`Joined ${server.name}!`, 'success');
      if (!State.servers.find(s => s.id === server.id)) State.servers.push(server);
      renderDockServers();
      selectServer(server.id);
    } catch (err) {
      toast(err.message, 'error');
    }
  }
}

// Patch initApp to also handle invite
const __origInitApp = window.initApp;
if (typeof initApp === 'function') {
  const original = initApp;
  window.initApp = async function() {
    await original();
    await handlePendingInvite();
  };
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// Auto-resize textarea
document.querySelectorAll('textarea').forEach(ta => {
  ta.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 200) + 'px';
  });
});
