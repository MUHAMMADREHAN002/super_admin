/* ═══════════════════════════════════════
   INVOICEAI — Command Centre  script.js
═══════════════════════════════════════ */
const API = '/api';
let token       = localStorage.getItem('token');
let currentUser = null;
let currentRole = null;
let widgetCount = 0;

// Per-widget state: { chartType, timeRange }
const widgetState = {};

const $           = id => document.getElementById(id);
const appShell     = $('app');
const loginPage    = $('login-page');
const superAdminPanel = $('superadmin-panel');
const adminPanel  = $('admin-panel');
const dashCanvas = $('widget-canvas');
const usersBody   = $('users-table-body');
const auditBody   = $('audit-table-body');
const createAdminBtn = $('sa-create-admin-btn');
const saveBtn     = null;

// ── Global 401 Interceptor (auth expiry only) ────────────────────────────────
axios.interceptors.response.use(
  response => response,
  error => {
    const status = error?.response?.status;
    const detail = error?.response?.data?.detail || '';
    // ONLY auto-logout on true authentication failure (not business-logic 403s)
    if (status === 401 ||
        detail.includes('Could not validate') ||
        detail.includes('Inactive user')) {
      localStorage.removeItem('token');
      token = null;
      if (appShell) appShell.style.display = 'none';
      if (loginPage) loginPage.style.display = 'flex';
      setTimeout(() => {
        const t = document.createElement('div');
        t.className = 'toast error';
        t.innerText = 'Session expired. Please log in again.';
        document.body.appendChild(t);
        setTimeout(() => t.classList.add('show'), 10);
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3200);
      }, 300);
    }
    return Promise.reject(error);
  }
);

Chart.defaults.color       = '#4b5563';
Chart.defaults.borderColor = 'rgba(59,130,246,0.15)';
Chart.defaults.font.family = 'Inter, system-ui, sans-serif';

const PALETTE = ['#4f46e5','#14b8a6','#f59e0b','#ec4899','#38bdf8','#a78bfa'];

const GRAPHS = {
  bar      : { label:'Revenue Forecast', emoji:'📊', color:'#4f46e5' },
  line     : { label:'Growth Trend',     emoji:'📈', color:'#14b8a6' },
  pie      : { label:'Market Share',     emoji:'🥧', color:'#f59e0b' },
  doughnut : { label:'Device Split',     emoji:'🍩', color:'#38bdf8' },
  sessions : { label:'Live Sessions',    emoji:'⚡', color:'#ec4899' }
};

async function init() {
  if (!token) {
    appShell.style.display = 'none';
    loginPage.style.display = 'flex';
    return;
  }

  try {
    await loadProfile();
    appShell.style.display = 'flex';
    loginPage.style.display = 'none';
    switchView('dashboard');
    await Promise.all([loadKPI(), loadSavedLayout()]);
  } catch {
    localStorage.removeItem('token');
    appShell.style.display = 'none';
    loginPage.style.display = 'flex';
  }
}

// ── Form Handlers ────────────────────────────────────────────────────────────
const loginForm = $('login-form');
if (loginForm) {
  loginForm.onsubmit = (e) => { e.preventDefault(); $('login-btn').click(); };
}

const createForm = $('admin-create-form');
if (createForm) {
  createForm.onsubmit = (e) => { e.preventDefault(); $('submit-admin').click(); };
}

$('login-btn').onclick = async () => {
  const email    = $('login-email').value.trim();
  const password = $('login-pass').value;

  if (!email || !password) {
    toast('Email and password are required.', true);
    return;
  }

  try {
    const r = await axios.post(`${API}/auth/login`, { email, password });
    token = r.data.access_token;
    localStorage.setItem('token', token);
    await loadProfile();
    
    // Redirect or show based on role
    const role = currentUser.role;
    if (role === 'super_admin' || role === 'admin') {
      loginPage.style.display = 'none';
      appShell.style.display = 'flex';
      setupUI();
      switchView('dashboard');
      await Promise.all([loadKPI(), loadSavedLayout()]);
    } else {
      // User / Worker role
      loginPage.style.display = 'none';
      appShell.style.display = 'flex';
      setupUI();
      switchView('dashboard');
      await Promise.all([loadKPI(), loadSavedLayout()]);
    }
  } catch (e) {
    const msg = e.response?.data?.detail || 'Authentication failed.';
    $('login-error').innerText = msg;
    $('login-btn').innerText = 'Authenticate Access';
    $('login-btn').disabled = false;
  }
};

