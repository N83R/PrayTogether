const STORAGE_KEY = 'prayerWallPrototype.v1';
const ADMIN_KEY = 'prayerWallAdminUnlocked';
const ADMIN_PASSWORD = 'prayadmin';
const THEME_KEY = 'prayerWallTheme';
const DEFAULT_EXPIRATION_DAYS = { prayer: 90, praise: 120 };

const samplePosts = [
  { type: 'prayer', body: 'Please pray for my mom as she starts treatment this week. Pray for peace and strength for our family.', prayed_count: 58 },
  { type: 'prayer', body: 'Pray that I would make wise choices at school and have courage to stand for what is right.', prayed_count: 23 },
  { type: 'prayer', body: 'Please pray for my grandfather. He has been lonely since my grandmother passed away.', prayed_count: 41 },
  { type: 'praise', body: 'Praise God, my test results came back clear. Thank you to everyone who prayed.', prayed_count: 0 },
  { type: 'praise', body: 'I was nervous about camp, but God gave me peace and helped me make new friends.', prayed_count: 0 },
  { type: 'prayer', body: 'Pray for my family. Things have been tense at home and I want us to have patience with each other.', prayed_count: 34 },
  { type: 'praise', body: 'My dad got a job after months of searching. God has been faithful to us.', prayed_count: 0 },
];

const blockedTerms = [
  'fuck','shit','bitch','asshole','nigger','fag','kike','retard','kill yourself','kys',
  'porn','sex','rape','suicide pact','terrorist','nazi'
];
const suspiciousTerms = ['hate', 'idiot', 'stupid', 'die', 'drugs', 'weed', 'nude', 'onlyfans'];

let state = loadState();
let route = 'home';
let activePrayer = null;
let rotations = [];


function getStoredTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'light'; }
  catch (e) { return 'light'; }
}
function applyTheme(theme) {
  const clean = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', clean);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', clean === 'dark' ? '#12162A' : '#FFF3DF');
  document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
    btn.textContent = clean === 'dark' ? '☀' : '☾';
    btn.setAttribute('aria-label', clean === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  });
}
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  applyTheme(next);
}
applyTheme(getStoredTheme());

