/* ── State ── */
const STORAGE_KEY = 'budget_transactions';
const LIMIT_KEY   = 'budget_spend_limit';
const THEME_KEY   = 'budget_theme';

let transactions = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let spendLimit   = parseFloat(localStorage.getItem(LIMIT_KEY)) || 0;
let sortMode     = 'default';
let chart        = null;

const CATEGORY_COLORS = {
  Food:      '#f59e0b',
  Transport: '#10b981',
  Fun:       '#ec4899',
  Work:      '#3b82f6',
  Jobs:      '#3b82f6',
};

const CATEGORY_ICONS = {
  Food:      '🍔',
  Transport: '🚗',
  Fun:       '🎮',
  Work:      '💼',
  Jobs:      '💼',
};

/* ── DOM refs ── */
const form         = document.getElementById('transactionForm');
const itemNameEl   = document.getElementById('itemName');
const amountEl     = document.getElementById('amount');
const categoryEl   = document.getElementById('category');
const totalEl      = document.getElementById('totalBalance');
const listEl       = document.getElementById('transactionList');
const listEmpty    = document.getElementById('listEmpty');
const chartEmpty   = document.getElementById('chartEmpty');
const chartCanvas  = document.getElementById('spendingChart');
const sortSelect   = document.getElementById('sortSelect');
const spendLimitEl = document.getElementById('spendLimit');
const setLimitBtn  = document.getElementById('setLimitBtn');
const limitStatus  = document.getElementById('limitStatus');
const themeToggle  = document.getElementById('themeToggle');
const balanceCard  = document.querySelector('.balance-card');
const toastContainer = document.getElementById('toastContainer');
const limitBarWrap = document.getElementById('limitBarWrap');
const limitBarFill = document.getElementById('limitBarFill');
const limitBarPct  = document.getElementById('limitBarPct');

/* ════════════════════════════════
   THEME
════════════════════════════════ */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

/* ════════════════════════════════
   3D TILT — Balance Card
════════════════════════════════ */
balanceCard.addEventListener('mousemove', e => {
  const rect   = balanceCard.getBoundingClientRect();
  const cx     = rect.left + rect.width  / 2;
  const cy     = rect.top  + rect.height / 2;
  const dx     = (e.clientX - cx) / (rect.width  / 2);  // -1 to 1
  const dy     = (e.clientY - cy) / (rect.height / 2);  // -1 to 1
  const tiltX  = dy * -10;   // rotate around X axis
  const tiltY  = dx *  10;   // rotate around Y axis
  balanceCard.style.transform = `perspective(600px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(1.02)`;
  balanceCard.style.transition = 'transform 0.08s ease';
});

balanceCard.addEventListener('mouseleave', () => {
  balanceCard.style.transform = 'perspective(600px) rotateX(0deg) rotateY(0deg) scale(1)';
  balanceCard.style.transition = 'transform 0.45s cubic-bezier(.23,1.02,.64,1)';
});