function logout() {
  localStorage.removeItem('token');
  appShell.style.display = 'none';
  loginPage.style.display = 'flex';
  token = null;
  currentRole = null;
  document.title = 'RFI Agent | Super Admin Panel';
}

$('sa-logout-btn').onclick = logout;
$('admin-logout-btn').onclick = logout;
if ($('user-logout-btn')) $('user-logout-btn').onclick = logout;

async function loadProfile() {
  const r = await auth_get('/auth/me');
  currentUser = r.data;
  currentRole = currentUser.role;

  if (currentUser.role === 'super_admin') {
    superAdminPanel.style.display = 'flex';
    adminPanel.style.display = 'none';
    document.title = 'RFI Agent | Super Admin Panel';
    $('sa-avatar-letter').innerText = (currentUser.full_name || currentUser.email)[0].toUpperCase();
    $('sa-role').innerText  = 'SUPER ADMIN';
    $('sa-role').style.background = '#6c63ff';
    $('sa-email').innerText = currentUser.email;
    createAdminBtn.style.display = 'inline-flex';
  } else if (currentUser.role === 'admin') {
    superAdminPanel.style.display = 'none';
    adminPanel.style.display = 'flex';
    document.title = 'RFI Agent | Admin Panel';
    $('admin-avatar-letter').innerText = (currentUser.full_name || currentUser.email)[0].toUpperCase();
    if ($('profile-name-display')) $('profile-name-display').innerText = currentUser.full_name || 'Admin';
    if ($('profile-email-display')) $('profile-email-display').innerText = currentUser.email;
    createAdminBtn.style.display = 'none';
  } else {
    // Worker / Regular User
    superAdminPanel.style.display = 'none';
    adminPanel.style.display = 'none';
    if ($('user-panel')) $('user-panel').style.display = 'flex';
    document.title = 'RFI Agent | Worker Panel';
    $('user-avatar-letter').innerText = (currentUser.full_name || currentUser.email)[0].toUpperCase();
    $('u-profile-name').innerText = currentUser.full_name || 'Worker';
    $('u-profile-email').innerText = currentUser.email;
    if (createAdminBtn) createAdminBtn.style.display = 'none';
  }
}

function refreshActiveView() {
  const activeView = document.querySelector('.nav-btn.active')?.dataset?.view;
  if (activeView === 'users') fetchUsers();
  if (activeView === 'admins') fetchAdmins();
  if (activeView === 'dashboard') init();
  if (activeView === 'audit') fetchLogs();
}

function switchView(view) {
  document.querySelectorAll('.nav-btn').forEach(b => {
    if (currentRole === 'super_admin') {
      b.classList.toggle('active', b.dataset.view === view);
    } else if (currentRole === 'admin') {
      if (b.dataset.view === 'audit' || b.dataset.view === 'admins') return;
      b.classList.toggle('active', b.dataset.view === view);
    } else {
      // Worker role is locked to dashboard
      if (b.dataset.view !== 'dashboard') return;
      b.classList.toggle('active', b.dataset.view === view);
    }
  });
  
  document.querySelectorAll('.view-container').forEach(c => c.style.display = 'none');
  const el = $(`${view}-view`);
  if (el) el.style.display = 'block';

  const titles = { 
    dashboard: currentRole === 'super_admin' ? 'Super Admin Dashboard' : 'Admin Dashboard',
    users: currentRole === 'super_admin' ? 'User Management' : 'User Management',
    audit: 'System Surveillance',
    admins: 'Admin Account Management'
  };
  $('view-title').innerText = titles[view] || view;

  if (currentRole === 'super_admin') {
    $('sa-widget-store-section').style.display = view === 'dashboard' ? 'block' : 'none';
    const saSaveBtn = $('sa-save-layout');
    if (saSaveBtn) saSaveBtn.style.display = view === 'dashboard' ? 'inline-flex' : 'none';
  } else if (currentRole === 'admin') {
    $('admin-widget-store-section').style.display = view === 'dashboard' ? 'block' : 'none';
    const adminSaveBtn = $('admin-save-layout');
    if (adminSaveBtn) adminSaveBtn.style.display = view === 'dashboard' ? 'inline-flex' : 'none';
  }

  // Toggle log level filter for audit view
  if (view === 'audit' && currentRole === 'super_admin') {
      $('log-level-filter').style.display = 'block';
  } else {
      $('log-level-filter').style.display = 'none';
  }

  if (view === 'users') {
    fetchUsers();
  } else if (view === 'audit') {
    fetchLogs();
  } else if (view === 'admins') {
    fetchAdmins();
  }
}

document.querySelectorAll('.nav-btn').forEach(btn =>
  btn.onclick = () => switchView(btn.dataset.view)
);

