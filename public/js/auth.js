// ═══════════════════════════════════════════════════════════
// auth.js — Counselor Login Handler
// ═══════════════════════════════════════════════════════════
//
// ⚠️  UPGRADE POINT (MVP → Production):
//     Replace validateCredentials() with a real API call:
//
//     const res  = await fetch('/api/auth/login', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ id, password }),
//     });
//     const data = await res.json();
//     if (!data.success) { showError(data.message); return; }
//     sessionStorage.setItem('counselor_session', JSON.stringify(data.user));
//     window.location.replace('/index.html');
// ═══════════════════════════════════════════════════════════

'use strict';

// ──────────────────────────────────────────────────────────
// ⚠️  MOCK DATA — Remove / replace before production.
//     Real user records must come from the backend.
// ──────────────────────────────────────────────────────────
const DUMMY_USERS = [
  {
    id:         'GOV-C-001',
    password:   'secure@123',
    name:       'Dr. Ananya Sharma',
    role:       'Senior Counselor',
    department: 'Witness Protection Unit',
    initials:   'AS',
  },
  {
    id:         'GOV-C-002',
    password:   'care@456',
    name:       'Mr. Rajiv Mehta',
    role:       'Junior Counselor',
    department: 'Victim Support Services',
    initials:   'RM',
  },
];
// ── End Mock Data ──────────────────────────────────────────

// ── DOM references ─────────────────────────────────────────
const loginForm      = document.getElementById('login-form');
const counselorIdEl  = document.getElementById('counselor-id');
const passwordEl     = document.getElementById('password');
const errorEl        = document.getElementById('login-error');
const errorMsgEl     = document.getElementById('login-error-msg');
const btnLoginEl     = document.getElementById('login-btn');
const btnTextEl      = document.getElementById('btn-text');
const btnSpinnerEl   = document.getElementById('btn-spinner');
const togglePassBtn  = document.getElementById('toggle-password');

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Already authenticated? Go to dashboard immediately.
  if (sessionStorage.getItem('counselor_session')) {
    window.location.replace('/index.html');
    return;
  }

  loginForm?.addEventListener('submit',   handleLoginSubmit);
  togglePassBtn?.addEventListener('click', togglePasswordVisibility);
  counselorIdEl?.addEventListener('input', clearError);
  passwordEl?.addEventListener('input',    clearError);

  // Auto-uppercase the counselor ID field
  counselorIdEl?.addEventListener('input', () => {
    const pos = counselorIdEl.selectionStart;
    counselorIdEl.value = counselorIdEl.value.toUpperCase();
    counselorIdEl.setSelectionRange(pos, pos);
  });
});

// ── Login Submit ───────────────────────────────────────────
async function handleLoginSubmit(e) {
  e.preventDefault();

  const id  = (counselorIdEl.value || '').trim().toUpperCase();
  const pwd = (passwordEl.value   || '');

  if (!id || !pwd) {
    showError('Please enter both your Counselor ID and Password.');
    return;
  }

  setLoadingState(true);

  // Simulate async network latency (remove in production)
  await new Promise(resolve => setTimeout(resolve, 900));

  /* ── UPGRADE POINT ──────────────────────────────────────
     Replace the block below with a real fetch() call.
     See the header comment at the top of this file.
     ─────────────────────────────────────────────────────── */
  const user = validateCredentials(id, pwd);

  if (!user) {
    setLoadingState(false);
    showError('Invalid Counselor ID or Password. Please check your credentials and try again.');
    counselorIdEl.classList.add('is-invalid');
    passwordEl.classList.add('is-invalid');
    return;
  }

  // Build session — password deliberately excluded
  const { password: _omit, ...sessionData } = user;
  sessionStorage.setItem('counselor_session', JSON.stringify({
    ...sessionData,
    loginTime: new Date().toISOString(),
  }));

  window.location.replace('/index.html');
}

// ── MVP credential validator ───────────────────────────────
function validateCredentials(id, password) {
  return DUMMY_USERS.find(u => u.id === id && u.password === password) ?? null;
}

// ── UI State Helpers ───────────────────────────────────────
function showError(msg) {
  if (errorMsgEl) errorMsgEl.textContent = msg;
  if (errorEl) {
    errorEl.style.display = 'flex';
    errorEl.classList.remove('shake');
    // Force reflow to restart animation
    void errorEl.offsetWidth;
    errorEl.classList.add('shake');
  }
}

function clearError() {
  if (errorEl) errorEl.style.display = 'none';
  counselorIdEl?.classList.remove('is-invalid');
  passwordEl?.classList.remove('is-invalid');
}

function setLoadingState(loading) {
  if (!btnLoginEl) return;
  btnLoginEl.disabled = loading;
  if (btnTextEl)    btnTextEl.style.display    = loading ? 'none'   : 'inline';
  if (btnSpinnerEl) btnSpinnerEl.style.display = loading ? 'flex'   : 'none';
}

function togglePasswordVisibility() {
  const isHidden = passwordEl.type === 'password';
  passwordEl.type = isHidden ? 'text' : 'password';
  const icon = togglePassBtn?.querySelector('i');
  if (icon) icon.className = `fa-solid ${isHidden ? 'fa-eye-slash' : 'fa-eye'}`;
}

// ── Global Logout — callable from any page ─────────────────
window.handleLogout = function () {
  sessionStorage.removeItem('counselor_session');
  window.location.replace('/login.html');
};
