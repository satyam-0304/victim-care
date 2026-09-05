// ═══════════════════════════════════════════════════════════
// auth.js — Counselor Login Handler (Batch 3 — Full Rewrite)
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

// ══════════════════════════════════════════════════════════
// DOM REFERENCES
// ══════════════════════════════════════════════════════════

// Modal
const btnOpenModal     = document.getElementById('btn-open-modal');
const btnCloseModal    = document.getElementById('btn-close-modal');
const modalBackdrop    = document.getElementById('auth-modal-backdrop');
const authModal        = document.getElementById('auth-modal');

// Tabs
const tabSignIn        = document.getElementById('tab-signin');
const tabSignUp        = document.getElementById('tab-signup');
const panelSignIn      = document.getElementById('panel-signin');
const panelSignUp      = document.getElementById('panel-signup');
const tabsContainer    = authModal?.querySelector('.auth-tabs');

// Sign In Form
const loginForm        = document.getElementById('login-form');
const counselorIdEl    = document.getElementById('counselor-id');
const passwordEl       = document.getElementById('password');
const errorEl          = document.getElementById('login-error');
const errorMsgEl       = document.getElementById('login-error-msg');
const btnLoginEl       = document.getElementById('login-btn');
const btnTextEl        = document.getElementById('btn-text');
const btnSpinnerEl     = document.getElementById('btn-spinner');
const togglePassBtn    = document.getElementById('toggle-password');
const checkIdIcon      = document.getElementById('check-counselor-id');
const rememberMeEl     = document.getElementById('remember-me');
const needHelpLink     = document.getElementById('need-help-link');
const helpTooltip      = document.getElementById('help-tooltip');

// Sign Up Form
const signupForm       = document.getElementById('signup-form');
const signupSuccess    = document.getElementById('signup-success');
const toggleSignupPass = document.getElementById('toggle-signup-password');

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

  // Already authenticated? Go to dashboard immediately.
  if (sessionStorage.getItem('counselor_session')) {
    window.location.replace('/index.html');
    return;
  }

  // ── Modal Controls ────────────────────────────────────
  btnOpenModal?.addEventListener('click',  openModal);
  btnCloseModal?.addEventListener('click', closeModal);
  modalBackdrop?.addEventListener('click', closeModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // ── Tab Switching ─────────────────────────────────────
  tabSignIn?.addEventListener('click', () => switchTab('signin'));
  tabSignUp?.addEventListener('click', () => switchTab('signup'));

  // ── Sign In Form ──────────────────────────────────────
  loginForm?.addEventListener('submit',    handleLoginSubmit);
  togglePassBtn?.addEventListener('click', () => togglePasswordVisibility(passwordEl, togglePassBtn));

  // Auto-uppercase counselor ID + live validation
  counselorIdEl?.addEventListener('input', () => {
    const pos = counselorIdEl.selectionStart;
    counselorIdEl.value = counselorIdEl.value.toUpperCase();
    counselorIdEl.setSelectionRange(pos, pos);
    clearError();
    validateCounselorIdField();
  });

  passwordEl?.addEventListener('input', clearError);

  // ── Remember Me — restore saved ID ───────────────────
  const savedId = localStorage.getItem('vc_remember_id');
  if (savedId && counselorIdEl) {
    counselorIdEl.value = savedId;
    if (rememberMeEl) rememberMeEl.checked = true;
    validateCounselorIdField();
  }

  // ── Need Help tooltip toggle ──────────────────────────
  needHelpLink?.addEventListener('click', (e) => {
    e.preventDefault();
    const visible = helpTooltip?.classList.toggle('visible');
    needHelpLink.setAttribute('aria-expanded', visible ? 'true' : 'false');
  });

  // Close tooltip if clicking outside it
  document.addEventListener('click', (e) => {
    if (helpTooltip?.classList.contains('visible') &&
        !helpTooltip.contains(e.target) &&
        e.target !== needHelpLink) {
      helpTooltip.classList.remove('visible');
      needHelpLink?.setAttribute('aria-expanded', 'false');
    }
  });

  // ── Sign Up Form ──────────────────────────────────────
  signupForm?.addEventListener('submit',    handleSignupSubmit);
  toggleSignupPass?.addEventListener('click', () => {
    const pwEl = document.getElementById('signup-password');
    togglePasswordVisibility(pwEl, toggleSignupPass);
  });

});