async function loadKPI() {
  try {
    const r = await auth_get('/admin/stats');
    const s = r.data;
    animateCount($('kpi-val-users'),    s.total_threads); // Displaying Threads as primary growth metric
    animateCount($('kpi-val-active'),   s.total_contacts); // Displaying Contacts
    animateCount($('kpi-val-sessions'), s.pending_tasks); // Displaying Pending Tasks
    animateCount($('kpi-val-widgets'),  s.total_users);  // Displaying Managed Users
    
    // Update labels to reflect real data
    document.querySelectorAll('.kpi-label')[0].innerText = 'Active Threads';
    document.querySelectorAll('.kpi-label')[1].innerText = 'Total Contacts';
    document.querySelectorAll('.kpi-label')[2].innerText = 'Pending Tasks';
    document.querySelectorAll('.kpi-label')[3].innerText = 'Managed Users';
  } catch (e) { console.warn('KPI load failed', e); }
}

function animateCount(el, target) {
  if (isNaN(target) || target === null || target === undefined) {
    el.innerText = '0';
    return;
  }
  let start = 0;
  const step = Math.max(1, Math.ceil(target / 42));
  const tick = setInterval(() => {
    start = Math.min(start + step, target);
    el.innerText = start.toLocaleString();
    if (start >= target) clearInterval(tick);
  }, 28);
}

let dragType = null;

document.querySelectorAll('.graph-card').forEach(card => {
  card.addEventListener('dragstart', e => {
    dragType = card.dataset.type;
    e.dataTransfer.effectAllowed = 'copy';
    setTimeout(() => card.style.opacity = '0.4', 0);
  });
  card.addEventListener('dragend', () => card.style.opacity = '');
});

dashCanvas.addEventListener('dragover', e => {
  e.preventDefault();
  dashCanvas.classList.add('drop-active');
});

dashCanvas.addEventListener('dragleave', e => {
  dashCanvas.classList.remove('drop-active');
});

dashCanvas.addEventListener('drop', e => {
  e.preventDefault();
  dashCanvas.classList.remove('drop-active');
  if (dragType) { addWidget(dragType); dragType = null; }
});

async function addWidget(type, savedW, savedH) {
  const g = GRAPHS[type];
  if (!g) return;

  $('empty-state').style.display = 'none';
  widgetCount++;
  const cid    = `chart-${widgetCount}`;
  const wid    = `widget-${widgetCount}`; // unique widget id

  // Init per-widget state
  widgetState[wid] = { chartType: type, timeRange: '30d' };

  const wide = (type === 'bar' || type === 'line');
  const el = document.createElement('div');
  el.className = 'chart-widget' + (wide ? ' w2' : '');
  el.dataset.type = type;
  el.dataset.wid  = wid;
  if (savedH) el.style.minHeight = savedH + 'px';

  // Chart type options (exclude sessions)
  const chartTypeOptions = type === 'sessions' ? '' : `
    <select class="widget-select widget-chart-type" title="Change chart type">
      <option value="bar"      ${type==='bar'      ? 'selected':''}>📊 Bar</option>
      <option value="line"     ${type==='line'     ? 'selected':''}>📈 Line</option>
      <option value="pie"      ${type==='pie'      ? 'selected':''}>🥧 Pie</option>
      <option value="doughnut" ${type==='doughnut' ? 'selected':''}>🍩 Doughnut</option>
    </select>`;

  el.innerHTML = `
    <div class="widget-header" style="border-top:3px solid ${g.color}">
      <div class="widget-header-left">
        <span class="widget-emoji" style="font-size:1.1rem">${g.emoji}</span>
        <span class="widget-title">${g.label}</span>
      </div>
      <div class="widget-header-right">
        <select class="widget-select widget-time-filter" title="Filter by time range">
          <option value="1h">1 Hour</option>
          <option value="6h">6 Hours</option>
          <option value="12h">12 Hours</option>
          <option value="24h">24 Hours</option>
          <option value="7d">7 Days</option>
          <option value="30d" selected>30 Days</option>
        </select>
        ${chartTypeOptions}
        <button class="widget-refresh" title="Refresh"><i class="fas fa-sync-alt"></i></button>
        <button class="widget-close"   title="Remove"><i class="fas fa-times"></i></button>
      </div>
    </div>
    <div class="widget-body">
      ${type === 'sessions'
        ? `<div class="sessions-widget">
             <div class="sessions-number">—</div>
             <div class="sessions-label">Live Active Sessions</div>
             <div class="sessions-trend">↑ Refreshed live</div>
           </div>`
        : `<canvas id="${cid}"></canvas>`
      }
    </div>`;

  dashCanvas.appendChild(el);
  await renderWidgetData(type, cid, el, wid);

  // Close button
  el.querySelector('.widget-close').onclick = () => {
    delete widgetState[wid];
    el.remove();
    if (!dashCanvas.querySelector('.chart-widget')) $('empty-state').style.display = 'flex';
  };

  // Refresh button
  el.querySelector('.widget-refresh').onclick = async () => {
    const cv = el.querySelector('canvas');
    if (cv) { const old = Chart.getChart(cv); if (old) old.destroy(); }
    const state = widgetState[wid];
    await renderWidgetData(state.chartType, cid, el, wid);
  };

  // Time filter dropdown
  const timeSelect = el.querySelector('.widget-time-filter');
  if (timeSelect) {
    timeSelect.onchange = async () => {
      widgetState[wid].timeRange = timeSelect.value;
      const cv = el.querySelector('canvas');
      if (cv) { const old = Chart.getChart(cv); if (old) old.destroy(); }
      await renderWidgetData(widgetState[wid].chartType, cid, el, wid);
    };
  }

  // Chart type dropdown
  const chartSelect = el.querySelector('.widget-chart-type');
  if (chartSelect) {
    chartSelect.onchange = async () => {
      const newType = chartSelect.value;
      widgetState[wid].chartType = newType;
      // Update emoji/title
      const ng = GRAPHS[newType];
      if (ng) {
        el.querySelector('.widget-emoji').textContent = ng.emoji;
        el.querySelector('.widget-title').textContent  = ng.label;
        el.querySelector('.widget-header').style.borderTopColor = ng.color;
      }
      const cv = el.querySelector('canvas');
      if (cv) { const old = Chart.getChart(cv); if (old) old.destroy(); }
      await renderWidgetData(newType, cid, el, wid);
    };
  }
}

