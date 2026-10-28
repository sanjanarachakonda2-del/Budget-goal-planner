const $ = (selector) => document.querySelector(selector);
const state = { token: localStorage.getItem('bgp_token'), user: null, budgets: [], expenses: [], month: '' };
const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n || 0));
const now = new Date();
const monthString = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const dateString = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function showNotice(selector, message, success = false) {
  const element = $(selector);
  element.textContent = message;
  element.classList.remove('hidden', 'success');
  if (success) element.classList.add('success');
}
function clearNotice(selector) { $(selector).classList.add('hidden'); }

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(`/api${path}`, { ...options, headers });
  let body = {};
  try { body = await response.json(); } catch { /* Non-JSON response */ }
  if (!response.ok) {
    if (response.status === 401 && state.token) {
      state.token = null;
      localStorage.removeItem('bgp_token');
    }
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return body;
}

function showAuth(tab = 'signin') {
  $('#auth-view').classList.remove('hidden');
  $('#app-view').classList.add('hidden');
  $('#logout-btn').classList.add('hidden');
  document.querySelectorAll('.tab').forEach(button => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $('#signin-form').classList.toggle('hidden', tab !== 'signin');
  $('#signup-form').classList.toggle('hidden', tab !== 'signup');
}
function showApp() {
  $('#auth-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  $('#logout-btn').classList.remove('hidden');
  $('#nav-user').textContent = state.user?.name || state.user?.email || '';
  $('#admin-panel').classList.toggle('hidden', state.user?.role !== 'admin');
}
async function submitAuth(path, form) {
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    clearNotice('#auth-message');
    const result = await api(path, { method: 'POST', body: JSON.stringify(data) });
    state.token = result.token;
    state.user = result.user;
    localStorage.setItem('bgp_token', state.token);
    showApp();
    await loadDashboard();
  } catch (error) {
    showNotice('#auth-message', error.message);
  }
}

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
  clearNotice('#auth-message');
  showAuth(button.dataset.tab);
}));
$('#signin-form').addEventListener('submit', event => { event.preventDefault(); submitAuth('/auth/signin', event.currentTarget); });
$('#signup-form').addEventListener('submit', event => { event.preventDefault(); submitAuth('/auth/signup', event.currentTarget); });
$('#logout-btn').addEventListener('click', () => {
  state.token = null; state.user = null; state.budgets = []; state.expenses = [];
  localStorage.removeItem('bgp_token');
  showAuth();
});
$('#month-input').value = monthString(now);
state.month = monthString(now);
$('#expense-date').value = dateString(now);
$('#month-input').addEventListener('change', async event => {
  if (!event.target.value) return;
  state.month = event.target.value;
  await loadDashboard();
});
$('#add-budget-toggle').addEventListener('click', () => $('#budget-form').classList.toggle('hidden'));
$('#cancel-budget').addEventListener('click', () => {
  $('#budget-form').reset();
  $('#budget-form').classList.add('hidden');
});
$('#budget-form').addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  data.amount = Number(data.amount);
  data.month = state.month;
  try {
    await api('/budgets', { method: 'POST', body: JSON.stringify(data) });
    event.currentTarget.reset();
    event.currentTarget.classList.add('hidden');
    showNotice('#app-message', 'Category budget saved.', true);
    await loadDashboard();
  } catch (error) { showNotice('#app-message', error.message); }
});
$('#expense-form').addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  data.amount = Number(data.amount);
  try {
    await api('/expenses', { method: 'POST', body: JSON.stringify(data) });
    const date = data.spent_on;
    event.currentTarget.reset();
    $('#expense-date').value = date;
    showNotice('#app-message', 'Expense recorded successfully.', true);
    await loadDashboard();
  } catch (error) { showNotice('#app-message', error.message); }
});
$('#search-expenses').addEventListener('input', renderExpenses);
$('#filter-category').addEventListener('change', renderExpenses);

async function loadDashboard() {
  try {
    clearNotice('#app-message');
    const [budgetResult, expenseResult] = await Promise.all([
      api(`/budgets?month=${encodeURIComponent(state.month)}`),
      api(`/expenses?month=${encodeURIComponent(state.month)}`)
    ]);
    state.budgets = budgetResult.budgets;
    state.expenses = expenseResult.expenses;
    renderDashboard();
    if (state.user?.role === 'admin') await loadAdmin();
  } catch (error) {
    showNotice('#app-message', error.message);
    if (!state.token) { state.user = null; showAuth(); }
  }
}