// ══════════════════════════════════════════════════════════
// MODAL — OPEN / CLOSE
// ══════════════════════════════════════════════════════════
function openModal() {
  modalBackdrop?.classList.add('is-open');
  authModal?.classList.add('is-open');
  authModal?.removeAttribute('aria-hidden');
  modalBackdrop?.removeAttribute('aria-hidden');
  document.body.style.overflow = 'hidden';

  // Focus the first input after animation settles
  setTimeout(() => counselorIdEl?.focus(), 350);
}

function closeModal() {
  modalBackdrop?.classList.remove('is-open');
  authModal?.classList.remove('is-open');
  authModal?.setAttribute('aria-hidden', 'true');
  modalBackdrop?.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';

  // Return focus to the trigger button
  btnOpenModal?.focus();
}

// ══════════════════════════════════════════════════════════
// TAB SWITCHING
// ══════════════════════════════════════════════════════════
function switchTab(tab) {
  const isSignIn = tab === 'signin';

  // Toggle active class on tabs
  tabSignIn?.classList.toggle('active', isSignIn);
  tabSignUp?.classList.toggle('active', !isSignIn);
  tabSignIn?.setAttribute('aria-selected', isSignIn ? 'true' : 'false');
  tabSignUp?.setAttribute('aria-selected', isSignIn ? 'false' : 'true');

  // Move the sliding pill indicator via data attribute on the container
  if (tabsContainer) tabsContainer.dataset.active = tab;

  // Toggle panels
  if (isSignIn) {
    panelSignIn?.classList.add('active');
    panelSignUp?.classList.remove('active');
    panelSignIn?.removeAttribute('aria-hidden');
    panelSignUp?.setAttribute('aria-hidden', 'true');
    // Focus first field in sign-in
    setTimeout(() => counselorIdEl?.focus(), 60);
  } else {
    panelSignUp?.classList.add('active');
    panelSignIn?.classList.remove('active');
    panelSignUp?.removeAttribute('aria-hidden');
    panelSignIn?.setAttribute('aria-hidden', 'true');
    // Focus first field in sign-up
    setTimeout(() => document.getElementById('signup-name')?.focus(), 60);
  }

  // Clear any error state when switching tabs
  clearError();
}

// ══════════════════════════════════════════════════════════
// SIGN IN — SUBMIT HANDLER
// ══════════════════════════════════════════════════════════
async function handleLoginSubmit(e) {
  e.preventDefault();

  const id  = (counselorIdEl?.value || '').trim().toUpperCase();
  const pwd = (passwordEl?.value   || '');

  if (!id || !pwd) {
    showError('Please enter both your Counselor ID and Password.');
    return;
  }

  setLoadingState(true);

  // Simulate async network latency (remove in production)
  await new Promise(resolve => setTimeout(resolve, 900));

  /* ── UPGRADE POINT ─────────────────────────────────────
     Replace the block below with a real fetch() call.
     ────────────────────────────────────────────────────── */
  const user = validateCredentials(id, pwd);

  if (!user) {
    setLoadingState(false);
    showError('Invalid Counselor ID or Password. Please check your credentials and try again.');
    counselorIdEl?.classList.add('is-invalid');
    passwordEl?.classList.add('is-invalid');
    return;
  }

  // ── Handle "Remember Me" ────────────────────────────
  if (rememberMeEl?.checked) {
    localStorage.setItem('vc_remember_id', id);
  } else {
    localStorage.removeItem('vc_remember_id');
  }

  // Build session — password deliberately excluded
  const { password: _omit, ...sessionData } = user;
  sessionStorage.setItem('counselor_session', JSON.stringify({
    ...sessionData,
    loginTime: new Date().toISOString(),
  }));

  window.location.replace('/index.html');
}