async function renderWidgetData(type, cid, el, wid) {
  try {
    const timeRange = (wid && widgetState[wid]) ? widgetState[wid].timeRange : '30d';
    const r = await auth_get(`/admin/stats/kpi?time_range=${timeRange}`);
    const d = r.data;
    if (type === 'sessions') {
      el.querySelector('.sessions-number').innerText = d.sessions.toLocaleString();
    } else {
      // Use data from matching base type or fallback
      const baseType = ['bar','line'].includes(type) ? type : (d[type] ? type : 'bar');
      const chartData = d[baseType] || d['bar'] || { labels: [], data: [] };
      buildChart(type, cid, chartData);
    }
  } catch (e) {
    console.warn('renderWidgetData failed, using mock data', e);
    buildChart(type, cid, getMockData(type, wid));
  }
}

function getMockData(type, wid) {
  const timeRange = (wid && widgetState[wid]) ? widgetState[wid].timeRange : '30d';
  const isPie = type === 'pie' || type === 'doughnut';
  
  const timeLabels = {
    '1h':  ['10m','20m','30m','40m','50m','60m'],
    '6h':  ['1h','2h','3h','4h','5h','6h'],
    '12h': ['2h','4h','6h','8h','10h','12h'],
    '24h': ['4h','8h','12h','16h','20h','24h'],
    '7d':  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    '30d': ['Nov','Dec','Jan','Feb','Mar','Apr']
  };
  const labels = isPie
    ? ['Desktop','Mobile','Tablet','Other']
    : (timeLabels[timeRange] || timeLabels['30d']);
  
  const data = labels.map(() => Math.floor(Math.random() * 18) + 1);
  return { labels, data };
}

async function loadSavedLayout() {
  try {
    const r = await auth_get('/api/dashboard/layout');
    const savedWidgets = r.data;
    if (savedWidgets && savedWidgets.length > 0) {
      dashCanvas.innerHTML = ''; // Clear default/empty
      for (const w of savedWidgets) {
        await addWidget(w.widget_type, w.w, w.h);
      }
    }
  } catch (e) {
    console.warn('Could not load saved layout', e);
  }
}

async function saveCurrentLayout() {
  const btn = currentRole === 'super_admin' ? $('sa-save-layout') : $('admin-save-layout');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
  }

  const widgets = [];
  document.querySelectorAll('.chart-widget').forEach((el, index) => {
    widgets.push({
      widget_type: el.dataset.type,
      x: index, y: 0, w: el.clientWidth, h: el.clientHeight
    });
  });

  try {
    await auth_post('/api/dashboard/layout', { widgets });
    toast('✅ Dashboard layout saved successfully!');
  } catch (e) {
    toast('❌ Failed to save layout.', true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Save Layout';
    }
  }
}