/* ════════════════════════════════
   RIPPLE — buttons
════════════════════════════════ */
function addRipple(btn) {
  btn.addEventListener('click', function(e) {
    const rect   = btn.getBoundingClientRect();
    const size   = Math.max(rect.width, rect.height) * 2;
    const x      = e.clientX - rect.left - size / 2;
    const y      = e.clientY - rect.top  - size / 2;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px`;
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });
}

addRipple(document.querySelector('.btn-submit'));
addRipple(setLimitBtn);

/* ════════════════════════════════
   TOAST
════════════════════════════════ */
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, 2400);
}

/* ════════════════════════════════
   VALIDATION
════════════════════════════════ */
function setError(inputEl, errorId, show) {
  const err = document.getElementById(errorId);
  if (show) { inputEl.classList.add('invalid');    err.classList.add('visible'); }
  else       { inputEl.classList.remove('invalid'); err.classList.remove('visible'); }
}

function validate() {
  let valid = true;
  if (!itemNameEl.value.trim()) { setError(itemNameEl, 'nameError', true);    valid = false; }
  else                           { setError(itemNameEl, 'nameError', false); }

  const amt = parseFloat(amountEl.value);
  if (!amountEl.value || isNaN(amt) || amt <= 0) { setError(amountEl, 'amountError', true);  valid = false; }
  else                                             { setError(amountEl, 'amountError', false); }

  if (!categoryEl.value) { setError(categoryEl, 'categoryError', true);  valid = false; }
  else                    { setError(categoryEl, 'categoryError', false); }

  return valid;
}

/* ════════════════════════════════
   PERSISTENCE
════════════════════════════════ */
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

/* ════════════════════════════════
   SORT
════════════════════════════════ */
function getSorted() {
  const copy = [...transactions];
  if (sortMode === 'amount-asc')  return copy.sort((a, b) => a.amount - b.amount);
  if (sortMode === 'amount-desc') return copy.sort((a, b) => b.amount - a.amount);
  if (sortMode === 'category')    return copy.sort((a, b) => a.category.localeCompare(b.category));
  return copy;
}

sortSelect.addEventListener('change', () => {
  sortMode = sortSelect.value;
  renderList();
});

/* ════════════════════════════════
   SPEND LIMIT
════════════════════════════════ */
function renderLimitStatus() {
  if (!spendLimit || spendLimit <= 0) {
    limitStatus.className = 'limit-status';
    limitBarWrap.classList.remove('visible');
    return;
  }
  const total = transactions.reduce((s, t) => s + t.amount, 0);
  const pct   = Math.min((total / spendLimit) * 100, 100);

  // Progress bar
  limitBarWrap.classList.add('visible');
  limitBarFill.style.width = pct + '%';
  limitBarPct.textContent  = pct.toFixed(0) + '%';
  limitBarFill.className   = 'limit-bar-fill' + (pct >= 100 ? ' over' : pct >= 80 ? ' warn' : '');

  if (pct >= 100) {
    limitStatus.className = 'limit-status over';
    limitStatus.textContent = `⚠️ Over limit! $${total.toFixed(2)} spent of $${spendLimit.toFixed(2)} limit.`;
  } else if (pct >= 80) {
    limitStatus.className = 'limit-status warn';
    limitStatus.textContent = `🔔 Heads up — ${pct.toFixed(0)}% of limit used ($${total.toFixed(2)} / $${spendLimit.toFixed(2)}).`;
  } else {
    limitStatus.className = 'limit-status ok';
    limitStatus.textContent = `✅ ${pct.toFixed(0)}% of limit used ($${total.toFixed(2)} / $${spendLimit.toFixed(2)}).`;
  }
}

setLimitBtn.addEventListener('click', () => {
  const val = parseFloat(spendLimitEl.value);
  if (!spendLimitEl.value || isNaN(val) || val <= 0) {
    spendLimit = 0;
    localStorage.removeItem(LIMIT_KEY);
    limitStatus.className = 'limit-status';
    spendLimitEl.value = '';
    return;
  }
  spendLimit = val;
  localStorage.setItem(LIMIT_KEY, spendLimit);
  renderLimitStatus();
});

if (spendLimit > 0) spendLimitEl.value = spendLimit;

/* ════════════════════════════════
   COUNT-UP ANIMATION
════════════════════════════════ */
let countUpRaf = null;
let currentDisplayed = 0;

function animateCountUp(target) {
  if (countUpRaf) cancelAnimationFrame(countUpRaf);
  const start    = currentDisplayed;
  const diff     = target - start;
  const duration = 500; // ms
  const startTs  = performance.now();

  function step(ts) {
    const elapsed  = ts - startTs;
    const progress = Math.min(elapsed / duration, 1);
    // ease-out cubic
    const eased    = 1 - Math.pow(1 - progress, 3);
    const value    = start + diff * eased;
    totalEl.textContent = '$' + value.toFixed(2);
    if (progress < 1) {
      countUpRaf = requestAnimationFrame(step);
    } else {
      currentDisplayed = target;
      countUpRaf = null;
    }
  }
  countUpRaf = requestAnimationFrame(step);
}

/* ════════════════════════════════
   RENDER BALANCE
════════════════════════════════ */
function renderBalance() {
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  animateCountUp(total);
  totalEl.classList.remove('pop');
  void totalEl.offsetWidth;
  totalEl.classList.add('pop');
}

/* ════════════════════════════════
   RENDER LIST
════════════════════════════════ */
function renderList() {
  listEl.querySelectorAll('.transaction-item').forEach(el => el.remove());
  const sorted = getSorted();

  if (sorted.length === 0) { listEmpty.style.display = ''; return; }
  listEmpty.style.display = 'none';

  sorted.forEach(t => {
    const item = document.createElement('div');
    item.className = 'transaction-item';
    if (spendLimit > 0 && t.amount > spendLimit) item.classList.add('over-limit');

    const originalIndex = transactions.indexOf(t);
    item.dataset.index = originalIndex;

    item.innerHTML = `
      <span class="category-badge badge-${t.category}"><i class="badge-icon">${CATEGORY_ICONS[t.category]}</i>${t.category}</span>
      <span class="transaction-name">${escapeHtml(t.name)}</span>
      <span class="transaction-amount">$${t.amount.toFixed(2)}</span>
      <button class="btn-delete" aria-label="Delete ${escapeHtml(t.name)}" data-index="${originalIndex}">&#x2715;</button>
    `;
    listEl.appendChild(item);
  });
}

/* ════════════════════════════════
   RENDER CHART
════════════════════════════════ */
function renderChart() {
  const totals = { Food: 0, Transport: 0, Fun: 0, Work: 0, Jobs: 0 };
  transactions.forEach(t => { totals[t.category] += t.amount; });

  const labels = Object.keys(totals).filter(k => totals[k] > 0);
  const data   = labels.map(k => totals[k]);
  const colors = labels.map(k => CATEGORY_COLORS[k]);

  if (labels.length === 0) {
    chartEmpty.style.display = 'block';
    chartCanvas.style.display = 'none';
    if (chart) { chart.destroy(); chart = null; }
    return;
  }

  chartEmpty.style.display = 'none';
  chartCanvas.style.display = '';

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.data.datasets[0].backgroundColor = colors;
    chart.update();
    return;
  }

  chart = new Chart(chartCanvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 3,
        borderColor: 'transparent',
        hoverOffset: 10,
      }]
    },
    options: {
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 18,
            color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#94a3b8',
            font: { family: 'Inter, system-ui, sans-serif', size: 13 },
            usePointStyle: true,
            pointStyleWidth: 10,
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` $${ctx.parsed.toFixed(2)}`
          }
        }
      }
    }
  });
}

/* ════════════════════════════════
   FULL RENDER
════════════════════════════════ */
function render() {
  renderBalance();
  renderList();
  renderChart();
  renderLimitStatus();
}

/* ════════════════════════════════
   ADD TRANSACTION
════════════════════════════════ */
form.addEventListener('submit', e => {
  e.preventDefault();
  if (!validate()) return;

  transactions.push({
    name:     itemNameEl.value.trim(),
    amount:   parseFloat(amountEl.value),
    category: categoryEl.value,
  });

  save();
  render();
  showToast(`✅ "${transactions[transactions.length-1].name}" added`);
  form.reset();
  [itemNameEl, amountEl, categoryEl].forEach(el => el.classList.remove('invalid'));
});

/* ════════════════════════════════
   DELETE TRANSACTION
════════════════════════════════ */
listEl.addEventListener('click', e => {
  const btn = e.target.closest('.btn-delete');
  if (!btn) return;

  const index = parseInt(btn.dataset.index, 10);
  const item  = btn.closest('.transaction-item');

  item.classList.add('removing');
  setTimeout(() => {
    const deleted = transactions[index];
    transactions.splice(index, 1);
    save();
    render();
    showToast(`🗑️ "${escapeHtml(deleted.name)}" deleted`, 'delete');
  }, 200);
});

/* ════════════════════════════════
   XSS HELPER
════════════════════════════════ */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ════════════════════════════════
   INIT
════════════════════════════════ */
render();