function renderDashboard() {
  const spentByCategory = {};
  state.expenses.forEach(expense => {
    spentByCategory[expense.category] = (spentByCategory[expense.category] || 0) + Number(expense.amount);
  });
  const budgetTotal = state.budgets.reduce((sum, budget) => sum + Number(budget.amount), 0);
  const spentTotal = state.expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  $('#total-budget').textContent = money(budgetTotal);
  $('#total-spent').textContent = money(spentTotal);
  $('#total-remaining').textContent = money(budgetTotal - spentTotal);
  $('#remaining-caption').textContent = budgetTotal === 0 ? 'Set budgets to get started' : (spentTotal > budgetTotal ? 'You are over your total budget' : 'Available across your budgets');
  renderBudgets(spentByCategory);

  const categories = [...new Set(state.budgets.map(budget => budget.category))].sort();
  $('#category-options').innerHTML = categories.map(category => `<option value="${escapeHTML(category)}"></option>`).join('');
  const selectedCategory = $('#filter-category').value;
  $('#filter-category').innerHTML = '<option value="">All categories</option>' + categories.map(category => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('');
  $('#filter-category').value = categories.includes(selectedCategory) ? selectedCategory : '';
  renderExpenses();
}

function renderBudgets(spentByCategory) {
  const host = $('#budget-list');
  if (!state.budgets.length) {
    host.innerHTML = '<div class="empty-state">No category budgets for this month yet. Select “Set budget” to create your first one.</div>';
    return;
  }
  host.innerHTML = state.budgets.map(budget => {
    const spent = spentByCategory[budget.category] || 0;
    const amount = Number(budget.amount);
    const percentage = amount ? spent / amount * 100 : 0;
    const remaining = amount - spent;
    return `<article class="budget-item">
      <div class="budget-top"><span class="budget-name">${escapeHTML(budget.category)}</span><span class="budget-amount">${money(spent)} / ${money(amount)}</span></div>
      <div class="progress-track" role="progressbar" aria-label="${escapeHTML(budget.category)} budget used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(Math.round(percentage), 100)}"><div class="progress-fill ${percentage > 100 ? 'over' : ''}" style="width:${Math.min(percentage, 100)}%"></div></div>
      <div class="budget-bottom"><span>${Math.round(percentage)}% used</span><span>${remaining < 0 ? `${money(-remaining)} over` : `${money(remaining)} left`}</span></div>
      <div class="budget-actions"><button class="text-button" data-edit-budget="${budget.id}" data-category="${escapeHTML(budget.category)}" data-amount="${amount}" type="button">Edit</button><button class="text-button danger" data-delete-budget="${budget.id}" data-category="${escapeHTML(budget.category)}" type="button">Delete</button></div>
    </article>`;
  }).join('');

  host.querySelectorAll('[data-edit-budget]').forEach(button => button.addEventListener('click', async () => {
    const next = prompt(`New monthly limit for ${button.dataset.category} (₹):`, button.dataset.amount);
    if (next === null) return;
    if (!next.trim() || !Number.isFinite(Number(next)) || Number(next) <= 0) {
      showNotice('#app-message', 'Enter a valid positive budget amount.');
      return;
    }
    try {
      await api(`/budgets/${button.dataset.editBudget}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(next) }) });
      await loadDashboard();
    } catch (error) { showNotice('#app-message', error.message); }
  }));
  host.querySelectorAll('[data-delete-budget]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm(`Delete the ${button.dataset.category} budget for this month? Expenses will remain.`)) return;
    try {
      await api(`/budgets/${button.dataset.deleteBudget}`, { method: 'DELETE' });
      await loadDashboard();
    } catch (error) { showNotice('#app-message', error.message); }
  }));
}

function renderExpenses() {
  const query = $('#search-expenses').value.trim().toLowerCase();
  const category = $('#filter-category').value;
  const rows = state.expenses.filter(expense =>
    (!category || expense.category === category) &&
    (!query || `${expense.description} ${expense.category}`.toLowerCase().includes(query))
  );
  $('#expense-rows').innerHTML = rows.length ? rows.map(expense => `<tr>
    <td>${escapeHTML(expense.description)}</td><td><span class="category-pill">${escapeHTML(expense.category)}</span></td>
    <td>${escapeHTML(expense.spent_on)}</td><td class="number">${money(expense.amount)}</td>
    <td><button class="delete-expense" data-delete-expense="${expense.id}" aria-label="Delete ${escapeHTML(expense.description)}" type="button">Delete</button></td>
  </tr>`).join('') : '<tr><td colspan="5" class="empty-state">No expenses match this month and filter.</td></tr>';
  $('#expense-rows').querySelectorAll('[data-delete-expense]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Delete this expense? This cannot be undone.')) return;
    try {
      await api(`/expenses/${button.dataset.deleteExpense}`, { method: 'DELETE' });
      await loadDashboard();
    } catch (error) { showNotice('#app-message', error.message); }
  }));
}

async function loadAdmin() {
  try {
    const result = await api('/admin/users');
    $('#admin-users').innerHTML = `<table class="admin-user-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead><tbody>${result.users.map(user => `<tr><td>${escapeHTML(user.name)}</td><td>${escapeHTML(user.email)}</td><td>${escapeHTML(user.role)}</td><td>${escapeHTML(String(user.created_at).slice(0, 10))}</td></tr>`).join('')}</tbody></table>`;
  } catch (error) { showNotice('#app-message', error.message); }
}
async function boot() {
  if (!state.token) { showAuth(); return; }
  try {
    const result = await api('/auth/me');
    state.user = result.user;
    showApp();
    await loadDashboard();
  } catch {
    localStorage.removeItem('bgp_token');
    state.token = null;
    showAuth();
  }
}
boot();