const saSave = $('sa-save-layout');
if (saSave) saSave.onclick = saveCurrentLayout;
const adSave = $('admin-save-layout');
if (adSave) adSave.onclick = saveCurrentLayout;

function buildChart(type, cid, data) {
  const canvas = $(cid);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  const old = Chart.getChart(canvas);
  if (old) old.destroy();

  const isPie = type === 'pie' || type === 'doughnut';
  const isBar = type === 'bar';
  const color = isBar ? '#4f46e5' : '#14b8a6';

  function makeGrad(c2d, hex) {
    const grad = c2d.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, hex + '44');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    return grad;
  }

  const dataset = isPie ? {
    data: data.data,
    backgroundColor: PALETTE.map(c => c + 'bb'),
    borderColor: PALETTE,
    borderWidth: 2,
    hoverOffset: 8
  } : {
    data: data.data,
    label: GRAPHS[type]?.label || 'Trend',
    borderColor: color,
    borderWidth: 3,
    backgroundColor: makeGrad(ctx, color),
    fill: true,
    tension: 0.45,
    pointBackgroundColor: color,
    pointBorderColor: '#ffffff',
    pointRadius: 4,
    pointHoverRadius: 7
  };

  new Chart(ctx, {
    type,
    data: { labels: data.labels, datasets: [dataset] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          display: isPie,
          position: 'bottom',
          labels: { color:'#4b5563', boxWidth:12, padding:16, font:{size:11} }
        },
        tooltip: {
          backgroundColor: '#111827',
          titleColor:'#f8fafc',
          bodyColor:'#cbd5e1',
          borderColor:'rgba(255,255,255,0.08)',
          borderWidth:1,
          cornerRadius:12,
          padding:12
        }
      },
      scales: isPie ? {} : {
        x: { grid:{color:'rgba(15,23,42,0.04)',drawTicks:false}, ticks:{color:'#6b7280',font:{size:11}}, border:{display:false} },
        y: { grid:{color:'rgba(15,23,42,0.04)',drawTicks:false}, ticks:{color:'#6b7280',font:{size:11}}, border:{display:false} }
      }
    }
  });
}

async function loadLayoutFromBackend() {
  try {
    const r = await auth_get('/dashboard/layout');
    const layout = r.data;
    if (layout && layout.length > 0) {
      layout.forEach(w => addWidget(w.widget_type, w.w, w.h));
    } else {
      // Default Layout for new users or empty canvas
      addWidget('bar');
      addWidget('line');
      addWidget('pie');
      toast('Welcome! Initial dashboard layout loaded.');
    }
  } catch (e) {
    // Fallback if API fails
    addWidget('bar');
    addWidget('line');
  }
}

$('sa-save-layout').onclick = async () => {
  const widgets = [];
  dashCanvas.querySelectorAll('.chart-widget').forEach(w => {
    widgets.push({
      widget_type: w.dataset.type,
      x: 0,
      y: 0,
      w: w.offsetWidth,
      h: w.offsetHeight
    });
  });
  await auth_post('/dashboard/layout', { widgets });
  toast('Super Admin layout saved!');
};

$('admin-save-layout').onclick = async () => {
  const widgets = [];
  dashCanvas.querySelectorAll('.chart-widget').forEach(w => {
    widgets.push({
      widget_type: w.dataset.type,
      x: 0,
      y: 0,
      w: w.offsetWidth,
      h: w.offsetHeight
    });
  });
  await auth_post('/dashboard/layout', { widgets });
  toast('Admin layout saved!');
};

// --- SortableJS Init ---
function initSortables() {
    if (!$('kpi-stats-row')) return;
    
    // KPI Row Sortable
    new Sortable($('kpi-stats-row'), {
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: () => toast('KPI order modified locally.')
    });

    // Dashboard Canvas Sortable
    new Sortable(dashCanvas, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        draggable: '.chart-widget',
        onEnd: () => toast('Widget layout modified locally.')
    });
}