function nowIso() { return new Date().toISOString(); }
function uid(prefix = 'p') { return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`; }
function daysFromNow(days) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString(); }
function getTagId() { return new URLSearchParams(location.search).get('t') || null; }
function mockHash(value) { return value ? btoa(value).replace(/=/g, '').slice(0, 14) : null; }

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved);
  const created = new Date();
  const posts = samplePosts.map((post, i) => ({
    id: uid('post'),
    display_name: null,
    status: 'active',
    report_count: 0,
    tag_id: i % 3 === 0 ? 'DEMO01' : null,
    ip_hash: mockHash(`demo-ip-${i}`),
    device_hash: mockHash(`demo-device-${i}`),
    moderation_reason: null,
    created_at: new Date(created.getTime() - i * 86400000).toISOString(),
    expires_at: daysFromNow(post.type === 'prayer' ? 90 : 120),
    updated_at: nowIso(),
    ...post,
  }));
  const prayer_actions = [];
  posts.filter(p => p.type === 'prayer').forEach(p => {
    for (let i = 0; i < p.prayed_count; i++) {
      prayer_actions.push({ id: uid('act'), post_id: p.id, tag_id: null, ip_hash: null, device_hash: null, created_at: new Date(Date.now() - Math.random() * 1000 * 60 * 60 * 24 * 200).toISOString() });
    }
  });
  return { posts, prayer_actions, reports: [], disabledTags: [], created_at: nowIso() };
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function expireOldPosts() {
  const now = new Date();
  let changed = false;
  state.posts.forEach(post => {
    if (post.status === 'active' && new Date(post.expires_at) < now) {
      post.status = 'expired';
      post.updated_at = nowIso();
      changed = true;
    }
  });
  if (changed) saveState();
}

function moderationCheck(body) {
  const text = body.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  if (blockedTerms.some(term => text.includes(term))) return { status: 'rejected', reason: 'Blocked term or unsafe content detected.' };
  if (suspiciousTerms.some(term => text.includes(term))) return { status: 'pending', reason: 'Needs review due to suspicious wording.' };
  if (body.length < 12) return { status: 'pending', reason: 'Very short submission needs review.' };
  return { status: 'active', reason: null };
}

function activePosts(type = null) {
  expireOldPosts();
  return state.posts.filter(p => p.status === 'active' && (!type || p.type === type));
}
function countActionsSince(days) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return state.prayer_actions.filter(a => new Date(a.created_at) >= since).length;
}
function startRotation(name, fn, ms) {
  stopRotation(name);
  const id = setInterval(fn, ms);
  rotations.push({ name, id });
}
function stopRotation(name = null) {
  rotations = rotations.filter(r => {
    if (!name || r.name === name) { clearInterval(r.id); return false; }
    return true;
  });
}

function navigate(next) {
  stopRotation();
  route = next;
  render();
}

function render() {
  expireOldPosts();
  document.querySelectorAll('[data-nav]').forEach(btn => btn.classList.toggle('active', btn.dataset.nav === route));
  applyTheme(getStoredTheme());
  const app = document.getElementById('app');
  app.innerHTML = '';
  const templateId = route === 'home' ? 'home-template' : route === 'pray' ? 'pray-template' : route === 'submit-prayer' || route === 'submit-praise' ? 'submit-template' : route === 'praise' ? 'praise-template' : 'admin-template';
  app.append(document.getElementById(templateId).content.cloneNode(true));

  if (route === 'home') renderHome();
  if (route === 'pray') renderPray();
  if (route === 'submit-prayer' || route === 'submit-praise') renderSubmit(route === 'submit-prayer' ? 'prayer' : 'praise');
  if (route === 'praise') renderPraise();
  if (route === 'admin') renderAdmin();
}

function renderHome() {
  document.querySelector('[data-active-prayers]').textContent = activePosts('prayer').length;
  const stats = [
    { n: countActionsSince(1), label: 'Prayers Offered Today' },
    { n: countActionsSince(7), label: 'Prayers Offered This Week' },
    { n: countActionsSince(30), label: 'Prayers Offered This Month' },
    { n: countActionsSince(365), label: 'Prayers Offered This Year' },
    { n: state.prayer_actions.length, label: 'Prayers Offered Lifetime' },
  ];
  let statIndex = 0;
  const number = document.querySelector('[data-stat-number]');
  const label = document.querySelector('[data-stat-label]');
  function showStat() {
    number.classList.add('fading'); label.classList.add('fading');
    setTimeout(() => { number.textContent = stats[statIndex].n.toLocaleString(); label.textContent = stats[statIndex].label; number.classList.remove('fading'); label.classList.remove('fading'); statIndex = (statIndex + 1) % stats.length; }, 260);
  }
  showStat();
  startRotation('stats', showStat, 4200);

  const cards = activePosts().sort((a, b) => (b.prayed_count + b.report_count) - (a.prayed_count + a.report_count));
  let boardIndex = 0;
  const board = document.querySelector('[data-board-card]');
  function showBoard() {
    const post = cards[boardIndex % Math.max(cards.length, 1)];
    board.classList.add('fading');
    setTimeout(() => {
      document.querySelector('[data-board-type]').textContent = post ? (post.type === 'prayer' ? 'Prayer' : 'Praise') : 'Prayer';
      document.querySelector('[data-board-type]').classList.toggle('praise', post?.type === 'praise');
      document.querySelector('[data-board-body]').textContent = post ? post.body : 'No active posts yet. Be the first to submit a prayer.';
      board.classList.remove('fading');
      boardIndex++;
    }, 280);
  }
  showBoard();
  startRotation('board', showBoard, 6800);
}

function renderPray() {
  const container = document.querySelector('[data-random-prayer]');
  function pickPrayer(excludeId = null) {
    const prayers = activePosts('prayer').filter(p => p.id !== excludeId);
    activePrayer = prayers[Math.floor(Math.random() * prayers.length)] || null;
    container.innerHTML = activePrayer
      ? `<span class="pill">Prayer</span><p>${escapeHtml(activePrayer.body)}</p><button class="ghost report-btn" data-action="report" data-id="${activePrayer.id}">Report</button>`
      : `<p>There are no active prayer requests right now.</p>`;
  }
  pickPrayer();
  document.querySelector('[data-action="skip"]').onclick = () => pickPrayer(activePrayer?.id);
  document.querySelector('[data-action="prayed"]').onclick = () => {
    if (!activePrayer) return;
    activePrayer.prayed_count += 1;
    activePrayer.updated_at = nowIso();
    state.prayer_actions.push({ id: uid('act'), post_id: activePrayer.id, tag_id: getTagId(), ip_hash: mockHash('prototype-ip'), device_hash: mockHash(navigator.userAgent), created_at: nowIso() });
    saveState();
    document.querySelector('.prayer-focus').innerHTML = `<div class="thanks"><div class="big">🙏</div><h1>Thank you.</h1><p class="lede">Your prayer matters. God knows this person’s name.</p><button class="primary full" data-action="again">Pray for Someone Else</button></div>`;
    document.querySelector('[data-action="again"]').onclick = () => render();
  };
  container.addEventListener('click', e => { if (e.target.dataset.action === 'report') reportPost(e.target.dataset.id); });
}

function renderSubmit(type) {
  document.querySelector('[data-form-eyebrow]').textContent = type === 'prayer' ? 'Ask for prayer' : 'Share encouragement';
  document.querySelector('[data-form-title]').textContent = type === 'prayer' ? 'Submit a Prayer' : 'Submit a Praise';
  document.querySelector('[data-textarea-label]').textContent = type === 'prayer' ? 'Prayer request' : 'Praise report';
  document.querySelector('[data-submit-form]').onsubmit = (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = String(form.get('body') || '').trim();
    const displayName = String(form.get('displayName') || '').trim() || null;
    const mod = moderationCheck(body);
    const post = {
      id: uid('post'), type, body, display_name: displayName, status: mod.status,
      prayed_count: 0, report_count: 0, tag_id: getTagId(), ip_hash: mockHash('prototype-ip'),
      device_hash: mockHash(navigator.userAgent), moderation_reason: mod.reason,
      created_at: nowIso(), expires_at: daysFromNow(DEFAULT_EXPIRATION_DAYS[type]), updated_at: nowIso()
    };
    state.posts.unshift(post); saveState();
    const cls = mod.status === 'active' ? 'good' : mod.status === 'pending' ? '' : 'bad';
    e.currentTarget.closest('.card').innerHTML = `<div class="notice ${cls}">${mod.status === 'active' ? 'Submitted. It is now on the board.' : mod.status === 'pending' ? 'Submitted for review before it appears publicly.' : 'This submission was rejected by the content filter.'}</div><button class="primary full" data-nav="home">Return Home</button>`;
    bindNav();
  };
}

function renderPraise() {
  const praises = activePosts('praise');
  let index = 0;
  const card = document.querySelector('[data-praise-card]');
  function showPraise() {
    const post = praises[index % Math.max(praises.length, 1)];
    card.classList.add('fading');
    setTimeout(() => {
      document.querySelector('[data-praise-body]').textContent = post ? post.body : 'No praise reports yet. Share one to encourage someone.';
      card.classList.remove('fading'); index++;
    }, 280);
  }
  showPraise(); startRotation('praise', showPraise, 6500);
}

function renderAdmin() {
  const unlocked = sessionStorage.getItem(ADMIN_KEY) === 'true';
  document.querySelector('[data-admin-login]').classList.toggle('hidden', unlocked);
  document.querySelector('[data-admin-panel]').classList.toggle('hidden', !unlocked);
  document.querySelector('[data-login-form]')?.addEventListener('submit', e => {
    e.preventDefault();
    if (new FormData(e.currentTarget).get('password') === ADMIN_PASSWORD) { sessionStorage.setItem(ADMIN_KEY, 'true'); render(); }
    else e.currentTarget.insertAdjacentHTML('beforebegin', '<div class="notice bad">Incorrect password.</div>');
  });
  if (!unlocked) return;
  document.querySelector('[data-action="logout"]').onclick = () => { sessionStorage.removeItem(ADMIN_KEY); render(); };
  const filter = document.querySelector('[data-admin-filter]');
  const search = document.querySelector('[data-admin-search]');
  filter.oninput = drawAdminList; search.oninput = drawAdminList;
  drawAdminList();
}

function drawAdminList() {
  const list = document.querySelector('[data-admin-list]');
  if (!list) return;
  const filter = document.querySelector('[data-admin-filter]').value;
  const query = document.querySelector('[data-admin-search]').value.toLowerCase();
  const posts = state.posts.filter(p => {
    const reported = filter === 'reported' && p.report_count > 0;
    const statusMatch = filter === 'all' || p.status === filter || reported;
    return statusMatch && p.body.toLowerCase().includes(query);
  });
  list.innerHTML = posts.map(p => `<article class="card admin-item">
    <span class="pill ${p.type === 'praise' ? 'praise' : ''}">${p.type} / ${p.status}</span>
    <p>${escapeHtml(p.body)}</p>
    <div class="admin-meta">
      <span>reports: ${p.report_count}</span><span>prayed: ${p.prayed_count}</span><span>tag: ${p.tag_id || 'none'}</span><span>expires: ${new Date(p.expires_at).toLocaleDateString()}</span>${p.moderation_reason ? `<span>reason: ${escapeHtml(p.moderation_reason)}</span>` : ''}
    </div>
    <div class="admin-actions">
      <button class="secondary" data-admin-action="approve" data-id="${p.id}">Approve</button>
      <button class="ghost" data-admin-action="hide" data-id="${p.id}">Hide</button>
      <button class="ghost" data-admin-action="extend" data-id="${p.id}">Extend</button>
      <button class="ghost" data-admin-action="delete" data-id="${p.id}">Delete</button>
    </div>
  </article>`).join('') || '<div class="card"><p>No posts match this view.</p></div>';
  list.querySelectorAll('[data-admin-action]').forEach(btn => btn.onclick = () => adminAction(btn.dataset.adminAction, btn.dataset.id));
}

function adminAction(action, id) {
  const post = state.posts.find(p => p.id === id); if (!post) return;
  if (action === 'approve') post.status = 'active';
  if (action === 'hide') post.status = 'hidden';
  if (action === 'delete') post.status = 'deleted';
  if (action === 'extend') post.expires_at = daysFromNow(DEFAULT_EXPIRATION_DAYS[post.type]);
  post.updated_at = nowIso(); saveState(); drawAdminList();
}

function reportPost(id) {
  const post = state.posts.find(p => p.id === id); if (!post) return;
  post.report_count += 1;
  state.reports.push({ id: uid('rep'), post_id: id, reason: null, tag_id: getTagId(), ip_hash: mockHash('prototype-ip'), created_at: nowIso() });
  if (post.report_count >= 3) { post.status = 'hidden'; post.moderation_reason = 'Auto-hidden after multiple reports.'; }
  saveState();
  alert('Thank you. This has been sent for review.');
  render();
}
function escapeHtml(str) { return String(str).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch])); }
function bindNav() { document.querySelectorAll('[data-nav]').forEach(btn => btn.onclick = () => navigate(btn.dataset.nav)); }

document.addEventListener('click', e => {
  const themeBtn = e.target.closest('[data-theme-toggle]');
  if (themeBtn) { toggleTheme(); return; }
  const nav = e.target.closest('[data-nav]');
  if (nav) navigate(nav.dataset.nav);
});

bindNav();
render();
