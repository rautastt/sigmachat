// ===================== STORE =====================
'use strict';

async function loadStore() {
  try {
    const { items } = await get('/api/store');
    const container = document.getElementById('store-content');
    const u = State.currentUser;

    const categories = ['all', 'rail', 'name_color', 'chat_effect', 'theme'];
    container.innerHTML = `
      <div style="margin-bottom:8px">
        <strong>Your points:</strong> <span style="color:var(--gold)">${u.points} pts</span>
      </div>
      <div class="store-categories">
        ${categories.map(c => `<button class="store-cat-btn${c==='all'?' active':''}" onclick="filterStore('${c}',this)">${c==='all'?'All':c.replace('_',' ').replace(/\b\w/g,l=>l.toUpperCase())}</button>`).join('')}
      </div>
      <div class="store-grid" id="store-grid">
        ${items.map(item => storeItemHtml(item)).join('')}
      </div>
    `;
  } catch (err) {
    toast(err.message, 'error');
  }
}

function storeItemHtml(item) {
  const icons = { rail: '⚡', name_color: '🎨', chat_effect: '✨', theme: '🎭' };
  return `
    <div class="store-item" data-type="${item.type}">
      <div class="store-item-icon">${icons[item.type] || '📦'}</div>
      <div class="store-item-name">${escHtml(item.name)}</div>
      <div class="store-item-desc">${escHtml(item.description)}</div>
      <div class="store-item-price">${item.price} pts</div>
      <div class="store-item-btn">
        ${item.owned
          ? '<button class="btn-secondary btn-sm btn-full" disabled>Owned</button>'
          : `<button class="btn-primary btn-sm btn-full" onclick="buyItem('${item.id}','${escHtml(item.name)}',${item.price})">Buy</button>`}
      </div>
    </div>
  `;
}

function filterStore(cat, btn) {
  document.querySelectorAll('.store-cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const grid = document.getElementById('store-grid');
  if (!grid) return;
  grid.querySelectorAll('.store-item').forEach(el => {
    el.style.display = (cat === 'all' || el.dataset.type === cat) ? '' : 'none';
  });
}

async function buyItem(itemId, name, price) {
  if (!confirm(`Buy "${name}" for ${price} points?`)) return;
  try {
    const { newPoints } = await post(`/api/store/buy/${itemId}`, {});
    toast(`Purchased ${name}!`, 'success');
    State.currentUser.points = newPoints;
    updateProfileBar();
    loadStore();
    // Refresh user data
    const { user } = await get('/auth/me');
    State.currentUser = user;
  } catch (err) {
    toast(err.message, 'error');
  }
}