async function fetchUsers() {
  const r = await auth_get('/admin/users');
  const users = r.data;
  
  let filteredUsers = users;
  if (currentRole === 'admin') {
    filteredUsers = users.filter(u => u.role === 'user');
  }
  
  $('user-count-badge').innerText = `${filteredUsers.length} ${currentRole === 'admin' ? 'users' : 'accounts'}`;

  usersBody.innerHTML = filteredUsers.map(u => {
    const isAdmin = currentRole === 'admin';
    const isSelf = u.id === currentUser.id;
    
    return `
    <tr>
      <td>
        <div class="user-cell">
          <div class="user-avatar">${(u.full_name||u.email)[0].toUpperCase()}</div>
          <div>
            <div class="user-name">${u.full_name||'—'}</div>
            <div class="user-email-small">${u.email}</div>
          </div>
        </div>
      </td>
      <td><span class="badge-role badge-${u.role}">${u.role.replace(/_/g,' ')}</span></td>
      <td><span class="badge-status ${u.is_active?'active':'disabled'}">${u.is_active?'● Active':'● Disabled'}</span></td>
      <td style="opacity:.6;font-size:.82rem">${fmt(u.created_at)}</td>
      <td style="font-weight:600;font-size:.82rem;color:var(--text-primary)">${u.last_login ? fmtTime(u.last_login) : 'Never'}</td>
      <td>
        <div class="action-group">
          <button class="action-btn view" onclick="openUserDetail(${u.id},'${u.email}','${u.full_name||''}')" title="View Activity">
            <i class="fas fa-eye"></i>
          </button>
          
          <button class="action-btn ${u.is_active?'danger':'success'}" onclick="toggleUser(${u.id},${!u.is_active})" title="${u.is_active?'Disable':'Enable'}">
            <i class="fas ${u.is_active?'fa-user-slash':'fa-user-check'}"></i>
          </button>

          <button class="action-btn danger" 
                  ${isAdmin ? 'disabled style="opacity:0.3;cursor:not-allowed"' : `onclick="deleteUser(${u.id})"`} 
                  title="${isAdmin ? 'Only Super Admin can delete' : 'Delete Account'}">
            <i class="fas fa-trash-alt"></i>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

window.deleteUser = async (id) => {
    if (!confirm('Are you absolutely sure? This will delete all logs and data associated with this user.')) return;
    try {
        // Use POST fallback to avoid "Method Not Allowed" (405) in restrictive environments
        await axios.post(`${API}/admin/users/${id}/delete`, {}, { headers: { Authorization: `Bearer ${token}` } });
        refreshActiveView();
        toast('User deleted permanently.');
    } catch (e) {
        toast(e.response?.data?.detail || 'Deletion failed.', true);
    }
};

async function fetchAdmins() {
  const r = await auth_get('/admin/users');
  const users = r.data;
  const admins = users.filter(u => u.role === 'admin');
  
  const adminsBody = $('admins-table-body');
  if (!adminsBody) return;
  
  adminsBody.innerHTML = admins.map(u => `
    <tr>
      <td>
        <div class="user-cell">
          <div class="user-avatar" style="background:#14b8a6;">${(u.full_name||u.email)[0].toUpperCase()}</div>
          <div>
            <div class="user-name">${u.full_name||'—'}</div>
            <div class="user-email-small">${u.email}</div>
          </div>
        </div>
      </td>
      <td><span class="badge-role badge-admin">Admin</span></td>
      <td><span class="badge-status ${u.is_active?'active':'disabled'}">${u.is_active?'● Active':'● Disabled'}</span></td>
      <td style="opacity:.6;font-size:.82rem">${fmt(u.created_at)}</td>
      <td style="opacity:.6;font-size:.82rem">${u.last_login ? fmtTime(u.last_login) : '—'}</td>
      <td>
        <button class="action-btn view" onclick="openUserDetail(${u.id},'${u.email}','${u.full_name||''}')">
          <i class="fas fa-eye"></i> View
        </button>
        <button class="action-btn ${u.is_active?'danger':'success'}" onclick="toggleUser(${u.id},${!u.is_active})">
          ${u.is_active?'Disable':'Enable'}
        </button>
      </td>
    </tr>`).join('');
  
  if (admins.length === 0) {
    adminsBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">No admin accounts found. Create one using the "Create Admin" button.</td></tr>`;
  }
}

$('refresh-admins-btn').onclick = fetchAdmins;

window.toggleUser = async (id, status) => {
  try {
    await auth_patch(`/admin/users/${id}`, { is_active: status });
    refreshActiveView();
    toast(`User ${status ? 'enabled' : 'disabled'} successfully`);
  } catch (e) {
    if (e.response?.status === 403) {
      toast('Security Alert: You cannot disable a Super Admin account.', true);
    } else {
      toast(e.response?.data?.detail || 'Update failed.', true);
    }
  }
};

window.openUserDetail = async (userId, email, name) => {
  $('drawer-name').innerText             = name || 'User';
  $('drawer-email').innerText            = email;
  $('drawer-avatar').innerText           = (name || email)[0].toUpperCase();
  $('drawer-last-login-val').innerText   = 'Loading...';
  $('drawer-log-list').innerHTML        = '<div class="log-loading"><i class="fas fa-spinner fa-spin"></i> Analyzing activity trail…</div>';
  
  $('drawer-overlay').classList.add('show');
  $('activity-drawer').classList.add('show');

  try {
    const r = await auth_get(`/admin/users/${userId}/detail`);
    const u = r.data;

    $('drawer-last-login-val').innerText = u.last_login ? fmtTime(u.last_login) : 'Never Checked-in';

    const logs = u.recent_logs || [];
    if (logs.length === 0) {
      $('drawer-log-list').innerHTML = '<div class="log-loading">No audit trail available for this identity.</div>';
      return;
    }

    const iconsMap = {
        login: 'fa-sign-in-alt', 
        register: 'fa-user-plus', 
        admin_update_user: 'fa-user-cog', 
        delete_user: 'fa-trash-alt',
        default: 'fa-fingerprint'
    };

    $('drawer-log-list').innerHTML = logs.map(l => {
      const isError = l.level === 'ERROR' || l.action.toLowerCase().includes('fail');
      const icon = iconsMap[l.action] || iconsMap.default;
      const statusClass = isError ? 'error' : 'success';
      
      return `
      <div class="log-item-v2 ${statusClass}">
        <div class="log-icon-v2">
          <i class="fas ${isError ? 'fa-exclamation-triangle' : icon}"></i>
        </div>
        <div class="log-content-v2">
          <div class="log-header-v2">
            <div class="log-title-v2">${l.action.replace(/_/g, ' ').toUpperCase()}</div>
            <div class="log-time-v2">${fmtTime(l.timestamp)}</div>
          </div>
          <div class="log-detail-v2">${l.detail || 'System task executed successfully.'}</div>
        </div>
      </div>`;
    }).join('');

  } catch (e) {
    $('drawer-log-list').innerHTML = '<div class="log-loading" style="color:#ef4444">Critical: Failed to sync activity logs.</div>';
  }
};

const closeDrawer = () => {
    $('drawer-overlay').classList.remove('show');
    $('activity-drawer').classList.remove('show');
};

$('close-drawer').onclick = closeDrawer;
$('drawer-overlay').onclick = closeDrawer;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

async function fetchLogs() {
  const level = $('log-level-filter').value;
  const path = level ? `/admin/audit?level=${level}` : '/admin/audit';
  const r = await auth_get(path);
  auditBody.innerHTML = r.data.map(l => {
    const isError = l.level === 'ERROR';
    return `
    <tr class="${isError ? 'log-error' : ''}">
      <td style="font-size:.78rem;opacity:.5;white-space:nowrap">${new Date(l.timestamp).toLocaleString()}</td>
      <td>
        <div style="font-weight:600;font-size:.85rem">${l.user_name||'—'}</div>
        <div style="font-size:.72rem;opacity:.5">${l.user_email}</div>
      </td>
      <td><span class="badge-action ${isError?'badge-danger':''}">${l.action}</span></td>
      <td style="font-size:.82rem;opacity:.7;max-width:240px">
        ${isError ? `<span class="debug-tag">@${l.function_name}</span> ` : ''}
        ${l.detail||'—'}
      </td>
      <td style="font-size:.75rem;opacity:.4">${l.ip_address||'—'}</td>
      <td>
        <button class="btn-view-audit" onclick="viewAuditDetail(${l.id})" style="background:none;border:none;color:var(--accent-1);cursor:pointer;font-weight:600;font-size:.82rem;"><i class="fas fa-eye"></i> View</button>
      </td>
    </tr>`;
  }).join('');
}

$('log-level-filter').onchange = fetchLogs;

window.viewAuditDetail = async (logId) => {
  const r = await auth_get(`/admin/audit/${logId}`);
  const log = r.data;
  
  // Populate Drawer
  $('log-drawer-action').innerText = log.action;
  $('log-drawer-time').innerText   = new Date(log.timestamp).toLocaleString();
  $('log-val-user').innerText      = log.user_name || 'System';
  $('log-val-ip').innerText        = log.ip_address || 'Internal';
  $('log-val-detail').innerText    = log.detail || 'No further data recorded.';

  // Handle Error/Debug Report
  const errBox = $('log-error-report');
  if (log.level === 'ERROR') {
    errBox.style.display = 'block';
    $('log-val-func').innerText = log.function_name || 'N/A';
    $('log-val-line').innerText = log.line_number || 'N/A';
    $('log-drawer-icon').style.color = '#ec4899';
    $('log-drawer-icon').style.background = 'rgba(236,72,153,0.1)';
  } else {
    errBox.style.display = 'none';
    $('log-drawer-icon').style.color = 'var(--accent)';
    $('log-drawer-icon').style.background = 'rgba(79,70,229,0.1)';
  }

  // Show Drawer
  $('log-drawer-overlay').classList.add('show');
  $('log-detail-drawer').classList.add('show');
};

$('refresh-logs-btn').onclick = fetchLogs;

const adminModal = $('create-admin-modal');
createAdminBtn.onclick      = () => adminModal.style.display = 'flex';
$('close-admin-modal').onclick = () => adminModal.style.display = 'none';
$('close-modal').onclick       = () => adminModal.style.display = 'none';

$('submit-admin').onclick = async () => {
  const nameEl  = $('admin-name');
  const emailEl = $('admin-email');
  const passEl  = $('admin-password');
  const roleEl  = $('admin-role-select');
  
  if (!nameEl || !emailEl || !passEl || !roleEl) {
    console.error("Critical: Form elements not found in DOM.");
    toast('System Error: Registration form is incomplete.', true);
    return;
  }

  const name  = nameEl.value ? nameEl.value.trim() : '';
  const email = emailEl.value ? emailEl.value.trim() : '';
  const pass  = passEl.value;
  const role  = roleEl.value;
  
  if (!email || !pass) { 
    toast('Email and password required.', true); 
    return; 
  }
  try {
    const btn = $('submit-admin');
    btn.disabled = true;
    btn.innerText = 'Creating...';

    await axios.post(`${API}/superadmin/create-admin`,
      { email, full_name:name, password:pass, role:role },
      { headers: { Authorization:`Bearer ${token}` } }
    );
    adminModal.style.display = 'none';
    nameEl.value = emailEl.value = passEl.value = '';
    toast(`✅ Account (${role}) created successfully!`);
    
    refreshActiveView();
  } catch (e) {
    const msg = e?.response?.data?.detail || e?.message || 'Creation failed. Check console.';
    console.error('Create account error:', e?.response?.data || e);
    toast(`❌ ${msg}`, true);
  } finally {
    const btn = $('submit-admin');
    if (btn) { btn.disabled = false; btn.innerText = 'Create Account'; }
  }
};

function auth_get(path) {
  return axios.get(`${API}${path}`, { headers:{ Authorization:`Bearer ${token}` }});
}
function auth_post(path, data) {
  return axios.post(`${API}${path}`, data, { headers:{ Authorization:`Bearer ${token}` }});
}
function auth_patch(path, data) {
  return axios.patch(`${API}${path}`, data, { headers:{ Authorization:`Bearer ${token}` }});
}

function fmt(dt)     { return new Date(dt).toLocaleDateString('en-GB'); }
function fmtTime(dt) { return new Date(dt).toLocaleString(); }

function toast(msg, isError=false) {
  // Remove existing toasts first
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : '');
  t.style.zIndex = '99999';
  t.innerText = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 4000);
}

