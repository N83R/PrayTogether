const STORAGE_KEY = 'prayerWallPrototype.v1';
const ADMIN_KEY = 'prayerWallAdminUnlocked';
const THEME_KEY = 'prayerWallTheme';
const REPORTER_KEY = 'prayerWallReporterToken';
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

const moderation = window.PrayerWallModeration;

let state = loadState();
let remoteStats = null;
const db = window.PrayerWallDB;
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

function extendExpiration(currentExpiration, additionalDays) {
  const now = new Date();
  const current = new Date(currentExpiration);

  // If it hasn't expired yet, extend from the current expiration.
  // Otherwise, extend from today.
  const start = current > now ? current : now;

  start.setDate(start.getDate() + additionalDays);
  return start.toISOString();
}
function getTagId() { return new URLSearchParams(location.search).get('t') || null; }
function getReporterToken() {
  try {
    let token = localStorage.getItem(REPORTER_KEY);
    if (!token) {
      token = uid('visitor');
      localStorage.setItem(REPORTER_KEY, token);
    }
    return token;
  } catch (e) {
    return uid('visitor');
  }
}
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
function saveState() { if (!db?.configured) localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

async function refreshRemoteState({ includeAll = false } = {}) {
  if (!db?.configured) return;
  const [posts, stats] = await Promise.all([
    db.listPosts({ includeAll }),
    db.getStats()
  ]);
  state.posts = posts;
  remoteStats = stats;
}

function showError(error, fallback = 'Something went wrong. Please try again.') {
  console.error(error);
  alert(error?.message || fallback);
}

function expireOldPosts() {
  if (db?.configured) return;
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

async function moderationCheck(body) {
  if (!moderation) {
    return { status: 'pending', severity: 0, matches: [], reason: 'Moderation dictionary was unavailable; manual review required.' };
  }
  return moderation.check(body);
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
  const stats = remoteStats ? [
    { n: Number(remoteStats.today || 0), label: 'Prayers Offered Today' },
    { n: Number(remoteStats.week || 0), label: 'Prayers Offered This Week' },
    { n: Number(remoteStats.month || 0), label: 'Prayers Offered This Month' },
    { n: Number(remoteStats.year || 0), label: 'Prayers Offered This Year' },
    { n: Number(remoteStats.lifetime || 0), label: 'Prayers Offered Lifetime' },
  ] : [
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
  document.querySelector('[data-action="prayed"]').onclick = async () => {
    if (!activePrayer) return;
    try {
      if (db?.configured) {
        activePrayer.prayed_count = Number(await db.recordPrayer(activePrayer.id, getTagId()));
        remoteStats = await db.getStats();
      } else {
        activePrayer.prayed_count += 1;
        activePrayer.updated_at = nowIso();
        state.prayer_actions.push({ id: uid('act'), post_id: activePrayer.id, tag_id: getTagId(), ip_hash: mockHash('prototype-ip'), device_hash: mockHash(navigator.userAgent), created_at: nowIso() });
        saveState();
      }
    } catch (error) {
      showError(error, 'The prayer could not be recorded.');
      return;
    }
    document.querySelector('.prayer-focus').innerHTML = `<div class="thanks"><div class="big">🙏</div><h1>Thank you.</h1><p class="lede">Your prayer matters. God knows this person’s name.</p><button class="primary full" data-action="again">Pray for Someone Else</button></div>`;
    document.querySelector('[data-action="again"]').onclick = () => render();
  };
  container.addEventListener('click', e => { if (e.target.dataset.action === 'report') reportPost(e.target.dataset.id); });
}

function renderSubmit(type) {
  document.querySelector('[data-form-eyebrow]').textContent = type === 'prayer' ? 'Ask for prayer' : 'Share encouragement';
  document.querySelector('[data-form-title]').textContent = type === 'prayer' ? 'Submit a Prayer' : 'Submit a Praise';
  document.querySelector('[data-textarea-label]').textContent = type === 'prayer' ? 'Prayer request' : 'Praise report';
  document.querySelector('[data-submit-form]').onsubmit = async (e) => {
    e.preventDefault();
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const body = String(form.get('body') || '').trim();
    const displayName = String(form.get('displayName') || '').trim() || null;
    const mod = await moderationCheck(body);
    let post = {
      id: uid('post'), type, body, display_name: displayName, status: mod.status,
      prayed_count: 0, report_count: 0, tag_id: getTagId(), ip_hash: mockHash('prototype-ip'),
      device_hash: mockHash(navigator.userAgent), moderation_reason: mod.reason,
      moderation_source: mod.flagged ? 'automatic_dictionary' : null, moderation_severity: mod.severity || 0, moderation_matches: mod.matches || [],
      created_at: nowIso(), expires_at: daysFromNow(DEFAULT_EXPIRATION_DAYS[type]), updated_at: nowIso()
    };
    try {
      if (db?.configured) {
        const created = await db.createPost(post);
        post = created;
        state.posts.unshift(created);
      } else {
        state.posts.unshift(post);
        saveState();
      }
    } catch (error) {
      showError(error, 'The submission could not be saved.');
      return;
    }
    const finalStatus = post.status;
    const cls = finalStatus === 'active' ? 'good' : '';
    formElement.closest('.card').innerHTML = `<div class="notice ${cls}">${finalStatus === 'active' ? 'Submitted. It is now on the board.' : 'Submitted for administrator review before it appears publicly.'}</div><button class="primary full" data-nav="home">Return Home</button>`;
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
  db?.getSession().then(session => {
    const unlocked = db?.configured ? Boolean(session) : sessionStorage.getItem(ADMIN_KEY) === 'true';
    document.querySelector('[data-admin-login]')?.classList.toggle('hidden', unlocked);
    document.querySelector('[data-admin-panel]')?.classList.toggle('hidden', !unlocked);
    if (unlocked && db?.configured) {
      refreshRemoteState({ includeAll: true }).then(drawAdminList).catch(showError);
    } else if (unlocked) {
      drawAdminList();
    }
  }).catch(showError);

  document.querySelector('[data-login-form]')?.addEventListener('submit', async e => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      if (db?.configured) {
        await db.signIn(String(form.get('email') || ''), String(form.get('password') || ''));
        await refreshRemoteState({ includeAll: true });
      } else {
        sessionStorage.setItem(ADMIN_KEY, 'true');
      }
      render();
    } catch (error) {
      e.currentTarget.insertAdjacentHTML('beforebegin', `<div class="notice bad">${escapeHtml(error.message || 'Unable to sign in.')}</div>`);
    }
  });

  document.querySelector('[data-action="logout"]')?.addEventListener('click', async () => {
    if (db?.configured) await db.signOut();
    sessionStorage.removeItem(ADMIN_KEY);
    await refreshRemoteState();
    render();
  });

  const filter = document.querySelector('[data-admin-filter]');
  const search = document.querySelector('[data-admin-search]');
  if (filter) filter.oninput = drawAdminList;
  if (search) search.oninput = drawAdminList;
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
      <span>reports: ${p.report_count}</span><span>prayed: ${p.prayed_count}</span><span>tag: ${p.tag_id || 'none'}</span><span>expires: ${new Date(p.expires_at).toLocaleDateString()}</span>${p.moderation_source ? `<span>flag source: ${escapeHtml(p.moderation_source)}</span>` : ''}${p.moderation_severity ? `<span>severity: ${p.moderation_severity}/5</span>` : ''}${p.moderation_reason ? `<span>reason: ${escapeHtml(p.moderation_reason)}</span>` : ''}${Array.isArray(p.moderation_matches) && p.moderation_matches.length ? `<span>matches: ${p.moderation_matches.map(m => `${escapeHtml(m.word)} (${escapeHtml((m.categories || []).join(', '))}, ${m.intensity}/5)`).join('; ')}</span>` : ''}
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

async function adminAction(action, id) {
  const post = state.posts.find(p => p.id === id);
  if (!post) return;

  if (action === 'delete') {
    const confirmed = window.confirm(
      'Are you sure you want to permanently delete this post? This cannot be undone.'
    );

    if (!confirmed) return;

    try {
      if (db?.configured) {
        await db.deletePost(id);
      }

      state.posts = state.posts.filter(p => p.id !== id);
      saveState();
      drawAdminList();
    } catch (error) {
      showError(error, 'The post could not be deleted.');
    }

    return;
  }

  const changes = { updated_at: nowIso() };

if (action === 'approve') changes.status = 'active';
if (action === 'hide') changes.status = 'hidden';

if (action === 'extend') {

  const confirmed = window.confirm(
    `Extend this ${post.type} for another ${DEFAULT_EXPIRATION_DAYS[post.type]} days?`
  );

  if (!confirmed) return;

  changes.expires_at = daysFromNow(
    DEFAULT_EXPIRATION_DAYS[post.type]
  );

  if (post.status === 'expired') {
    changes.status = 'active';
  }
}

  try {
    if (db?.configured) {
      const updated = await db.updatePost(id, changes);
      Object.assign(post, updated);
    } else {
      Object.assign(post, changes);
      saveState();
    }

    drawAdminList();
  } catch (error) {
    showError(error);
  }
}

async function reportPost(id) {
  const post = state.posts.find(p => p.id === id); if (!post) return;
  try {
    if (db?.configured) {
      post.report_count = Number(await db.reportPost(id, getTagId(), getReporterToken()));
      if (post.report_count >= 3) post.status = 'pending';
    } else {
      post.report_count += 1;
      state.reports.push({ id: uid('rep'), post_id: id, reason: null, tag_id: getTagId(), ip_hash: mockHash('prototype-ip'), created_at: nowIso() });
      if (post.report_count >= 3) { post.status = 'pending'; post.moderation_source = 'user_reports'; post.moderation_severity = null; post.moderation_reason = 'Pulled from the public wall after 3 user reports.'; }
      saveState();
    }
    alert('Thank you. This has been sent for review.');
    render();
  } catch (error) { showError(error, 'The report could not be submitted.'); }
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
(async () => {
  try { await refreshRemoteState(); }
  catch (error) { showError(error, 'Could not connect to the shared prayer database.'); }
  render();
})();
