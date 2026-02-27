/**
 * SecureChain – Business Fraud Detection Using Blockchain
 * Single-page application connected to Flask backend
 */

(function () {
  'use strict';

  // ---------- API Config ----------
  const API_BASE = 'http://127.0.0.1:5000/api';

  // ---------- Config ----------
  const CONFIG = {
    FRAUD_THRESHOLD: 0.7,
    WARNING_THRESHOLD: 0.4,
    ITEMS_PER_PAGE: 10
  };

  // ---------- State ----------
  let state = {
    authUser: null,
    token: null,
    transactions: [],
    blockchain: [],
    notifications: [],
    currentSection: 'dashboard',
    transactionsPage: 1,
    transactionsTotalPages: 1,
    trendChart: null,
    pieChart: null,
    lineChart: null,
    weeklyBarsChart: null,
    reportsDateFilter: 'month',
    postBootTarget: 'login'
  };

  const BOOT_DURATION_MS = 2800;
  const BOOT_UPDATE_INTERVAL_MS = 50;

  // ---------- DOM Refs (lazy) ----------
  const sections = {
    landing: () => document.getElementById('landing-page'),
    login: () => document.getElementById('login-section'),
    appLayout: () => document.getElementById('app-layout'),
    dashboard: () => document.getElementById('dashboard-section'),
    transactions: () => document.getElementById('transactions-section'),
    fraudAlerts: () => document.getElementById('fraud-alerts-section'),
    blockchainLedger: () => document.getElementById('blockchain-ledger-section'),
    reports: () => document.getElementById('reports-section'),
    wallet: () => document.getElementById('wallet-section')
  };

  // ---------- Token Management ----------
  function saveToken(token) {
    state.token = token;
    localStorage.setItem('sc_token', token);
  }

  function getToken() {
    if (state.token) return state.token;
    state.token = localStorage.getItem('sc_token');
    return state.token;
  }

  function clearToken() {
    state.token = null;
    localStorage.removeItem('sc_token');
    localStorage.removeItem('sc_user');
  }

  function saveUser(user) {
    state.authUser = user;
    localStorage.setItem('sc_user', JSON.stringify(user));
  }

  function loadUser() {
    try {
      const raw = localStorage.getItem('sc_user');
      state.authUser = raw ? JSON.parse(raw) : null;
    } catch (_) {
      state.authUser = null;
    }
  }

  // ---------- API Helper ----------
  async function apiCall(endpoint, method, body) {
    method = method || 'GET';
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const opts = { method, headers };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);

    try {
      const res = await fetch(API_BASE + endpoint, opts);
      const data = await res.json();

      if (res.status === 401) {
        clearToken();
        showSection('login');
        showToast('Session expired. Please sign in again.', 'warning');
        return null;
      }

      if (!res.ok) {
        showToast(data.error || 'Something went wrong', 'danger');
        return null;
      }

      return data;
    } catch (err) {
      console.error('API Error:', err);
      showToast('Cannot connect to server. Make sure the backend is running.', 'danger');
      return null;
    }
  }

  // ---------- Helpers ----------
  function getStatusBadgeClass(score) {
    if (score < CONFIG.WARNING_THRESHOLD) return 'badge-clear';
    if (score < CONFIG.FRAUD_THRESHOLD) return 'badge-warning';
    return 'badge-suspicious';
  }

  function getStatusLabel(score) {
    if (score < CONFIG.WARNING_THRESHOLD) return 'Clear';
    if (score < CONFIG.FRAUD_THRESHOLD) return 'Review';
    return 'Suspicious';
  }

  function showLoading(show) {
    const el = document.getElementById('loading-overlay');
    if (el) el.classList.toggle('d-none', !show);
  }

  function showToast(message, type) {
    type = type || 'primary';
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toastEl = document.createElement('div');
    toastEl.className = 'toast toast-custom align-items-center text-bg-' + type + ' border-0';
    toastEl.setAttribute('role', 'alert');
    toastEl.innerHTML =
      '<div class="d-flex"><div class="toast-body">' + escapeHtml(message) + '</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>';
    container.appendChild(toastEl);
    const toast = new bootstrap.Toast(toastEl, { delay: 3500 });
    toast.show();
    toastEl.addEventListener('hidden.bs.toast', function () {
      toastEl.remove();
    });
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // ---------- Navigation ----------
  function showSection(sectionId) {
    const bootLoader = document.getElementById('boot-loader');
    if (bootLoader) bootLoader.classList.add('d-none');
    [sections.landing(), sections.login(), sections.appLayout()].forEach(el => {
      if (el) el.classList.add('d-none');
    });
    if (sectionId === 'landing') {
      const landing = sections.landing();
      if (landing) {
        landing.classList.remove('d-none');
        landing.classList.remove('landing-fade-out');
      }
      return;
    }
    if (sectionId === 'login') {
      if (sections.login()) {
        sections.login().classList.remove('d-none');
        document.getElementById('login-form-wrap') && document.getElementById('login-form-wrap').classList.remove('d-none');
        document.getElementById('signup-form-wrap') && document.getElementById('signup-form-wrap').classList.add('d-none');
        document.getElementById('forgot-form-wrap') && document.getElementById('forgot-form-wrap').classList.add('d-none');
      }
      return;
    }
    if (sections.appLayout()) sections.appLayout().classList.remove('d-none');
    state.currentSection = sectionId;
    document.querySelectorAll('.sidebar-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('data-section') === sectionId);
    });
    [sections.dashboard(), sections.transactions(), sections.fraudAlerts(), sections.blockchainLedger(), sections.reports(), sections.wallet(), document.getElementById('profile-section'), document.getElementById('settings-section'), document.getElementById('expense-tracker-section')].forEach(el => {
      if (el) el.classList.add('d-none');
    });
    const target = document.getElementById(sectionId + '-section');
    if (target) target.classList.remove('d-none');
    if (sectionId === 'dashboard') { renderDashboard(); renderNotifications(); }
    if (sectionId === 'transactions') renderTransactionsSection();
    if (sectionId === 'fraud-alerts') renderFraudAlerts();
    if (sectionId === 'blockchain-ledger') renderBlockchainLedger();
    if (sectionId === 'reports') renderReports();
    if (sectionId === 'profile') renderProfile();
    if (sectionId === 'settings') renderSettings();
    if (sectionId === 'expense-tracker') renderExpenseTracker();
    if (sectionId === 'wallet') renderWallet();
  }

  /** Get first name from email */
  function getFirstNameFromEmail(email) {
    if (!email || !email.trim()) return '';
    var beforeAt = email.trim().split('@')[0];
    if (!beforeAt) return '';
    var parts = beforeAt.split(/[.\-_]+/);
    var first = (parts[0] || '').trim();
    if (first) return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    return '';
  }

  /** Get initials for avatar from email */
  function getInitialsFromEmail(email) {
    if (!email || !email.trim()) return '';
    var beforeAt = email.trim().split('@')[0];
    if (!beforeAt) return '';
    var parts = beforeAt.split(/[.\-_]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    var first = parts[0] || '';
    return (first.slice(0, 2) || 'U').toUpperCase();
  }

  function applyRoleUI() {
    const role = state.authUser && state.authUser.role ? state.authUser.role : 'User';
    const email = state.authUser && state.authUser.email ? state.authUser.email : '';
    var avatarEl = document.getElementById('header-user-avatar');
    var roleEl = document.getElementById('header-user-role');
    var nameEl = document.getElementById('header-user-name');
    if (avatarEl) {
      if (email) avatarEl.textContent = getInitialsFromEmail(email);
      else avatarEl.textContent = (role.charAt(0) + (role.length > 1 ? role.charAt(1) : '')).toUpperCase();
    }
    if (roleEl) roleEl.textContent = role.toUpperCase();
    if (nameEl) {
      if (email) {
        var firstName = getFirstNameFromEmail(email);
        nameEl.textContent = firstName || role;
      } else {
        nameEl.textContent = role;
      }
    }
  }

  // ---------- Auth ----------
  function initAuth() {
    loadUser();
    if (state.authUser && getToken()) {
      showSection('dashboard');
      applyRoleUI();
      renderNotifications();
    } else {
      clearToken();
      showSection('landing');
    }
  }

  async function login(email, password) {
    showLoading(true);
    const data = await apiCall('/auth/login', 'POST', { email, password });
    showLoading(false);
    if (!data) return;

    saveToken(data.token);
    saveUser(data.user);
    showSection('dashboard');
    applyRoleUI();
    showToast('Welcome back, ' + (data.user.email || ''));
  }

  async function register(email, password) {
    showLoading(true);
    const data = await apiCall('/auth/register', 'POST', { email, password, role: 'User' });
    showLoading(false);
    if (!data) return;
    showToast('Account created. Sign in with your email and password.', 'success');
  }

  async function forgotPassword(email) {
    showLoading(true);
    const data = await apiCall('/auth/forgot-password', 'POST', { email: email.trim() });
    showLoading(false);
    if (!data) return;
    showToast(data.message || 'If this email is a User account, check your inbox for reset instructions.', 'success');
  }

  function logout() {
    clearToken();
    state.authUser = null;
    showSection('landing');
    showToast('You have been logged out.');
  }

  function canEditLedger() {
    return !!state.authUser;
  }

  function canViewLedger() {
    return !!state.authUser;
  }

  function canAccessSettings() {
    return !!state.authUser;
  }

  // ---------- Dashboard ----------
  async function renderDashboard() {
    const data = await apiCall('/dashboard/stats');
    if (!data) return;

    document.getElementById('kpi-total').textContent = data.total || 0;
    document.getElementById('kpi-suspicious').textContent = data.suspicious || 0;
    document.getElementById('kpi-fraud-rate').textContent = (data.fraudRate || 0) + '%';
    document.getElementById('kpi-today').textContent = data.todayCount || 0;

    renderDashboardRiskGauge(data.riskScore || 0);
    renderDashboardWeeklyBars(data.weekly || []);
    renderLiveAlertsFeed(data.recent || []);
  }

  function getGaugeColor(pct) {
    if (pct <= 40) return '#16A34A';
    if (pct <= 70) return '#F59E0B';
    return '#DC2626';
  }

  function renderDashboardRiskGauge(pct) {
    var canvas = document.getElementById('dashboard-ai-risk-gauge');
    var valueEl = document.getElementById('dashboard-ai-risk-value');
    if (!canvas || !valueEl) return;
    var ctx = canvas.getContext('2d');
    pct = Math.min(100, Math.max(0, pct));
    var color = getGaugeColor(pct);
    var size = 220;
    var cx = size / 2;
    var cy = size / 2;
    var radius = 88;
    var lineWidth = 18;
    var startAngle = -0.75 * Math.PI;
    var fullCircle = 1.5 * Math.PI;

    var trackColor = 'rgba(229, 231, 235, 0.9)';
    var centerFill = '#fff';

    function draw(current) {
      ctx.clearRect(0, 0, size, size);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, startAngle + fullCircle);
      ctx.strokeStyle = trackColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, startAngle + fullCircle * (current / 100));
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, radius - lineWidth, 0, 2 * Math.PI);
      ctx.fillStyle = centerFill;
      ctx.fill();
    }

    var start = 0;
    var duration = 500;
    var startTime = null;
    function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
    function animate(t) {
      if (!startTime) startTime = t;
      var elapsed = t - startTime;
      var tNorm = Math.min(elapsed / duration, 1);
      var current = start + (pct - start) * easeOutCubic(tNorm);
      draw(current);
      valueEl.textContent = Math.round(current) + '%';
      valueEl.style.color = getGaugeColor(current);
      if (elapsed < duration) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }

  function renderDashboardWeeklyBars(weekly) {
    var ctx = document.getElementById('dashboard-weekly-bars');
    if (!ctx) return;
    if (state.weeklyBarsChart) state.weeklyBarsChart.destroy();

    var labels = weekly.map(function (w) { return w.day; });
    var totals = weekly.map(function (w) { return w.total; });
    var colors = weekly.map(function (w) {
      var pct = w.fraudPct || 0;
      var r = Math.round(220 + (pct / 100) * 35);
      var g = Math.round(38 + (1 - pct / 100) * 120);
      return 'rgb(' + r + ',' + g + ',38)';
    });

    state.weeklyBarsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Transactions',
          data: totals,
          backgroundColor: colors,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterBody: function (items) {
                var i = items[0] && items[0].dataIndex;
                if (i == null || !weekly[i]) return '';
                return 'Total: ' + weekly[i].total + ' · Fraud: ' + weekly[i].fraud + ' (' + weekly[i].fraudPct + '%)';
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' } }
        }
      }
    });
  }

  function renderLiveAlertsFeed(recent) {
    const container = document.getElementById('dashboard-live-alerts');
    if (!container) return;
    if (!recent || recent.length === 0) {
      container.innerHTML = '<div class="live-alerts-empty">No recent transactions. Add a transaction to see live alerts here.</div>';
      return;
    }
    var html = '';
    recent.forEach(function (t) {
      var risk = t.fraudScore >= CONFIG.FRAUD_THRESHOLD ? 'High' : (t.fraudScore >= CONFIG.WARNING_THRESHOLD ? 'Medium' : 'Low');
      var badgeClass = t.fraudScore >= CONFIG.FRAUD_THRESHOLD ? 'badge-suspicious' : (t.fraudScore >= CONFIG.WARNING_THRESHOLD ? 'badge-warning' : 'badge-clear');
      var time = t.date ? new Date(t.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
      var merchant = escapeHtml(t.sender) + ' → ' + escapeHtml(t.receiver);
      html += '<div class="live-alert-item tr-clickable" data-id="' + escapeHtml(t.id) + '">';
      html += '<span class="live-alert-time">' + escapeHtml(time) + '</span>';
      html += '<span class="live-alert-merchant">' + merchant + '</span>';
      html += '<span class="badge ' + badgeClass + '">' + escapeHtml(risk) + '</span>';
      html += '</div>';
    });
    container.innerHTML = html;
    container.querySelectorAll('.live-alert-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-id');
        if (id) openTransactionModal(id);
      });
    });
  }

  function rowHtml(t, shortDate, isSuspicious) {
    const dateStr = shortDate ? new Date(t.date).toLocaleDateString() : new Date(t.date).toLocaleString();
    const scorePct = (t.fraudScore * 100).toFixed(0);
    const badgeClass = getStatusBadgeClass(t.fraudScore);
    const statusLabel = getStatusLabel(t.fraudScore);
    const extra = shortDate ? '' : '<td>' + dateStr + '</td>';
    const rowClass = 'tr-clickable' + (isSuspicious ? ' tr-suspicious' : '');
    return '<tr class="' + rowClass + '" data-id="' + escapeHtml(t.id) + '">' +
      '<td>' + escapeHtml(t.id) + '</td>' +
      '<td>' + escapeHtml(t.sender) + '</td>' +
      '<td>' + escapeHtml(t.receiver) + '</td>' +
      '<td>' + escapeHtml(String(t.amount)) + '</td>' +
      '<td>' + scorePct + '%</td>' +
      '<td><span class="badge ' + badgeClass + '">' + statusLabel + '</span></td>' + (shortDate ? '' : extra) + '</tr>';
  }

  function bindTableRowClicks(tableSelector) {
    const table = document.querySelector(tableSelector);
    if (!table) return;
    table.querySelectorAll('tbody tr.tr-clickable').forEach(tr => {
      tr.addEventListener('click', function () {
        const id = tr.getAttribute('data-id');
        if (id) openTransactionModal(id);
      });
    });
  }

  // ---------- Transactions ----------
  async function addTransaction(sender, receiver, amount) {
    showLoading(true);
    const data = await apiCall('/transactions', 'POST', { sender, receiver, amount: Number(amount) });
    showLoading(false);
    if (!data) return null;

    const tx = data.transaction;
    showToast('Transaction added. Fraud score: ' + (tx.fraudScore * 100).toFixed(0) + '%');
    return tx;
  }

  async function renderTransactionsSection() {
    state.transactionsPage = state.transactionsPage || 1;
    await renderTransactionsTable();
  }

  async function renderTransactionsTable() {
    const search = (document.getElementById('tx-search') && document.getElementById('tx-search').value) || '';
    const statusFilter = (document.getElementById('tx-status-filter') && document.getElementById('tx-status-filter').value) || '';

    let endpoint = '/transactions?page=' + state.transactionsPage + '&per_page=' + CONFIG.ITEMS_PER_PAGE;
    if (search) endpoint += '&search=' + encodeURIComponent(search);
    if (statusFilter) endpoint += '&status=' + encodeURIComponent(statusFilter);

    const data = await apiCall(endpoint);
    if (!data) return;

    state.transactions = data.transactions || [];
    state.transactionsTotalPages = data.total_pages || 1;

    const tbody = document.querySelector('#transactions-table tbody');
    if (!tbody) return;
    tbody.innerHTML = state.transactions.map(t => rowHtml(t, false, t.fraudScore >= CONFIG.FRAUD_THRESHOLD)).join('') || '<tr><td colspan="7" class="text-center text-secondary">No transactions yet. Add one above.</td></tr>';
    bindTableRowClicks('#transactions-table');
    renderTransactionsPagination();
  }

  function renderTransactionsPagination() {
    const nav = document.getElementById('transactions-pagination');
    if (!nav) return;
    const totalPages = state.transactionsTotalPages;
    if (totalPages <= 1) {
      nav.innerHTML = '';
      return;
    }
    let html = '<ul class="pagination pagination-sm mb-0">';
    for (let i = 1; i <= totalPages; i++) {
      html += '<li class="page-item' + (i === state.transactionsPage ? ' active' : '') + '"><a class="page-link" href="#" data-page="' + i + '">' + i + '</a></li>';
    }
    html += '</ul>';
    nav.innerHTML = html;
    nav.querySelectorAll('.page-link').forEach(a => {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        state.transactionsPage = parseInt(a.getAttribute('data-page'), 10);
        renderTransactionsTable();
      });
    });
  }

  // ---------- Fraud Alerts ----------
  async function renderFraudAlerts() {
    const data = await apiCall('/fraud-alerts');
    if (!data) return;

    const suspicious = data.alerts || [];
    const tbody = document.querySelector('#fraud-alerts-table tbody');
    if (!tbody) return;
    tbody.innerHTML = suspicious.map(t => {
      const pct = (t.fraudScore * 100).toFixed(0);
      return '<tr class="tr-suspicious tr-clickable" data-id="' + escapeHtml(t.id) + '">' +
        '<td>' + escapeHtml(t.id) + '</td>' +
        '<td>' + escapeHtml(t.sender) + '</td>' +
        '<td>' + escapeHtml(t.receiver) + '</td>' +
        '<td>' + escapeHtml(String(t.amount)) + '</td>' +
        '<td><strong>' + pct + '%</strong></td>' +
        '<td>' + new Date(t.date).toLocaleString() + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="text-center text-secondary">No fraud alerts. Transactions with fraud score > 70% will appear here.</td></tr>';
    bindTableRowClicks('#fraud-alerts-table');
  }

  // ---------- Blockchain Ledger ----------
  async function renderBlockchainLedger() {
    const data = await apiCall('/blockchain');
    if (!data) return;

    state.blockchain = data.chain || [];
    const container = document.getElementById('blockchain-blocks');
    if (!container) return;
    container.innerHTML = state.blockchain.map(b => {
      return '<div class="block-item">' +
        '<span class="block-index">Block #' + b.index + '</span>' +
        ' <span class="text-secondary">Transaction: ' + escapeHtml(b.transactionId) + '</span>' +
        '<div class="hash-row"><span>Prev: ' + escapeHtml(b.previousHash) + '</span><button type="button" class="btn btn-sm btn-outline-secondary copy-hash-btn" data-hash="' + escapeHtml(b.previousHash) + '">Copy</button></div>' +
        '<div class="hash-row"><span>Hash: ' + escapeHtml(b.currentHash) + '</span><button type="button" class="btn btn-sm btn-outline-secondary copy-hash-btn" data-hash="' + escapeHtml(b.currentHash) + '">Copy</button></div>' +
        '<div class="text-secondary small mt-1">' + escapeHtml(b.timestamp) + '</div></div>';
    }).join('') || '<p class="text-secondary mb-0">No blocks yet. Add a transaction to create the first block.</p>';

    // Chain validation status
    if (data.validation) {
      const v = data.validation;
      const statusHtml = v.valid
        ? '<div class="alert alert-success mt-3 mb-0"><strong>✓ Chain Valid</strong> — ' + v.totalBlocks + ' blocks verified</div>'
        : '<div class="alert alert-danger mt-3 mb-0"><strong>✗ Chain Invalid</strong> — ' + v.errors.length + ' error(s) found</div>';
      container.innerHTML += statusHtml;
    }

    container.querySelectorAll('.copy-hash-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const hash = btn.getAttribute('data-hash');
        if (hash && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(hash).then(() => showToast('Hash copied to clipboard'));
        }
      });
    });
  }

  // ---------- Reports ----------
  async function renderReports() {
    const data = await apiCall('/reports?filter=' + (state.reportsDateFilter || 'month'));
    if (!data) return;

    renderReportsDonutChart(data.distribution || {});
    renderReportsStackedBarChart(data.monthly || []);

    var filterEl = document.getElementById('reports-date-filter');
    if (filterEl && !filterEl._bound) {
      filterEl._bound = true;
      filterEl.addEventListener('change', function () {
        state.reportsDateFilter = filterEl.value;
        renderReports();
      });
    }
  }

  function renderReportsDonutChart(distribution) {
    const ctx = document.getElementById('reports-pie-chart');
    const legendEl = document.getElementById('reports-donut-legend');
    if (!ctx) return;
    if (state.pieChart) state.pieChart.destroy();

    var clear = distribution.clear || 0;
    var review = distribution.review || 0;
    var suspicious = distribution.suspicious || 0;
    var total = clear + review + suspicious;

    state.pieChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Clear', 'Review', 'Suspicious'],
        datasets: [{
          data: [clear, review, suspicious],
          backgroundColor: ['#16A34A', '#F59E0B', '#DC2626'],
          borderWidth: 2,
          borderColor: '#fff',
          hoverBorderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { animateRotate: true, animateScale: true },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#f1f5f9',
            bodyColor: '#f1f5f9',
            borderColor: 'rgba(37, 99, 235, 0.4)',
            borderWidth: 1,
            padding: 12,
            displayColors: true,
            boxPadding: 6,
            callbacks: {
              title: function () { return ''; },
              label: function (item) {
                var raw = item.raw;
                var pct = total ? ((raw / total) * 100).toFixed(1) : 0;
                return pct + '% ' + item.label;
              }
            }
          }
        }
      }
    });

    if (legendEl) {
      var pctClear = total ? ((clear / total) * 100).toFixed(1) : 0;
      var pctReview = total ? ((review / total) * 100).toFixed(1) : 0;
      var pctSusp = total ? ((suspicious / total) * 100).toFixed(1) : 0;
      legendEl.innerHTML = '<div class="reports-legend-inner"><span class="reports-legend-item"><span class="legend-dot" style="background:#16A34A"></span> Clear: ' + clear + ' (' + pctClear + '%)</span><span class="reports-legend-item"><span class="legend-dot" style="background:#F59E0B"></span> Review: ' + review + ' (' + pctReview + '%)</span><span class="reports-legend-item"><span class="legend-dot" style="background:#DC2626"></span> Suspicious: ' + suspicious + ' (' + pctSusp + '%)</span></div>';
    }
  }

  function renderReportsStackedBarChart(monthly) {
    const ctx = document.getElementById('reports-line-chart');
    if (!ctx) return;
    if (state.lineChart) state.lineChart.destroy();

    var labels = monthly.map(function (m) { return m.label; });
    var clearData = monthly.map(function (m) { return m.clear; });
    var reviewData = monthly.map(function (m) { return m.review; });
    var suspiciousData = monthly.map(function (m) { return m.suspicious; });

    state.lineChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Clear', data: clearData, backgroundColor: '#16A34A', stack: 'stack0' },
          { label: 'Review', data: reviewData, backgroundColor: '#F59E0B', stack: 'stack0' },
          { label: 'Suspicious', data: suspiciousData, backgroundColor: '#DC2626', stack: 'stack0' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600 },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              afterBody: function (items) {
                var idx = items[0] && items[0].dataIndex;
                if (idx == null) return '';
                return 'Clear: ' + clearData[idx] + ' · Review: ' + reviewData[idx] + ' · Suspicious: ' + suspiciousData[idx];
              }
            }
          }
        },
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true }
        }
      }
    });
  }

  async function exportCSV() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(API_BASE + '/transactions/export', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!res.ok) {
        showToast('Export failed', 'danger');
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'securechain-transactions-' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('CSV exported');
    } catch (err) {
      showToast('Export failed', 'danger');
    }
  }

  // ---------- Notifications ----------
  function renderNotifications() {
    const list = document.getElementById('header-notifications-list');
    const empty = document.getElementById('header-notifications-empty');
    const badge = document.getElementById('header-notifications-badge');
    if (!list) return;

    // Use fraud alerts from last dashboard fetch
    apiCall('/fraud-alerts').then(function (data) {
      if (!data) return;
      const items = (data.alerts || []).slice(0, 20).map(t => ({
        id: 'n-' + t.id,
        type: 'alert',
        title: 'Suspicious transaction reported',
        body: 'Transaction ' + t.id + ' – Score ' + (t.fraudScore * 100).toFixed(1) + '%',
        time: t.date
      }));
      state.notifications = items;

      if (badge) {
        badge.textContent = items.length;
        badge.classList.toggle('d-none', items.length === 0);
      }
      if (items.length === 0) {
        list.innerHTML = '';
        if (empty) empty.classList.remove('d-none');
        return;
      }
      if (empty) empty.classList.add('d-none');
      list.innerHTML = items.map(n => {
        const timeStr = n.time ? new Date(n.time).toLocaleString() : '';
        const alertClass = n.type === 'alert' ? ' notification-alert' : '';
        return '<div class="notification-item' + alertClass + '">' +
          '<div><div>' + escapeHtml(n.title) + '</div><div class="notification-time">' + escapeHtml(n.body) + ' · ' + timeStr + '</div></div></div>';
      }).join('');
    });
  }

  // ---------- Profile ----------
  function renderProfile() {
    const body = document.getElementById('profile-section-body');
    if (!body) return;
    const user = state.authUser || {};
    const email = user.email || '—';
    const role = user.role || '—';
    const initial = (email !== '—' && email.length) ? email.charAt(0).toUpperCase() : '?';
    body.innerHTML =
      '<div class="profile-avatar">' + initial + '</div>' +
      '<div class="profile-row"><span class="label">Email</span><span class="value">' + escapeHtml(email) + '</span></div>' +
      '<div class="profile-row"><span class="label">Role</span><span class="value">' + escapeHtml(role) + '</span></div>' +
      '<div class="profile-row"><span class="label">Account</span><span class="value">Active</span></div>';
  }

  // ---------- Expense Tracker (all roles) ----------
  async function renderExpenseTracker() {
    const receivedEl = document.getElementById('expense-tracker-received');
    const spentEl = document.getElementById('expense-tracker-spent');
    const countEl = document.getElementById('expense-tracker-count');
    if (!receivedEl || !spentEl || !countEl) return;

    receivedEl.textContent = '…';
    spentEl.textContent = '…';
    countEl.textContent = '…';

    let totalReceived = 0;
    let totalSpent = 0;
    let totalCount = 0;
    let page = 1;
    const perPage = 500;
    let hasMore = true;

    while (hasMore) {
      const data = await apiCall('/transactions?page=' + page + '&per_page=' + perPage);
      if (!data || !data.transactions || data.transactions.length === 0) {
        hasMore = false;
        break;
      }
      const list = data.transactions;
      list.forEach(function (t) {
        const amt = Number(t.amount) || 0;
        totalReceived += amt;
        totalSpent += amt;
        totalCount += 1;
      });
      if (list.length < perPage) hasMore = false;
      else page += 1;
    }

    receivedEl.textContent = totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    spentEl.textContent = totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    countEl.textContent = totalCount.toLocaleString();
  }

  async function fetchTransactionsInPeriod(days) {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const all = [];
    let page = 1;
    const perPage = 500;
    let hasMore = true;
    while (hasMore) {
      const data = await apiCall('/transactions?page=' + page + '&per_page=' + perPage);
      if (!data || !data.transactions || data.transactions.length === 0) {
        hasMore = false;
        break;
      }
      const list = data.transactions;
      list.forEach(function (t) {
        const tDate = t.date ? new Date(t.date).getTime() : 0;
        if (tDate >= cutoff) all.push(t);
      });
      if (list.length < perPage) hasMore = false;
      else page += 1;
    }
    return all;
  }

  function renderTransactionHistoryModal(list) {
    const tbody = document.getElementById('transaction-history-tbody');
    const emptyEl = document.getElementById('transaction-history-empty');
    const tableWrap = document.querySelector('#transaction-history-table');
    if (!tbody) return;
    if (!list || list.length === 0) {
      if (emptyEl) emptyEl.classList.remove('d-none');
      if (tableWrap) tableWrap.classList.add('d-none');
      tbody.innerHTML = '';
      return;
    }
    if (emptyEl) emptyEl.classList.add('d-none');
    if (tableWrap) tableWrap.classList.remove('d-none');
    tbody.innerHTML = list.map(function (t) {
      const isSuspicious = t.fraudScore >= CONFIG.FRAUD_THRESHOLD;
      return rowHtml(t, false, isSuspicious);
    }).join('');
    bindTableRowClicks('#transaction-history-table');
  }

  async function loadTransactionHistoryInModal(days) {
    const periodLabel = document.getElementById('transaction-history-period-label');
    const pastOptions = document.getElementById('transaction-history-past-options');
    const loadingEl = document.getElementById('transaction-history-loading');
    const emptyEl = document.getElementById('transaction-history-empty');
    const tbody = document.getElementById('transaction-history-tbody');
    const tableWrap = document.querySelector('#transaction-history-table');

    if (periodLabel) {
      if (days === 0.5) periodLabel.textContent = 'Showing last 12 hours';
      else if (days === 7) periodLabel.textContent = 'Last 7 days';
      else if (days === 30) periodLabel.textContent = 'Last 1 month';
      else if (days === 180) periodLabel.textContent = 'Last 6 months';
      else periodLabel.textContent = 'Last ' + days + ' days';
    }
    if (pastOptions) pastOptions.classList.toggle('d-none', days === 0.5);
    if (loadingEl) loadingEl.classList.remove('d-none');
    if (emptyEl) emptyEl.classList.add('d-none');
    if (tbody) tbody.innerHTML = '';
    if (tableWrap) tableWrap.classList.add('d-none');

    const list = await fetchTransactionsInPeriod(days);
    if (loadingEl) loadingEl.classList.add('d-none');
    renderTransactionHistoryModal(list);
  }

  function openTransactionHistoryModal(selectedDays) {
    selectedDays = selectedDays === undefined ? 0.5 : selectedDays;
    const modalEl = document.getElementById('transaction-history-modal');
    if (modalEl) {
      var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
      loadTransactionHistoryInModal(selectedDays);
    }
  }

  // ---------- Wallet ----------
  var _walletLookupTimer = null;

  async function renderWallet() {
    const data = await apiCall('/wallet/me');
    if (!data || !data.wallet) return;

    const wallet = data.wallet;
    var idEl = document.getElementById('wallet-id-display');
    var balEl = document.getElementById('wallet-balance-display');
    var emailEl = document.getElementById('wallet-email-display');

    if (idEl) idEl.textContent = wallet.walletId || '—';
    if (balEl) balEl.textContent = '₹' + (wallet.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (emailEl) emailEl.textContent = wallet.email || '';

    renderWalletTransactions();
  }

  async function addWalletFunds(amount) {
    showLoading(true);
    const data = await apiCall('/wallet/add-funds', 'POST', { amount: Number(amount) });
    showLoading(false);
    if (!data) return;

    showToast(data.message || 'Funds added!', 'success');
    renderWallet();
  }

  async function transferMoney(receiverWalletId, amount) {
    showLoading(true);
    const data = await apiCall('/wallet/transfer', 'POST', {
      receiverWalletId: receiverWalletId,
      amount: Number(amount)
    });
    showLoading(false);

    var resultEl = document.getElementById('wallet-transfer-result');

    if (!data) {
      // Error was already shown by apiCall
      if (resultEl) {
        resultEl.classList.remove('d-none');
        resultEl.innerHTML = '<div class="alert alert-danger transfer-status-alert"><strong>❌ Transfer Failed</strong> — Please check the wallet ID and your balance.</div>';
      }
      return;
    }

    var status = data.transferStatus || 'Completed';
    if (resultEl) {
      resultEl.classList.remove('d-none');
      if (status === 'Completed') {
        resultEl.innerHTML = '<div class="alert alert-success transfer-status-alert"><strong>✓ Transfer Completed</strong> — ₹' + Number(amount).toFixed(2) + ' sent successfully. TX: ' + escapeHtml(data.transaction.id) + '</div>';
      } else {
        resultEl.innerHTML = '<div class="alert alert-danger transfer-status-alert"><strong>❌ Transfer ' + escapeHtml(status) + '</strong></div>';
      }
      // Auto-hide after 8 seconds
      setTimeout(function () {
        resultEl.classList.add('d-none');
      }, 8000);
    }

    showToast(data.message || 'Transfer complete!', status === 'Completed' ? 'success' : 'danger');
    renderWallet();
  }

  async function renderWalletTransactions() {
    const data = await apiCall('/wallet/transactions');
    if (!data) return;

    var txs = data.transactions || [];
    var tbody = document.querySelector('#wallet-transactions-table tbody');
    if (!tbody) return;

    if (txs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-secondary">No transfers yet. Send or receive money to see history here.</td></tr>';
      return;
    }

    tbody.innerHTML = txs.map(function (t) {
      var statusClass = t.transferStatus === 'Completed' ? 'badge-transfer-completed' :
        t.transferStatus === 'Failed' ? 'badge-transfer-failed' : 'badge-transfer-pending';
      var statusLabel = t.transferStatus || 'Completed';
      var txType = (t.type || 'transfer');
      var typeBadge = txType === 'deposit'
        ? '<span class="badge badge-deposit">Deposit</span>'
        : '<span class="badge badge-transfer">Transfer</span>';
      return '<tr class="tr-clickable" data-id="' + escapeHtml(t.id) + '">' +
        '<td>' + escapeHtml(t.id) + '</td>' +
        '<td>' + typeBadge + '</td>' +
        '<td>' + escapeHtml(t.sender) + '</td>' +
        '<td>' + escapeHtml(t.receiver) + '</td>' +
        '<td>₹' + Number(t.amount).toFixed(2) + '</td>' +
        '<td><span class="badge ' + statusClass + '">' + escapeHtml(statusLabel) + '</span></td>' +
        '<td>' + new Date(t.date).toLocaleString() + '</td></tr>';
    }).join('');

    bindTableRowClicks('#wallet-transactions-table');
  }

  async function lookupWallet(walletId) {
    if (!walletId || walletId.length < 10) {
      var preview = document.getElementById('wallet-receiver-preview');
      if (preview) preview.innerHTML = '';
      return;
    }
    const data = await apiCall('/wallet/lookup/' + encodeURIComponent(walletId));
    var preview = document.getElementById('wallet-receiver-preview');
    if (!preview) return;
    if (data && data.found) {
      preview.innerHTML = '<span class="text-success">✓ Wallet found: ' + escapeHtml(data.email) + '</span>';
    } else {
      preview.innerHTML = '<span class="text-danger">Wallet not found</span>';
    }
  }

  // ---------- Mock Deposit (Bank to Wallet) ----------
  var _depositProcessing = false;

  function showDepositStep(stepName) {
    var steps = ['deposit-step-form', 'deposit-step-processing', 'deposit-step-success', 'deposit-step-failure'];
    steps.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        if (id === 'deposit-step-' + stepName) el.classList.remove('d-none');
        else el.classList.add('d-none');
      }
    });
  }

  function openDepositModal() {
    showDepositStep('form');
    var amountEl = document.getElementById('deposit-amount');
    if (amountEl) amountEl.value = '';
    // Reset method selection to UPI
    document.querySelectorAll('.deposit-method-card').forEach(function (card) {
      card.classList.remove('active');
    });
    var upiCard = document.querySelector('.deposit-method-card[data-method="upi"]');
    if (upiCard) upiCard.classList.add('active');
    var upiRadio = document.querySelector('input[name="deposit-method"][value="upi"]');
    if (upiRadio) upiRadio.checked = true;

    var modalEl = document.getElementById('deposit-modal');
    if (modalEl) {
      var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }
  }

  async function processDeposit() {
    if (_depositProcessing) return;

    var amountEl = document.getElementById('deposit-amount');
    var amount = amountEl ? parseFloat(amountEl.value) : 0;
    if (!amount || amount < 10) {
      showToast('Minimum deposit amount is ₹10.', 'danger');
      return;
    }

    var methodRadio = document.querySelector('input[name="deposit-method"]:checked');
    var paymentMethod = methodRadio ? methodRadio.value : 'upi';

    var methodLabels = { upi: 'UPI', card: 'Card', netbanking: 'Netbanking' };
    var processingMethodEl = document.getElementById('deposit-processing-method');
    if (processingMethodEl) processingMethodEl.textContent = 'Connecting to ' + (methodLabels[paymentMethod] || paymentMethod);

    _depositProcessing = true;
    showDepositStep('processing');

    try {
      var data = await apiCall('/wallet/deposit/mock', 'POST', {
        amount: amount,
        paymentMethod: paymentMethod
      });

      if (data && data.paymentId) {
        // Success
        var successAmountEl = document.getElementById('deposit-success-amount');
        var successPayidEl = document.getElementById('deposit-success-payid');
        var successMethodEl = document.getElementById('deposit-success-method');
        var successBalanceEl = document.getElementById('deposit-success-balance');

        if (successAmountEl) successAmountEl.textContent = '₹' + Number(data.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (successPayidEl) successPayidEl.textContent = data.paymentId;
        if (successMethodEl) successMethodEl.textContent = methodLabels[paymentMethod] || paymentMethod;
        if (successBalanceEl) successBalanceEl.textContent = '₹' + Number(data.newBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        showDepositStep('success');
        showToast(data.message || 'Deposit successful!', 'success');
        renderWallet();
      } else {
        // Failure
        var failureMsgEl = document.getElementById('deposit-failure-msg');
        if (failureMsgEl) failureMsgEl.textContent = (data && data.error) || 'Something went wrong. Please try again.';
        showDepositStep('failure');
      }
    } catch (err) {
      var failureMsgEl = document.getElementById('deposit-failure-msg');
      if (failureMsgEl) failureMsgEl.textContent = 'Network error. Please check your connection.';
      showDepositStep('failure');
    } finally {
      _depositProcessing = false;
    }
  }

  // ---------- Settings ----------
  async function renderSettings() {
    const body = document.getElementById('settings-section-body');
    if (!body) return;

    let stored = { contactNumber: '', email: '' };
    try {
      const raw = localStorage.getItem('sc_health_support');
      if (raw) stored = JSON.parse(raw);
    } catch (_) {}

    let html = '';

    html += '<div class="card mb-4"><div class="card-body">' +
      '<h5 class="card-title mb-2">Profile</h5>' +
      '<p class="text-secondary small mb-3">View your account details.</p>' +
      '<button type="button" class="btn btn-primary" id="settings-open-profile-btn">Open profile</button>' +
      '</div></div>';

    html += '<div class="card mb-4"><div class="card-body">' +
      '<h5 class="card-title mb-2">Help and support</h5>' +
      '<p class="text-secondary small mb-3">Contact number and email for support.</p>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-12 col-md-6"><label class="form-label">Contact number</label><input type="text" class="form-control" id="settings-support-contact" placeholder="Contact number" value="' + escapeHtml(stored.contactNumber || '') + '"></div>' +
      '<div class="col-12 col-md-6"><label class="form-label">Email</label><input type="email" class="form-control" id="settings-support-email" placeholder="Support email" value="' + escapeHtml(stored.email || '') + '"></div>' +
      '</div>' +
      '<button type="button" class="btn btn-primary" id="settings-support-save">Save</button>' +
      '</div></div>';

    html += '<div class="card mb-4"><div class="card-body">' +
      '<h5 class="card-title mb-2">Fraud alerts</h5>' +
      '<p class="text-secondary small mb-3">View transactions flagged as suspicious.</p>' +
      '<button type="button" class="btn btn-primary" id="settings-view-fraud-alerts-btn">View fraud alerts</button>' +
      '</div></div>';

    body.innerHTML = html;

    document.getElementById('settings-open-profile-btn') && document.getElementById('settings-open-profile-btn').addEventListener('click', function () {
      showSection('profile');
      renderProfile();
    });

    document.getElementById('settings-view-fraud-alerts-btn') && document.getElementById('settings-view-fraud-alerts-btn').addEventListener('click', function () {
      showSection('fraud-alerts');
      renderFraudAlerts();
    });

    var supportSave = document.getElementById('settings-support-save');
    if (supportSave) {
      supportSave.addEventListener('click', function () {
        var contact = (document.getElementById('settings-support-contact') && document.getElementById('settings-support-contact').value) || '';
        var email = (document.getElementById('settings-support-email') && document.getElementById('settings-support-email').value) || '';
        try {
          localStorage.setItem('sc_health_support', JSON.stringify({ contactNumber: contact, email: email }));
          showToast('Help and support details saved.');
        } catch (e) {
          showToast('Could not save.', 'danger');
        }
      });
    }

    var editUserSave = document.getElementById('edit-user-save');
    if (editUserSave) {
      editUserSave.onclick = async function () {
        var userId = document.getElementById('edit-user-email').value;
        var newPassword = document.getElementById('edit-user-password').value;
        if (!userId) return;

        var updates = {};
        if (newPassword && newPassword.trim()) updates.password = newPassword.trim();

        const data = await apiCall('/auth/users/' + userId, 'PUT', updates);
        if (data) {
          showToast('Account updated.');
          var modalEl = document.getElementById('edit-user-modal');
          if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
          renderSettings();
        }
      };
    }
  }

  // ---------- Transaction Detail Modal ----------
  async function openTransactionModal(id) {
    const data = await apiCall('/transactions/' + encodeURIComponent(id));
    if (!data || !data.transaction) return;

    const tx = data.transaction;
    const block = tx.block;
    const riskLevel = tx.fraudScore < CONFIG.WARNING_THRESHOLD ? 'Low' : (tx.fraudScore < CONFIG.FRAUD_THRESHOLD ? 'Medium' : 'High');
    let blockHtml = '—';
    if (block) {
      blockHtml = '<div class="modal-detail-row"><span class="modal-detail-label">Previous Hash</span><span class="modal-detail-value" style="word-break:break-all">' + escapeHtml(block.previousHash) + '</span></div>' +
        '<div class="modal-detail-row"><span class="modal-detail-label">Current Hash</span><span class="modal-detail-value" style="word-break:break-all">' + escapeHtml(block.currentHash) + '</span></div>' +
        '<div class="modal-detail-row"><span class="modal-detail-label">Block Index</span><span class="modal-detail-value">' + block.index + '</span></div>';
    }
    const body = document.getElementById('transaction-detail-body');
    if (!body) return;
    body.innerHTML =
      '<div class="modal-detail-row"><span class="modal-detail-label">ID</span><span class="modal-detail-value">' + escapeHtml(tx.id) + '</span></div>' +
      '<div class="modal-detail-row"><span class="modal-detail-label">Sender</span><span class="modal-detail-value">' + escapeHtml(tx.sender) + '</span></div>' +
      '<div class="modal-detail-row"><span class="modal-detail-label">Receiver</span><span class="modal-detail-value">' + escapeHtml(tx.receiver) + '</span></div>' +
      '<div class="modal-detail-row"><span class="modal-detail-label">Amount</span><span class="modal-detail-value">' + escapeHtml(String(tx.amount)) + '</span></div>' +
      '<div class="modal-detail-row"><span class="modal-detail-label">Fraud Score</span><span class="modal-detail-value">' + (tx.fraudScore * 100).toFixed(1) + '%</span></div>' +
      '<div class="modal-detail-row"><span class="modal-detail-label">Risk Level</span><span class="modal-detail-value">' + riskLevel + '</span></div>' +
      '<div class="modal-detail-row"><span class="modal-detail-label">Status</span><span class="modal-detail-value">' + getStatusLabel(tx.fraudScore) + '</span></div>' +
      '<div class="modal-detail-row"><span class="modal-detail-label">Date</span><span class="modal-detail-value">' + new Date(tx.date).toLocaleString() + '</span></div>' +
      '<hr><h6 class="mb-2">Blockchain Block Info</h6>' + blockHtml;
    const modal = new bootstrap.Modal(document.getElementById('transaction-detail-modal'));
    modal.show();
  }

  // ---------- Boot Loader ----------
  function startBoot(target) {
    state.postBootTarget = target || 'login';
    const landing = sections.landing();
    const bootLoader = document.getElementById('boot-loader');
    const progressFill = document.getElementById('boot-progress-fill');
    const progressText = document.getElementById('boot-progress-text');
    const statusText = document.getElementById('boot-status-text');
    if (!landing || !bootLoader) return;
    landing.classList.add('landing-fade-out');
    setTimeout(function () {
      landing.classList.add('d-none');
      bootLoader.classList.remove('d-none');
      bootLoader.classList.remove('boot-fade-out');
      if (progressFill) progressFill.style.width = '0%';
      if (progressText) progressText.textContent = '0% Complete';
      if (statusText) statusText.textContent = 'Initializing System...';
      let progress = 0;
      const startTime = Date.now();
      const tick = setInterval(function () {
        const elapsed = Date.now() - startTime;
        progress = Math.min((elapsed / BOOT_DURATION_MS) * 100, 100);
        if (progressFill) progressFill.style.width = progress + '%';
        if (progressText) progressText.textContent = Math.round(progress) + '% Complete';
        if (progress >= 100) {
          clearInterval(tick);
          if (statusText) statusText.textContent = 'Ready';
          bootLoader.classList.add('boot-fade-out');
          setTimeout(function () {
            bootLoader.classList.add('d-none');
            showSection(state.postBootTarget);
          }, 400);
        }
      }, BOOT_UPDATE_INTERVAL_MS);
    }, 500);
  }

  // ---------- Event Bindings ----------
  function bindGlobalActions() {
    document.querySelectorAll('[data-action="show-landing"]').forEach(el => {
      el.addEventListener('click', () => showSection('landing'));
    });
    document.querySelectorAll('[data-action="enter-then-login"]').forEach(el => {
      el.addEventListener('click', () => startBoot('login'));
    });
    const enterBtn = document.getElementById('landing-enter-btn');
    if (enterBtn) enterBtn.addEventListener('click', () => startBoot('login'));

    var loginFormWrap = document.getElementById('login-form-wrap');
    var signupFormWrap = document.getElementById('signup-form-wrap');
    var forgotFormWrap = document.getElementById('forgot-form-wrap');
    document.getElementById('login-show-signup') && document.getElementById('login-show-signup').addEventListener('click', function () {
      if (loginFormWrap) loginFormWrap.classList.add('d-none');
      if (forgotFormWrap) forgotFormWrap.classList.add('d-none');
      if (signupFormWrap) signupFormWrap.classList.remove('d-none');
    });
    document.getElementById('login-show-forgot') && document.getElementById('login-show-forgot').addEventListener('click', function () {
      if (loginFormWrap) loginFormWrap.classList.add('d-none');
      if (signupFormWrap) signupFormWrap.classList.add('d-none');
      if (forgotFormWrap) forgotFormWrap.classList.remove('d-none');
    });
    document.getElementById('signup-show-login') && document.getElementById('signup-show-login').addEventListener('click', function () {
      if (signupFormWrap) signupFormWrap.classList.add('d-none');
      if (forgotFormWrap) forgotFormWrap.classList.add('d-none');
      if (loginFormWrap) loginFormWrap.classList.remove('d-none');
    });
    document.getElementById('forgot-show-login') && document.getElementById('forgot-show-login').addEventListener('click', function () {
      if (forgotFormWrap) forgotFormWrap.classList.add('d-none');
      if (signupFormWrap) signupFormWrap.classList.add('d-none');
      if (loginFormWrap) loginFormWrap.classList.remove('d-none');
    });

    // Forgot password form
    document.getElementById('forgot-password-form') && document.getElementById('forgot-password-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var emailEl = document.getElementById('forgot-email');
      var email = emailEl && emailEl.value ? emailEl.value.trim() : '';
      if (!email) return;
      await forgotPassword(email);
      if (forgotFormWrap) forgotFormWrap.classList.add('d-none');
      if (loginFormWrap) loginFormWrap.classList.remove('d-none');
      if (emailEl) emailEl.value = '';
    });

    // Signup form
    document.getElementById('signup-form-same-page') && document.getElementById('signup-form-same-page').addEventListener('submit', async function (e) {
      e.preventDefault();
      var emailEl = document.getElementById('signup-email');
      var passEl = document.getElementById('signup-password');
      var confirmEl = document.getElementById('signup-confirm');
      var email = emailEl.value.trim();
      var password = passEl.value;
      var confirm = confirmEl.value;
      if (password !== confirm) {
        showToast('Passwords do not match.', 'danger');
        return;
      }
      await register(email, password);
      signupFormWrap && signupFormWrap.classList.add('d-none');
      loginFormWrap && loginFormWrap.classList.remove('d-none');
      if (emailEl) emailEl.value = '';
      if (passEl) passEl.value = '';
      if (confirmEl) confirmEl.value = '';
    });

    // Sidebar
    var appLayout = document.getElementById('app-layout');
    var sidebarTooltip = document.getElementById('sidebar-tooltip');
    var sidebarTooltipTimer = null;
    var SIDEBAR_TOOLTIP_DELAY_MS = 1200;
    document.querySelectorAll('.sidebar-link[data-tooltip]').forEach(link => {
      link.addEventListener('mouseenter', function () {
        if (sidebarTooltipTimer) clearTimeout(sidebarTooltipTimer);
        sidebarTooltipTimer = null;
        if (sidebarTooltip) {
          sidebarTooltip.classList.remove('visible');
          sidebarTooltip.setAttribute('aria-hidden', 'true');
        }
        sidebarTooltipTimer = setTimeout(function () {
          sidebarTooltipTimer = null;
          if (!sidebarTooltip) return;
          var text = link.getAttribute('data-tooltip');
          var rect = link.getBoundingClientRect();
          sidebarTooltip.textContent = text;
          sidebarTooltip.style.top = (rect.top + rect.height / 2 - 14) + 'px';
          sidebarTooltip.style.left = (rect.right + 8) + 'px';
          sidebarTooltip.classList.add('visible');
          sidebarTooltip.setAttribute('aria-hidden', 'false');
        }, SIDEBAR_TOOLTIP_DELAY_MS);
      });
      link.addEventListener('mouseleave', function () {
        if (sidebarTooltipTimer) { clearTimeout(sidebarTooltipTimer); sidebarTooltipTimer = null; }
        if (sidebarTooltip) {
          sidebarTooltip.classList.remove('visible');
          sidebarTooltip.setAttribute('aria-hidden', 'true');
        }
      });
    });

    document.querySelectorAll('.sidebar-link[data-section]').forEach(link => {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        const section = link.getAttribute('data-section');
        showSection(section);
        if (appLayout) appLayout.classList.add('sidebar-collapsed');
      });
    });

    var sidebarLogoToggle = document.getElementById('sidebar-logo-toggle');
    if (sidebarLogoToggle && appLayout) {
      sidebarLogoToggle.addEventListener('click', function () {
        appLayout.classList.toggle('sidebar-collapsed');
      });
      appLayout.classList.add('sidebar-collapsed');
    }

    document.getElementById('header-logout') && document.getElementById('header-logout').addEventListener('click', function () {
      document.getElementById('header-user-menu') && document.getElementById('header-user-menu').classList.add('d-none');
      logout();
    });

    var headerUserBtn = document.getElementById('header-user-btn');
    var headerUserMenu = document.getElementById('header-user-menu');
    if (headerUserBtn && headerUserMenu) {
      headerUserBtn.addEventListener('click', function () {
        headerUserMenu.classList.toggle('d-none');
        headerUserBtn.setAttribute('aria-expanded', headerUserMenu.classList.contains('d-none') ? 'false' : 'true');
      });
      document.addEventListener('click', function (e) {
        if (!headerUserBtn.contains(e.target) && !headerUserMenu.contains(e.target)) {
          headerUserMenu.classList.add('d-none');
          headerUserBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    document.querySelectorAll('.header-user-menu-item[data-section]').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        var section = item.getAttribute('data-section');
        if (section) showSection(section);
        if (headerUserMenu) headerUserMenu.classList.add('d-none');
        if (headerUserBtn) headerUserBtn.setAttribute('aria-expanded', 'false');
      });
    });

    var headerNotificationsBtn = document.getElementById('header-notifications');
    var headerNotificationsPanel = document.getElementById('header-notifications-panel');
    if (headerNotificationsBtn && headerNotificationsPanel) {
      headerNotificationsBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        headerNotificationsPanel.classList.toggle('d-none');
        headerNotificationsBtn.setAttribute('aria-expanded', headerNotificationsPanel.classList.contains('d-none') ? 'false' : 'true');
        if (!headerNotificationsPanel.classList.contains('d-none')) renderNotifications();
      });
      document.addEventListener('click', function (e) {
        if (!headerNotificationsBtn.contains(e.target) && !headerNotificationsPanel.contains(e.target)) {
          headerNotificationsPanel.classList.add('d-none');
          headerNotificationsBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    function bindPasswordToggle(btnId, inputId) {
      var btn = document.getElementById(btnId);
      var input = document.getElementById(inputId);
      if (!btn || !input) return;
      var eye = btn.querySelector('.icon-eye');
      var eyeOff = btn.querySelector('.icon-eye-off');
      btn.addEventListener('click', function () {
        var isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        btn.setAttribute('title', isPassword ? 'Hide password' : 'Show password');
        if (eye) eye.classList.toggle('d-none', isPassword);
        if (eyeOff) eyeOff.classList.toggle('d-none', !isPassword);
      });
    }
    bindPasswordToggle('login-password-toggle', 'login-password');
    bindPasswordToggle('signup-password-toggle', 'signup-password');
    bindPasswordToggle('signup-confirm-toggle', 'signup-confirm');

    // Login form
    document.getElementById('login-form') && document.getElementById('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      login(email, password);
    });

    // Add transaction form
    document.getElementById('add-transaction-form') && document.getElementById('add-transaction-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      const sender = document.getElementById('tx-sender').value.trim();
      const receiver = document.getElementById('tx-receiver').value.trim();
      const amount = document.getElementById('tx-amount').value;
      if (!sender || !receiver || !amount) return;
      const tx = await addTransaction(sender, receiver, amount);
      if (tx) {
        this.reset();
        renderTransactionsSection();
        renderDashboard();
      }
    });

    // Search and filter
    const txSearch = document.getElementById('tx-search');
    const txFilter = document.getElementById('tx-status-filter');
    if (txSearch) txSearch.addEventListener('input', () => { state.transactionsPage = 1; renderTransactionsTable(); });
    if (txFilter) txFilter.addEventListener('change', () => { state.transactionsPage = 1; renderTransactionsTable(); });

    var headerSearch = document.getElementById('header-search');
    if (headerSearch) {
      headerSearch.addEventListener('input', function () {
        var q = headerSearch.value.trim();
        if (txSearch) txSearch.value = q;
        state.transactionsPage = 1;
        renderTransactionsTable();
      });
      headerSearch.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && headerSearch.value.trim()) {
          showSection('transactions');
        }
      });
    }

    document.getElementById('export-csv-btn') && document.getElementById('export-csv-btn').addEventListener('click', exportCSV);

    // Expense Tracker: Transaction count card opens transaction history modal
    var expenseCountCard = document.getElementById('expense-tracker-count-card');
    if (expenseCountCard) {
      expenseCountCard.addEventListener('click', function () { openTransactionHistoryModal(0.5); });
      expenseCountCard.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openTransactionHistoryModal(0.5);
        }
      });
    }

    // Transaction history modal: View past history
    document.getElementById('transaction-history-view-past-btn') && document.getElementById('transaction-history-view-past-btn').addEventListener('click', function () {
      var pastOpts = document.getElementById('transaction-history-past-options');
      if (pastOpts) pastOpts.classList.remove('d-none');
      loadTransactionHistoryInModal(7);
    });

    // Transaction history modal: Period buttons
    document.querySelectorAll('.transaction-history-period-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var days = parseInt(btn.getAttribute('data-days'), 10);
        if (!isNaN(days)) loadTransactionHistoryInModal(days);
      });
    });

    // Wallet: Open Deposit Modal
    document.getElementById('wallet-open-deposit-btn') && document.getElementById('wallet-open-deposit-btn').addEventListener('click', function () {
      openDepositModal();
    });

    // Deposit: Method card selection
    document.querySelectorAll('.deposit-method-card').forEach(function (card) {
      card.addEventListener('click', function () {
        document.querySelectorAll('.deposit-method-card').forEach(function (c) { c.classList.remove('active'); });
        card.classList.add('active');
        var radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
      });
    });

    // Deposit: Pay Now button
    document.getElementById('deposit-pay-btn') && document.getElementById('deposit-pay-btn').addEventListener('click', function () {
      processDeposit();
    });

    // Deposit: Retry button
    document.getElementById('deposit-retry-btn') && document.getElementById('deposit-retry-btn').addEventListener('click', function () {
      showDepositStep('form');
    });

    // Deposit: Reset on modal close
    var depositModalEl = document.getElementById('deposit-modal');
    if (depositModalEl) {
      depositModalEl.addEventListener('hidden.bs.modal', function () {
        showDepositStep('form');
      });
    }

    // Wallet: Transfer form
    document.getElementById('wallet-transfer-form') && document.getElementById('wallet-transfer-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var receiverEl = document.getElementById('wallet-receiver-id');
      var amountEl = document.getElementById('wallet-transfer-amount');
      var receiver = receiverEl ? receiverEl.value.trim() : '';
      var amount = amountEl ? amountEl.value : '';
      if (!receiver || !amount || Number(amount) <= 0) { showToast('Fill in all fields.', 'danger'); return; }
      await transferMoney(receiver, amount);
      if (receiverEl) receiverEl.value = '';
      if (amountEl) amountEl.value = '';
      var preview = document.getElementById('wallet-receiver-preview');
      if (preview) preview.innerHTML = '';
    });

    // Wallet: Copy ID
    document.getElementById('wallet-copy-btn') && document.getElementById('wallet-copy-btn').addEventListener('click', function () {
      var idEl = document.getElementById('wallet-id-display');
      if (idEl && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(idEl.textContent).then(function () { showToast('Wallet ID copied!'); });
      }
    });

    // Wallet: Lookup receiver on input
    var walletReceiverInput = document.getElementById('wallet-receiver-id');
    if (walletReceiverInput) {
      walletReceiverInput.addEventListener('input', function () {
        if (_walletLookupTimer) clearTimeout(_walletLookupTimer);
        _walletLookupTimer = setTimeout(function () {
          lookupWallet(walletReceiverInput.value.trim());
        }, 600);
      });
    }
  }

  function initScrollAnimations() {
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.animate-on-scroll').forEach(function (el) {
      observer.observe(el);
    });
  }

  // ---------- Init ----------
  function init() {
    initAuth();
    bindGlobalActions();
    initScrollAnimations();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