// Bind all "Create Admin" trigger buttons
const setupCreateBtn = (btnId) => {
  const b = $(btnId);
  if (b) b.onclick = () => {
    $('admin-name').value = '';
    $('admin-email').value = '';
    $('admin-password').value = '';
    $('create-admin-modal').style.display = 'flex';
  };
};

setupCreateBtn('sa-create-admin-btn');
setupCreateBtn('sa-create-admin-btn-alt');
setupCreateBtn('sa-create-admin-btn-dash'); // Future proofing

// Hard bind Close button
if ($('close-admin-modal')) $('close-admin-modal').onclick = () => $('create-admin-modal').style.display = 'none';
if ($('close-modal')) $('close-modal').onclick       = () => $('create-admin-modal').style.display = 'none';

// Log Drawer Close Logic
const closeLogDrawer = () => {
    $('log-drawer-overlay').classList.remove('show');
    $('log-detail-drawer').classList.remove('show');
};
if ($('close-log-drawer'))    $('close-log-drawer').onclick = closeLogDrawer;
if ($('log-drawer-overlay')) $('log-drawer-overlay').onclick = closeLogDrawer;
if ($('close-drawer'))       $('close-drawer').onclick = () => {
    $('drawer-overlay').classList.remove('show');
    $('activity-drawer').classList.remove('show');
};
if ($('drawer-overlay'))     $('drawer-overlay').onclick = () => {
    $('drawer-overlay').classList.remove('show');
    $('activity-drawer').classList.remove('show');
};

// Persist Sortables Init
initSortables();
init();