// ══════════════════════════════════════════════════════════
// SIGN UP — SUBMIT HANDLER (Gated — MVP)
// ══════════════════════════════════════════════════════════
function handleSignupSubmit(e) {
  e.preventDefault();

  const name    = document.getElementById('signup-name')?.value.trim();
  const id      = document.getElementById('signup-id')?.value.trim();
  const email   = document.getElementById('signup-email')?.value.trim();
  const pass    = document.getElementById('signup-password')?.value;
  const confirm = document.getElementById('signup-confirm')?.value;

  // Basic validation
  if (!name || !id || !email || !pass || !confirm) {
    showSignupError('Please fill in all fields.');
    return;
  }
  if (pass !== confirm) {
    showSignupError('Passwords do not match.');
    document.getElementById('signup-confirm')?.classList.add('is-invalid');
    return;
  }
  if (pass.length < 6) {
    showSignupError('Password must be at least 6 characters.');
    document.getElementById('signup-password')?.classList.add('is-invalid');
    return;
  }

  // Show gated success message — admin approval required
  if (signupForm)    signupForm.style.display = 'none';
  if (signupSuccess) signupSuccess.hidden = false;
}

function showSignupError(msg) {
  // Re-use error el if available, else alert
  const errEl  = document.createElement('div');
  errEl.className = 'login-error visible shake';
  errEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i><span>${msg}</span>`;
  signupForm?.prepend(errEl);
  setTimeout(() => errEl.remove(), 4000);
}

// ══════════════════════════════════════════════════════════
// MVP CREDENTIAL VALIDATOR
// ══════════════════════════════════════════════════════════
function validateCredentials(id, password) {
  return DUMMY_USERS.find(u => u.id === id && u.password === password) ?? null;
}

// ══════════════════════════════════════════════════════════
// INLINE VALIDATION — Counselor ID field checkmark
// ══════════════════════════════════════════════════════════
function validateCounselorIdField() {
  // Valid format: GOV-C-XXX (at least 3 chars after last dash)
  const val   = counselorIdEl?.value || '';
  const valid = /^GOV-C-\w{3,}$/.test(val);
  checkIdIcon?.classList.toggle('visible', valid);
}

// ══════════════════════════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════════════════════════
function showError(msg) {
  if (errorMsgEl) errorMsgEl.textContent = msg;
  if (errorEl) {
    errorEl.classList.add('visible');
    errorEl.classList.remove('shake');
    void errorEl.offsetWidth; // force reflow to restart animation
    errorEl.classList.add('shake');
  }
}

function clearError() {
  errorEl?.classList.remove('visible', 'shake');
  counselorIdEl?.classList.remove('is-invalid');
  passwordEl?.classList.remove('is-invalid');
}

function setLoadingState(loading) {
  if (!btnLoginEl) return;
  btnLoginEl.disabled = loading;
  if (btnTextEl)    btnTextEl.style.display    = loading ? 'none'  : 'flex';
  if (btnSpinnerEl) btnSpinnerEl.style.display = loading ? 'flex'  : 'none';
}

function togglePasswordVisibility(inputEl, toggleBtn) {
  if (!inputEl) return;
  const isHidden = inputEl.type === 'password';
  inputEl.type   = isHidden ? 'text' : 'password';
  const icon = toggleBtn?.querySelector('i');
  if (icon) icon.className = `fa-solid ${isHidden ? 'fa-eye-slash' : 'fa-eye'}`;
}

// ══════════════════════════════════════════════════════════
// GLOBAL LOGOUT — callable from any page
// ══════════════════════════════════════════════════════════
window.handleLogout = function () {
  sessionStorage.removeItem('counselor_session');
  window.location.replace('/login.html');
};
