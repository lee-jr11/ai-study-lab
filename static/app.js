// ══════════════════════════════════════════════
// 1. FIREBASE
// ══════════════════════════════════════════════
const firebaseConfig = {
    apiKey: "AIzaSyBLzvo0xYQCyfEePzzfSAi0zfDS7i0P2Fc",
    authDomain: "lee-ai-lab.firebaseapp.com",
    projectId: "lee-ai-lab",
    storageBucket: "lee-ai-lab.firebasestorage.app",
    messagingSenderId: "166368466462",
    appId: "1:166368466462:web:3cb4e89d8f7f426a99000f"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();   // Firestore for session history
// Keep the account signed in across reloads in this tab; closing it ends the session.
auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
    .catch(err => console.error('Could not set session persistence:', err))
    .finally(() => {
        if (typeof auth.getRedirectResult === 'function') {
            auth.getRedirectResult().catch(err => {
                if (err?.code !== 'auth/popup-closed-by-user') {
                    showAuthError(authErrorMessage(err));
                }
            });
        }

        auth.onAuthStateChanged((user) => {
            if (user) {
                isAuthViewOpen = false;
                landingContainer.style.display = 'none';
                authContainer.style.display = 'none';
                appContainer.style.display  = 'block';
                logoutBtn.style.display     = 'flex';
                skipLink.href = '#app-container';
                skipLink.innerText = 'Skip to workspace';
                currentUserName = (user.displayName || 'Explorer').split(' ')[0];
                document.getElementById('welcome-text').innerText = `Signed in as ${currentUserName}`;
                setProfileIdentity(user.displayName || currentUserName);
                resetTimer();
            } else {
                appContainer.style.display  = 'none';
                logoutBtn.style.display     = 'none';
                setProfileMenu(false);
                // Sign-out (manual, auto, or any other path): fully tear down the
                // previous user's tool state and delete any hosted chat document.
                teardownAppState();
                if (isAuthViewOpen) {
                    showSignInScreen();
                } else {
                    showLandingScreen();
                }
            }
        });
    });

// ══════════════════════════════════════════════
// 2. AUTH LOGIC
// ══════════════════════════════════════════════
let isSignUpMode = false;
const authContainer = document.getElementById('auth-container');
const appContainer  = document.getElementById('app-container');
const landingContainer = document.getElementById('landing-container');
const logoutBtn     = document.getElementById('logoutBtn');
const errorBox      = document.getElementById('auth-error');
const skipLink      = document.getElementById('skip-link');
let currentUserName = '';
let isAuthViewOpen = false;
let authMessageTimer;

function showSignInScreen() {
    if (auth.currentUser) return;
    isAuthViewOpen = true;
    landingContainer.style.display = 'none';
    appContainer.style.display = 'none';
    authContainer.style.display = 'grid';
    logoutBtn.style.display = 'none';
    setProfileMenu(false);
    skipLink.href = '#auth-container';
    skipLink.innerText = 'Skip to sign in';
    window.scrollTo(0, 0);
    setTimeout(() => {
        if (isAuthViewOpen) document.getElementById('auth-email').focus({ preventScroll: true });
    }, 60);
}

function showLandingScreen() {
    if (auth.currentUser) return;
    isAuthViewOpen = false;
    authContainer.style.display = 'none';
    appContainer.style.display = 'none';
    landingContainer.style.display = 'block';
    logoutBtn.style.display = 'none';
    setProfileMenu(false);
    skipLink.href = '#landing-container';
    skipLink.innerText = 'Skip to overview';
    window.scrollTo(0, 0);
}

function toggleAuthMode() {
    isSignUpMode = !isSignUpMode;
    document.getElementById('auth-form-title').innerText = isSignUpMode ? 'Create account' : 'Sign in';
    document.getElementById('auth-submit-btn').innerText   = isSignUpMode ? 'Create account' : 'Sign in';
    document.getElementById('auth-mode-text').innerText    = isSignUpMode ? 'Already have an account?' : "Don't have an account?";
    document.getElementById('auth-mode-toggle').innerText  = isSignUpMode ? 'Sign in' : 'Create one';
    document.getElementById('auth-subtitle').innerText     = isSignUpMode ? 'Create an account for your study workspace.' : 'Continue to your study workspace.';
    const sf = document.getElementById('signup-fields');
    sf.style.display = isSignUpMode ? 'block' : 'none';
    document.getElementById('forgot-password-row').style.display = isSignUpMode ? 'none' : 'block';
    const passwordInput = document.getElementById('auth-password');
    passwordInput.autocomplete = isSignUpMode ? 'new-password' : 'current-password';
    if (isSignUpMode) passwordInput.setAttribute('minlength', '8');
    else passwordInput.removeAttribute('minlength');
    document.getElementById('auth-firstname').required = isSignUpMode;
    // Hide strength bar when switching
    document.getElementById('pw-strength-bar').style.display  = 'none';
    document.getElementById('pw-strength-text').style.display = 'none';
    document.getElementById('pw-checklist').hidden = true;
    errorBox.style.display = 'none';
    clearAuthFieldErrors();
}

function clearFieldError(input) {
    const field = input.closest('.field');
    const message = document.getElementById(`${input.id}-error`);
    input.removeAttribute('aria-invalid');
    field?.classList.remove('has-error');
    if (message) message.textContent = '';
}

function setFieldError(input, message) {
    const field = input.closest('.field');
    const error = document.getElementById(`${input.id}-error`);
    input.setAttribute('aria-invalid', 'true');
    field?.classList.add('has-error');
    if (error) error.textContent = message;
}

function clearAuthFieldErrors() {
    document.querySelectorAll('#authForm [aria-invalid="true"]').forEach(clearFieldError);
}

function validateAuthField(input) {
    const value = input.value.trim();
    clearFieldError(input);

    if (input.id === 'auth-firstname' && isSignUpMode && !value) {
        setFieldError(input, 'Enter your first name.');
        return false;
    }
    if (input.id === 'auth-email') {
        if (!value) {
            setFieldError(input, 'Enter your email address.');
            return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            setFieldError(input, 'Enter a full email address, such as name@school.edu.');
            return false;
        }
    }
    if (input.id === 'auth-password') {
        if (!input.value) {
            setFieldError(input, 'Enter your password.');
            return false;
        }
        if (isSignUpMode && input.value.length < 8) {
            setFieldError(input, 'Use at least 8 characters so the account can be created.');
            return false;
        }
    }
    return true;
}

function validateAuthForm() {
    const fields = [
        isSignUpMode ? document.getElementById('auth-firstname') : null,
        document.getElementById('auth-email'),
        document.getElementById('auth-password'),
    ].filter(Boolean);
    const firstInvalid = fields.find(field => !validateAuthField(field));
    if (firstInvalid) {
        firstInvalid.focus();
        return false;
    }
    return true;
}

function setAuthPending(pending) {
    const form = document.getElementById('authForm');
    const btn = document.getElementById('auth-submit-btn');
    const label = isSignUpMode ? 'Create account' : 'Sign in';
    form.setAttribute('aria-busy', String(pending));
    form.querySelectorAll('input, button').forEach(control => {
        control.disabled = pending;
    });
    document.getElementById('auth-google-btn').disabled = pending;
    document.querySelector('.auth-switch').disabled = pending;
    btn.setAttribute('aria-busy', String(pending));
    if (pending) {
        const pendingLabel = isSignUpMode ? 'Creating account…' : 'Signing in…';
        btn.innerHTML = `<span class="button-spinner" aria-hidden="true"></span><span>${pendingLabel}</span>`;
    } else {
        btn.textContent = label;
    }
}

['auth-firstname', 'auth-lastname', 'auth-nickname', 'auth-email', 'auth-password'].forEach(id => {
    const input = document.getElementById(id);
    input.addEventListener('blur', () => validateAuthField(input));
    input.addEventListener('input', () => {
        if (input.getAttribute('aria-invalid') === 'true') clearFieldError(input);
    });
});

document.getElementById('authForm').addEventListener('submit', (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';
    if (!validateAuthForm()) return;
    const email    = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const btn      = document.getElementById('auth-submit-btn');
    setAuthPending(true);

    if (isSignUpMode) {
        const fName     = document.getElementById('auth-firstname').value.trim();
        const nickname  = document.getElementById('auth-nickname').value.trim();
        const preferred = nickname || fName;
        auth.createUserWithEmailAndPassword(email, password)
            .then(cred => cred.user.updateProfile({ displayName: preferred }))
            .then(() => {
                currentUserName = preferred;
                document.getElementById('welcome-text').innerText = `Signed in as ${preferred}`;
                setProfileIdentity(preferred);
            })
            .catch(err => showAuthError(authErrorMessage(err)))
            .finally(() => setAuthPending(false));
    } else {
        auth.signInWithEmailAndPassword(email, password)
            .catch(err => showAuthError(authErrorMessage(err)))
            .finally(() => setAuthPending(false));
    }
});

function authErrorMessage(err) {
    const messages = {
        'auth/invalid-credential': 'Incorrect email or password. Please try again.',
        'auth/wrong-password': 'Incorrect email or password. Please try again.',
        'auth/user-not-found': 'No account was found for that email address.',
        'auth/email-already-in-use': 'An account already exists for that email address. Sign in instead.',
        'auth/invalid-email': 'Enter a valid email address.',
        'auth/weak-password': 'Use at least 8 characters for your password.',
        'auth/missing-password': 'Enter your password to continue.',
        'auth/too-many-requests': 'Too many attempts. Wait a moment, then try again.',
        'auth/network-request-failed': 'The network connection failed. Check your connection and try again.',
        'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups and try again.',
        'auth/popup-closed-by-user': 'The sign-in window closed before sign-in finished.',
        'auth/unauthorized-domain': 'This domain is not authorised for sign-in.',
        'auth/operation-not-allowed': 'This sign-in method is not enabled for the app.',
    };
    return messages[err?.code] || 'We could not complete that request. Please try again.';
}

function handleGoogleLogin() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => {
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
            showAuthError('Popup blocked by your browser. Redirecting to Google...');
            auth.signInWithRedirect(provider);
        } else {
            showAuthError(authErrorMessage(err));
        }
    });
}
async function handleLogout() {
    if (await confirmAction('Sign out of Study Lab?', 'Sign out')) {
        isAuthViewOpen = false;
        auth.signOut();
    }
}
function triggerPasswordReset() {
    const email = document.getElementById('auth-email').value.trim();
    if (!email) { showAuthError('Enter your email address first, then click Forgot Password.'); return; }
    auth.sendPasswordResetEmail(email)
        .then(() => {
            showAuthSuccess('Reset link sent. Check your inbox and spam folder.');
        })
        .catch(err => showAuthError(authErrorMessage(err)));
}

function showAuthMessage(msg, success = false) {
    clearTimeout(authMessageTimer);
    errorBox.classList.toggle('is-success', success);
    errorBox.style.color = '';
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
    if (!success) {
        errorBox.focus({ preventScroll: true });
        return;
    }
    authMessageTimer = setTimeout(() => {
        errorBox.classList.remove('is-success');
        errorBox.style.display = 'none';
    }, 6000);
}
function showAuthError(msg) {
    showAuthMessage(msg);
}
function showAuthSuccess(msg) {
    showAuthMessage(msg, true);
}
function resetAuthBtn() {
    setAuthPending(false);
}

let confirmResolver = null;
function confirmAction(message, confirmLabel = 'Confirm') {
    const dialog = document.getElementById('confirm-dialog');
    if (!dialog || typeof dialog.showModal !== 'function') {
        return Promise.resolve(window.confirm(message));
    }
    document.getElementById('confirm-dialog-message').textContent = message;
    document.getElementById('confirm-dialog-accept').textContent = confirmLabel;
    dialog.returnValue = '';
    dialog.showModal();
    return new Promise(resolve => {
        confirmResolver = resolve;
    });
}

document.getElementById('confirm-dialog').addEventListener('close', function () {
    if (!confirmResolver) return;
    confirmResolver(this.returnValue === 'confirm');
    confirmResolver = null;
});

let noticeTimer;
function showNotice(message) {
    const notice = document.getElementById('app-notice');
    clearTimeout(noticeTimer);
    notice.textContent = message;
    notice.hidden = false;
    noticeTimer = setTimeout(() => {
        notice.hidden = true;
    }, 6000);
}

// Toggle password visibility
document.getElementById('togglePassword').addEventListener('click', () => {
    const input = document.getElementById('auth-password');
    const icon  = document.getElementById('eye-icon');
    if (input.type === 'password') {
        input.type = 'text';
        document.getElementById('togglePassword').setAttribute('aria-label', 'Hide password');
        document.getElementById('togglePassword').setAttribute('aria-pressed', 'true');
        icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/>';
    } else {
        input.type = 'password';
        document.getElementById('togglePassword').setAttribute('aria-label', 'Show password');
        document.getElementById('togglePassword').setAttribute('aria-pressed', 'false');
        icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>';
    }
});

// Password strength checker (signup only)
document.getElementById('auth-password').addEventListener('input', function () {
    if (!isSignUpMode) return;
    const bar       = document.getElementById('pw-strength-bar');
    const text      = document.getElementById('pw-strength-text');
    const checklist = document.getElementById('pw-checklist');
    const val       = this.value;
    if (!val) {
        bar.style.display = 'none';
        text.style.display = 'none';
        checklist.hidden = true;
        return;
    }

    const checks = {
        length: val.length >= 8,
        upper: /[A-Z]/.test(val),
        number: /[0-9]/.test(val),
        symbol: /[^A-Za-z0-9]/.test(val),
    };
    checklist.hidden = false;
    Object.entries(checks).forEach(([rule, met]) => {
        const item = checklist.querySelector(`[data-password-rule="${rule}"]`);
        item.classList.toggle('is-met', met);
        item.querySelector('i').className = met ? 'ph ph-check' : 'ph ph-circle';
    });

    let score = 0;
    Object.values(checks).forEach(met => { if (met) score++; });
    bar.className  = 'pw-strength-bar';
    text.className = 'pw-strength-text';
    bar.style.display = 'block'; text.style.display = 'block';
    if (score <= 1) { bar.classList.add('weak');   text.classList.add('weak');   text.innerText = 'Weak password'; }
    else if (score <= 2) { bar.classList.add('med'); text.classList.add('med');   text.innerText = 'Medium password'; }
    else { bar.classList.add('strong'); text.classList.add('strong'); text.innerText = 'Strong password'; }
});

// ══════════════════════════════════════════════
// 3. THEME & LANGUAGE
// ══════════════════════════════════════════════
const rootEl = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
const themeIcon   = document.getElementById('themeIcon');
const themeColor  = document.querySelector('meta[name="theme-color"]');
const sunIcon  = '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"/>';
const moonIcon = '<path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"/>';
function readThemePreference() {
    try { return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
}

function syncBrowserThemeColor() {
    themeColor?.setAttribute('content', getComputedStyle(rootEl).getPropertyValue('--paper').trim());
}

const storedTheme = readThemePreference();
rootEl.setAttribute('data-theme', storedTheme);
themeIcon.innerHTML = storedTheme === 'dark' ? sunIcon : moonIcon;
themeToggle.setAttribute('aria-label', storedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
syncBrowserThemeColor();
themeToggle.addEventListener('click', () => {
    const next = rootEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    rootEl.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch { /* Theme still works for this page. */ }
    themeIcon.innerHTML = next === 'dark' ? sunIcon : moonIcon;
    themeToggle.setAttribute('aria-label', next === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    syncBrowserThemeColor();
});

const langToggle   = document.getElementById('langToggle');
const langDropdown = document.getElementById('langDropdown');
function setLanguageMenu(open) {
    langDropdown.style.display = open ? 'flex' : 'none';
    langToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}
langToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setLanguageMenu(langToggle.getAttribute('aria-expanded') !== 'true');
});
document.addEventListener('click', (e) => { if (!e.target.closest('.custom-lang-selector')) setLanguageMenu(false); });
document.querySelectorAll('.lang-option').forEach(opt => {
    opt.addEventListener('click', function () {
        const code = this.getAttribute('data-lang');
        const sel  = document.querySelector('.goog-te-combo');
        if (sel) { sel.value = code; sel.dispatchEvent(new Event('change', { bubbles: true })); }
        else { document.cookie = `googtrans=/en/${code}; path=/;`; window.location.reload(); }
        setLanguageMenu(false);
    });
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && langToggle.getAttribute('aria-expanded') === 'true') {
        setLanguageMenu(false);
        langToggle.focus();
    }
});

function profileInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'L';
    return parts.slice(0, 2).map(part => part[0].toUpperCase()).join('');
}

function setProfileIdentity(name) {
    const safeName = String(name || 'Explorer').trim() || 'Explorer';
    const initials = profileInitials(safeName);
    document.getElementById('profile-avatar').textContent = initials;
    document.getElementById('profile-mini-avatar').textContent = initials;
    document.getElementById('profile-name').textContent = safeName;
    logoutBtn.setAttribute('aria-label', `Open account menu for ${safeName}`);
}

function setProfileMenu(open) {
    const dropdown = document.getElementById('profileDropdown');
    dropdown.style.display = open ? 'grid' : 'none';
    logoutBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function toggleProfileMenu(event) {
    event?.stopPropagation();
    setProfileMenu(logoutBtn.getAttribute('aria-expanded') !== 'true');
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.profile-menu')) setProfileMenu(false);
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && logoutBtn.getAttribute('aria-expanded') === 'true') {
        setProfileMenu(false);
        logoutBtn.focus();
    }
});

// ══════════════════════════════════════════════
// 4. HELPERS
// ══════════════════════════════════════════════
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
}

function formatAndSanitize(text) {
    // Escape first, then apply safe markdown, then sanitize
    const escaped = escapeHtml(text);
    const formatted = escaped
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g,    '<em>$1</em>')
        .replace(/\n/g,            '<br>');
    return (typeof DOMPurify !== 'undefined')
        ? DOMPurify.sanitize(formatted, { ALLOWED_TAGS: ['strong','em','br','p','ul','li','ol'] })
        : formatted;
}

function showWithFade(el) {
    el.style.display = 'block';
    el.classList.remove('fade-in');
    void el.offsetWidth;
    el.classList.add('fade-in');
}

function nowTimeStr() {
    const n = new Date();
    return n.getHours().toString().padStart(2,'0') + ':' + n.getMinutes().toString().padStart(2,'0');
}

// Authenticated fetch: attaches the Firebase ID token to every API call.
// On 401 the session is signed out with a friendly message.
async function apiFetch(url, options = {}) {
    const user = auth.currentUser;
    if (!user) throw new Error('Please sign in again.');
    const token = await user.getIdToken();
    if (auth.currentUser?.uid !== user.uid) throw new Error('Your signed-in account changed.');
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', 'Bearer ' + token);
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
        if (auth.currentUser?.uid !== user.uid) throw new Error('Your signed-in account changed.');
        let errorMsg = 'Your session expired. Please sign in again.';
        try {
            const errData = await res.json();
            if (errData.error) errorMsg = errData.error;
        } catch (e) {}
        await auth.signOut();
        showSignInScreen();
        showAuthError(errorMsg);
        throw new Error(errorMsg);
    }
    return res;
}

// ══════════════════════════════════════════════
// 5. DASHBOARD & TOOL NAV
// ══════════════════════════════════════════════
function openTool(mode) {
    document.getElementById('dashboard-view').style.display = 'none';
    showWithFade(document.getElementById('tool-view'));
    window.scrollTo(0, 0);
    document.getElementById('generation-mode').value = mode;

    const isChat  = mode === 'chat' || mode === 'voice';
    const isQuiz  = mode === 'quiz';

    document.getElementById('quizForm').style.display = 'block';
    document.getElementById('chat-ui-container').style.display  = 'none';
    document.getElementById('quiz-container').style.display     = 'none';
    document.getElementById('flashcard-container').style.display= 'none';
    document.getElementById('result-container').style.display   = 'none';
    document.getElementById('review-container').style.display   = 'none';
    document.getElementById('pdf-answers-label').style.display  = 'none';

    if (isChat) {
        document.getElementById('tool-title').innerText = mode === 'voice' ? 'Talk it through' : 'Ask the source';
        document.getElementById('submitBtn').innerText  = 'Start session';
        document.getElementById('difficulty-group').style.display     = 'none';
        document.getElementById('timer-group').style.display          = 'none';
        document.getElementById('target-output-group').style.display  = 'none';
        // Voice mode: TTS on by default; Chat: TTS off
        ttsEnabled = (mode === 'voice');
        updateTTSButton();
    } else {
        document.getElementById('difficulty-group').style.display    = 'block';
        document.getElementById('timer-group').style.display         = isQuiz ? 'block' : 'none';
        document.getElementById('target-output-group').style.display = 'block';
        document.getElementById('tool-title').innerText  = isQuiz ? 'Build a quiz' : 'Make flashcards';
        document.getElementById('submitBtn').innerText   = isQuiz ? 'Generate quiz' : 'Generate flashcards';

        document.getElementById('target-output-text').innerText = isQuiz
            ? 'Number of questions'
            : 'Number of flashcards';
        document.getElementById('num_questions-help').innerText = isQuiz
            ? 'Enter a whole number from 1 to 30.'
            : 'Enter a whole number from 1 to 30.';
    }
}

let toolSessionVersion = 0;
let generationPending = false;

function setToolError(message = '') {
    const error = document.getElementById('tool-error');
    error.textContent = message;
    error.hidden = !message;
}

function setUploadError(message = '') {
    const input = document.getElementById('document');
    const error = document.getElementById('document-error');
    const group = document.getElementById('document-group');
    const zone = document.getElementById('drop-zone');
    const invalid = Boolean(message);
    input.setAttribute('aria-invalid', String(invalid));
    zone.setAttribute('aria-invalid', String(invalid));
    error.textContent = message;
    error.hidden = !invalid;
    group.classList.toggle('has-error', invalid);
    zone.classList.toggle('is-invalid', invalid);
}

function validateQuestionCount() {
    const input = document.getElementById('num_questions');
    const value = input.value.trim();
    const count = Number(value);
    if (!value) return 'Enter how many questions you want, from 1 to 30.';
    if (!Number.isInteger(count)) return 'Enter a whole number from 1 to 30.';
    if (count < 1 || count > 30) return 'Enter a number from 1 to 30.';
    return '';
}

function setQuestionCountError(message = '') {
    const input = document.getElementById('num_questions');
    const error = document.getElementById('num_questions-error');
    const group = document.getElementById('target-output-group');
    const invalid = Boolean(message);
    input.setAttribute('aria-invalid', String(invalid));
    error.textContent = message;
    error.hidden = !invalid;
    group.classList.toggle('has-error', invalid);
}

function setGenerationPending(pending, mode = 'quiz') {
    const form = document.getElementById('quizForm');
    const button = document.getElementById('submitBtn');
    const status = document.getElementById('form-status');
    const normalLabel = mode === 'chat' || mode === 'voice'
        ? 'Start session'
        : mode === 'flashcard'
            ? 'Generate flashcards'
            : 'Generate quiz';
    const pendingLabel = mode === 'chat' || mode === 'voice'
        ? 'Starting session…'
        : mode === 'flashcard'
            ? 'Building flashcards…'
            : 'Building quiz…';

    form.setAttribute('aria-busy', String(pending));
    form.querySelectorAll('input, select, button').forEach(control => {
        control.disabled = pending;
    });
    button.setAttribute('aria-busy', String(pending));
    if (pending) {
        button.innerHTML = `<span class="button-spinner" aria-hidden="true"></span><span>${pendingLabel}</span>`;
        status.textContent = 'Preparing your study set. Keep this tab open.';
        status.hidden = false;
    } else {
        button.textContent = normalLabel;
        status.textContent = '';
        status.hidden = true;
    }
}

function resetToolInteractions() {
    toolSessionVersion++;
    generationPending = false;
    setToolError();
    setUploadError();
    setQuestionCountError();
    setGenerationPending(false, document.getElementById('generation-mode').value);
    hideTypingIndicator();
    try { if (activeRecognition) activeRecognition.abort(); } catch (_) {}
    activeRecognition = null;
    document.getElementById('mic-btn').setAttribute('aria-pressed', 'false');
    document.getElementById('mic-btn').setAttribute('aria-label', 'Use microphone');
    document.getElementById('chat-input-box').disabled = false;
    document.getElementById('chat-input-box').value = '';
    document.getElementById('chat-input-box').placeholder = 'Ask about a passage or concept';
    document.getElementById('send-chat-btn').disabled = false;
    document.getElementById('send-chat-btn').innerText = 'Send';
    document.getElementById('mic-btn').disabled = !SpeechRecognition;
    document.getElementById('mic-btn').classList.remove('mic-active');
    document.querySelectorAll('.restored-banner').forEach(el => el.remove());
}

function resetAppToDashboard() {
    resetToolInteractions();
    // Stop any running timers/TTS
    stopQuizTimer();
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    document.getElementById('tool-view').style.display       = 'none';
    document.getElementById('chat-ui-container').style.display   = 'none';
    document.getElementById('quiz-container').style.display      = 'none';
    document.getElementById('flashcard-container').style.display = 'none';
    document.getElementById('result-container').style.display    = 'none';
    document.getElementById('review-container').style.display    = 'none';
    document.getElementById('quizForm').reset();
    updateTimerDurationVisibility();
    updateDifficulty();
    document.getElementById('quizForm').style.display = 'block';

    const dz = document.getElementById('drop-zone');
    dz.classList.remove('is-invalid', 'is-selected', 'drag-over');
    document.getElementById('file-name-display').innerText = 'Drop a PDF or PPTX here';

    cleanupActiveChatFile();
    chatHistory = [];
    document.getElementById('chat-messages').innerHTML =
        '<div class="chat-bubble ai"><span class="msg-role">Tutor</span><div class="msg-content">Hello. I\'ve read your document. What would you like me to explain?</div></div>';

    quizData = []; userAnswers = []; questionTimeRemaining = []; questionTimedOut = []; activeQuizTimerLimit = null; currentIndex = 0;
    hideTimerTimeoutNotice();
    flashcardDeck = []; knewItCount = 0; stillLearningCards = []; fcCardFlipped = false;

    document.getElementById('fc-action-btns').style.display = 'none';
    document.getElementById('fc-inner').classList.remove('is-flipped');

    showWithFade(document.getElementById('dashboard-view'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ══════════════════════════════════════════════
// 6. DIFFICULTY SLIDER (colour-shifting)
// ══════════════════════════════════════════════
const slider      = document.getElementById('difficulty-slider');
const hiddenDiff  = document.getElementById('difficulty-hidden');
const diffLabels  = [document.getElementById('lbl-1'), document.getElementById('lbl-2'), document.getElementById('lbl-3')];
function updateDifficulty() {
    const val = parseInt(slider.value);
    diffLabels.forEach(l => l.classList.remove('active'));
    diffLabels[val - 1].classList.add('active');
    const labels  = { 1: 'easy',    2: 'medium',   3: 'hard' };
    hiddenDiff.value = labels[val];
    slider.setAttribute('aria-valuetext', diffLabels[val - 1].textContent);
    document.getElementById('difficulty-value').textContent =
        `${diffLabels[val - 1].textContent} difficulty`;
}
slider.addEventListener('input', updateDifficulty);
updateDifficulty();

function updateTimerDurationVisibility() {
    const enabled = document.getElementById('timer-enabled').checked;
    document.getElementById('timer-duration-group').style.display = enabled ? 'block' : 'none';
}
document.getElementById('timer-enabled').addEventListener('change', updateTimerDurationVisibility);

// ══════════════════════════════════════════════
// 7. FILE INPUT
// ══════════════════════════════════════════════
document.getElementById('document').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const error = validateUpload(file);
    const zone = document.getElementById('drop-zone');
    zone.classList.remove('is-invalid', 'is-selected');
    setToolError();
    setUploadError(error);
    if (error) {
        this.value = '';
        document.getElementById('file-name-display').innerText = 'Choose a PDF or PPTX';
        return;
    }
    document.getElementById('file-name-display').innerText = file.name;
    const dz = document.getElementById('drop-zone');
    dz.classList.remove('is-invalid');
    dz.classList.add('is-selected');
});

// ── Drag & Drop (dual functionality: works ALONGSIDE click-to-browse) ──
const ALLOWED_UPLOAD_EXTS = ['.pdf', '.pptx'];
function validateUpload(file) {
    if (!file) return 'Choose a PDF or PPTX file to continue. Select the upload area to browse.';
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_UPLOAD_EXTS.includes(ext)) return 'Only PDF and PPTX files are supported. Choose a file with one of those extensions.';
    if (!file.size) return 'This file is empty. Choose a different PDF or PPTX file.';
    if (file.size > 10 * 1024 * 1024) return 'This file is larger than 10 MB. Choose a smaller PDF or PPTX file.';
    return '';
}
const dropZoneEl = document.getElementById('drop-zone');
const docInputEl = document.getElementById('document');
docInputEl.addEventListener('invalid', (event) => {
    event.preventDefault();
    setUploadError(validateUpload(docInputEl.files[0]));
    dropZoneEl.focus();
});

document.getElementById('num_questions').addEventListener('blur', () => {
    if (document.getElementById('tool-view').style.display === 'none') return;
    setQuestionCountError(validateQuestionCount());
});

dropZoneEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        docInputEl.click();
    }
});

// Safety net: stop the browser from opening a file dropped ANYWHERE on the page
['dragover', 'drop'].forEach(ev =>
    window.addEventListener(ev, (e) => e.preventDefault())
);

let dragDepth = 0;   // counts nested enter/leave pairs to avoid highlight flicker

dropZoneEl.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    dropZoneEl.classList.add('drag-over');
});

dropZoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();   // required to allow a drop
});

dropZoneEl.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropZoneEl.classList.remove('drag-over');
});

dropZoneEl.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropZoneEl.classList.remove('drag-over');

    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;

    // Feed the dropped file into the SAME hidden input the browse button uses,
    // then fire the same change event so ALL existing validation applies
    // (10 MB size check, filename display, green highlight).
    if (typeof DataTransfer === 'undefined') {
        showNotice('Drag-and-drop is unavailable in this browser. Browse for your file instead.');
        return;
    }
    const dt = new DataTransfer();
    dt.items.add(file);
    docInputEl.files = dt.files;
    docInputEl.dispatchEvent(new Event('change'));
});

// ══════════════════════════════════════════════
// 9. FORM SUBMIT (generate quiz / flashcards / init chat)
// ══════════════════════════════════════════════
let quizData    = [];
let userAnswers = [];
let currentIndex = 0;
let activeFileId = null;
let activeCleanupTicket = null;   // signed token enabling tab-close cleanup beacon

document.getElementById('quizForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mode   = document.getElementById('generation-mode').value;
    const isChat = mode === 'chat' || mode === 'voice';

    if (generationPending) return;
    const fileInput = document.getElementById('document');
    const file      = fileInput.files[0];
    const fileError = validateUpload(file);
    const countError = isChat ? '' : validateQuestionCount();
    setToolError();
    setUploadError(fileError);
    setQuestionCountError(countError);
    if (fileError) {
        dropZoneEl.focus();
        return;
    }
    if (countError) {
        document.getElementById('num_questions').focus();
        return;
    }
    const sessionVersion = toolSessionVersion;
    generationPending = true;
    setGenerationPending(true, mode);

    try {
        const ext       = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '.pdf';
        const fd        = new FormData();
        fd.append('document', file, 'upload' + ext);

        if (isChat) {
            const res  = await apiFetch('/init_chat', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            if (sessionVersion !== toolSessionVersion) {
                cleanupChatFile(data.file_id, data.ct);
                return;
            }
            activeFileId = data.file_id;
            activeCleanupTicket = data.ct || null;
            e.target.style.display = 'none';
            showWithFade(document.getElementById('chat-ui-container'));
            if (mode === 'voice' && SpeechRecognition) document.getElementById('mic-btn').click();
            return;
        }

        fd.append('difficulty',    document.getElementById('difficulty-hidden').value);
        fd.append('num_questions', document.getElementById('num_questions').value);
        fd.append('mode',          mode);

        const res  = await apiFetch('/generate', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        if (sessionVersion !== toolSessionVersion) return;
        // Defense-in-depth: never let malformed AI data reach the renderers
        if (!Array.isArray(data.quiz) || data.quiz.length === 0) {
            throw new Error('The AI returned no usable content. Please try again.');
        }
        quizData     = data.quiz;
        currentIndex = 0;
        // "Include my answers" only makes sense for a completed quiz
        document.getElementById('pdf-answers-label').style.display = (mode === 'quiz') ? 'inline-block' : 'none';
        e.target.style.display = 'none';

        if (mode === 'quiz') {
            userAnswers = new Array(quizData.length).fill(null);
            activeQuizTimerLimit = getQuizTimerLimit();
            questionTimeRemaining = new Array(quizData.length).fill(activeQuizTimerLimit);
            questionTimedOut = new Array(quizData.length).fill(false);
            hideTimerTimeoutNotice();
            showWithFade(document.getElementById('quiz-container'));
            renderQuestion();
        } else {
            flashcardDeck      = [...quizData];
            knewItCount        = 0;
            stillLearningCards = [];
            fcCardFlipped      = false;
            showWithFade(document.getElementById('flashcard-container'));
            renderFlashcard();
        }
    } catch (err) {
        if (sessionVersion !== toolSessionVersion) return;
        e.target.style.display = 'block';
        setToolError(err.message || 'Could not prepare your document. Please try again.');
    } finally {
        if (sessionVersion === toolSessionVersion) {
            generationPending = false;
            setGenerationPending(false, mode);
        }
    }
});

// ══════════════════════════════════════════════
// 10. QUIZ LOGIC
// ══════════════════════════════════════════════
let quizTimerInterval = null;
let quizTimeLeft      = 0;
let questionTimeRemaining = [];
let questionTimedOut      = [];
let timerNoticeTimeout    = null;
let activeQuizTimerLimit  = null;
const TIMER_DURATION_OPTIONS = new Set([30, 45, 60, 90]);

function getQuizTimerLimit() {
    if (!document.getElementById('timer-enabled').checked) return null;
    const selectedDuration = Number.parseInt(document.getElementById('timer-duration').value, 10);
    return TIMER_DURATION_OPTIONS.has(selectedDuration) ? selectedDuration : null;
}

function startQuizTimer() {
    const limit = activeQuizTimerLimit;
    if (!limit) { document.getElementById('timer-wrapper').style.display = 'none'; return; }

    if (questionTimeRemaining[currentIndex] === undefined || questionTimeRemaining[currentIndex] === null) {
        questionTimeRemaining[currentIndex] = limit;
    }
    quizTimeLeft = questionTimeRemaining[currentIndex];

    // Once an answer is chosen, its timer is paused. A timed-out question stays locked.
    if (userAnswers[currentIndex] !== null) {
        document.getElementById('timer-wrapper').style.display = 'none';
        return;
    }
    document.getElementById('timer-wrapper').style.display = 'flex';
    updateTimerUI(limit);
    if (questionTimedOut[currentIndex] || quizTimeLeft <= 0) return;

    const questionIndex = currentIndex;
    const deadline = Date.now() + quizTimeLeft * 1000;
    quizTimerInterval = setInterval(() => {
        // Background tabs throttle callbacks; elapsed time must still count.
        quizTimeLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        questionTimeRemaining[questionIndex] = Math.max(0, quizTimeLeft);
        updateTimerUI(limit);
        if (quizTimeLeft <= 0) {
            stopQuizTimer();
            questionTimedOut[questionIndex] = true;
            handleQuestionTimeout();
        }
    }, 1000);
}
function stopQuizTimer() {
    clearInterval(quizTimerInterval);
    quizTimerInterval = null;
}
function updateTimerUI(limit) {
    const fill    = document.getElementById('timer-fill');
    const text    = document.getElementById('timer-text');
    const wrapper = document.getElementById('timer-wrapper');
    if (!fill) return;
    const pct = Math.max(0, (quizTimeLeft / limit)) * 100;
    fill.style.transform = `scaleX(${pct / 100})`;
    text.innerText   = Math.max(0, quizTimeLeft) + 's';
    if (quizTimeLeft <= 10) wrapper.classList.add('danger');
    else                    wrapper.classList.remove('danger');
}

function handleQuestionTimeout() {
    showTimerTimeoutNotice();
    if (currentIndex < quizData.length - 1) {
        currentIndex++;
    }
    // Re-rendering locks the expired question and enables Submit on a timed-out final question.
    renderQuestion();
}

function showTimerTimeoutNotice() {
    const notice = document.getElementById('timer-timeout-notice');
    clearTimeout(timerNoticeTimeout);
    notice.style.display = 'block';
    timerNoticeTimeout = setTimeout(() => { notice.style.display = 'none'; }, 3500);
}

function hideTimerTimeoutNotice() {
    clearTimeout(timerNoticeTimeout);
    document.getElementById('timer-timeout-notice').style.display = 'none';
}

function renderQuestion() {
    stopQuizTimer();
    const q = quizData[currentIndex];
    const progress = ((currentIndex + 1) / quizData.length) * 100;
    document.getElementById('progress-fill').style.transform = `scaleX(${progress / 100})`;
    document.getElementById('progress-count').innerText  = `Question ${currentIndex + 1} of ${quizData.length}`;
    document.getElementById('progress-percent').innerText= Math.round(progress) + '%';
    document.getElementById('q-text').innerText          = q.question;

    const opts = document.getElementById('q-options');
    opts.innerHTML = '';
    const letters = ['A','B','C','D','E','F'];
    const timedOut = questionTimedOut[currentIndex] === true;
    q.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.setAttribute('aria-pressed', String(userAnswers[currentIndex] === opt));
        btn.innerHTML = `<span class="option-label">${letters[i]||'-'}</span><span class="option-text">${escapeHtml(opt)}</span>`;
        if (userAnswers[currentIndex] === opt) btn.classList.add('selected');
        btn.disabled = timedOut;
        btn.onclick = () => {
            if (questionTimedOut[currentIndex]) return;
            userAnswers[currentIndex] = opt;
            stopQuizTimer();
            renderQuestion();
        };
        opts.appendChild(btn);
    });

    const prev     = document.getElementById('prevBtn');
    const next     = document.getElementById('nextBtn');
    const sub      = document.getElementById('submitQuizBtn');
    const hasAns   = userAnswers[currentIndex] !== null;
    const isLast   = currentIndex === quizData.length - 1;
    prev.style.display = currentIndex > 0 ? 'block' : 'none';
    if (isLast) {
        next.style.display = 'none'; sub.style.display = 'block';
        sub.disabled = !(hasAns || timedOut);
    } else {
        next.style.display = 'block'; sub.style.display = 'none';
        next.disabled = !(hasAns || timedOut);
    }
    startQuizTimer();
}

function skipQuestion() {
    stopQuizTimer();
    // userAnswers[currentIndex] stays null → counted as wrong
    if (currentIndex < quizData.length - 1) {
        currentIndex++;
        renderQuestion();
    } else {
        // Last question skipped → enable submit
        document.getElementById('submitQuizBtn').disabled = false;
    }
}

document.getElementById('nextBtn').addEventListener('click', () => { if (currentIndex < quizData.length - 1) { currentIndex++; renderQuestion(); } });
document.getElementById('prevBtn').addEventListener('click', () => { if (currentIndex > 0) { currentIndex--; renderQuestion(); } });

function setResultIcon(iconClass) {
    const icon = document.getElementById('result-emoji');
    if (icon) icon.innerHTML = `<i class="ph ${iconClass}" aria-hidden="true"></i>`;
}

document.getElementById('submitQuizBtn').addEventListener('click', () => {
    stopQuizTimer();
    document.getElementById('tool-title').innerText = 'Quiz results';
    let score = 0;
    quizData.forEach((q, i) => { if (q.answer === userAnswers[i]) score++; });
    const pct = Math.round((score / quizData.length) * 100);

    let iconClass, title, subtitle;
    if (pct >= 90) {
        iconClass = 'ph-trophy';
        title = 'Strong recall';
        subtitle = `You answered ${score} of ${quizData.length} questions correctly.`;
    } else if (pct >= 70) {
        iconClass = 'ph-check-circle';
        title = 'A solid pass';
        subtitle = `You answered ${score} of ${quizData.length} questions correctly. Review the misses, then try again.`;
    } else if (pct >= 50) {
        iconClass = 'ph-book-open';
        title = 'Keep the source open';
        subtitle = `You answered ${score} of ${quizData.length} questions correctly. The review shows what needs another pass.`;
    } else {
        iconClass = 'ph-book-open';
        title = 'Review the misses first';
        subtitle = `You answered ${score} of ${quizData.length} questions correctly. Start with the explanations below.`;
    }

    setResultIcon(iconClass);
    document.getElementById('result-title').innerText    = title;
    document.getElementById('result-score').innerText    = pct + '%';
    document.getElementById('result-score').style.display = 'block';
    document.getElementById('result-subtitle').innerText = subtitle;
    document.getElementById('quiz-container').style.display    = 'none';
    document.getElementById('review-btn').style.display        = 'inline-block';
    document.getElementById('review-still-learning-btn').style.display = 'none';
    document.getElementById('retake-btn').innerText            = 'Retake quiz';
    showWithFade(document.getElementById('result-container'));
    // Save to history
    saveSession('quiz', {
        documentName: document.getElementById('file-name-display').innerText || 'Unknown document',
        quizData,
        userAnswers: [...userAnswers],
        score: pct,
        numQuestions: quizData.length,
    });
});

function showReview() {
    document.getElementById('result-container').style.display = 'none';
    const content = document.getElementById('review-content');
    content.innerHTML = '';
    quizData.forEach((q, i) => {
        const userAns   = userAnswers[i];
        const isCorrect = userAns === q.answer;
        const isSkipped = userAns === null;
        let ansHTML;
        if (isSkipped) {
            ansHTML = `<div class="review-ans skipped">Skipped</div><div class="review-ans correct">Correct answer: ${escapeHtml(q.answer)}</div>`;
        } else if (isCorrect) {
            ansHTML = `<div class="review-ans correct">Correct: ${escapeHtml(userAns)}</div>`;
        } else {
            ansHTML = `<div class="review-ans wrong">Your answer: ${escapeHtml(userAns)}</div><div class="review-ans correct">Correct answer: ${escapeHtml(q.answer)}</div>`;
        }
        const insightHTML = q.explanation
            ? `<div class="ai-insight"><strong>AI Insight</strong>${escapeHtml(q.explanation)}</div>`
            : '';
        const block = document.createElement('div');
        block.className = 'review-block';
        block.innerHTML = `<div class="review-q">${i + 1}. ${escapeHtml(q.question)}</div>${ansHTML}${insightHTML}`;
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.title = 'Copy question & answer';
        copyBtn.setAttribute('aria-label', `Copy question ${i + 1} and answer`);
        copyBtn.innerHTML = '<i class="ph ph-copy" aria-hidden="true"></i>';
        copyBtn.onclick = () => copyReviewItem(i, copyBtn);
        block.appendChild(copyBtn);
        content.appendChild(block);
    });
    showWithFade(document.getElementById('review-container'));
}
function hideReview() {
    document.getElementById('review-container').style.display = 'none';
    showWithFade(document.getElementById('result-container'));
}

function retakeQuiz() {
    document.getElementById('result-container').style.display = 'none';
    hideTimerTimeoutNotice();
    const mode = document.getElementById('generation-mode').value;
    document.getElementById('tool-title').innerText = mode === 'flashcard'
        ? 'Make flashcards'
        : 'Build a quiz';
    currentIndex = 0;
    if (mode === 'quiz') {
        userAnswers = new Array(quizData.length).fill(null);
        showWithFade(document.getElementById('quiz-container'));
        renderQuestion();
    } else if (mode === 'flashcard') {
        flashcardDeck      = [...quizData];
        knewItCount        = 0;
        stillLearningCards = [];
        fcCardFlipped      = false;
        currentIndex       = 0;
        document.getElementById('fc-action-btns').style.display = 'none';
        document.getElementById('fc-inner').classList.remove('is-flipped');
        showWithFade(document.getElementById('flashcard-container'));
        renderFlashcard();
    }
}

// ══════════════════════════════════════════════
// 11. FLASHCARD LOGIC (Improved)
// ══════════════════════════════════════════════
let flashcardDeck      = [];
let knewItCount        = 0;
let stillLearningCards = [];
let fcCardFlipped      = false;

function renderFlashcard() {
    const card     = flashcardDeck[currentIndex];
    const total    = flashcardDeck.length;
    const progress = ((currentIndex + 1) / total) * 100;

    document.getElementById('fc-progress-fill').style.transform = `scaleX(${progress / 100})`;
    document.getElementById('fc-progress-count').innerText  = `Card ${currentIndex + 1} of ${total}`;
    document.getElementById('fc-remaining').innerText       = `${total - currentIndex - 1} remaining`;
    document.getElementById('fc-knew-count').innerText      = `${knewItCount} known`;
    document.getElementById('fc-learn-count').innerText     = `${stillLearningCards.length} still learning`;

    document.getElementById('fc-term').innerText = card.term;
    document.getElementById('fc-def').innerText  = card.definition;

    // Reset flip state
    fcCardFlipped = false;
    document.getElementById('fc-inner').classList.remove('is-flipped');
    const scene = document.getElementById('flashcard-scene');
    scene.setAttribute('aria-pressed', 'false');
    scene.setAttribute('aria-label', 'Reveal flashcard definition');
    document.getElementById('fc-action-btns').style.display = 'none';
}

function flipCard() {
    const inner = document.getElementById('fc-inner');
    if (!fcCardFlipped) {
        fcCardFlipped = true;
        inner.classList.add('is-flipped');
        const scene = document.getElementById('flashcard-scene');
        scene.setAttribute('aria-pressed', 'true');
        scene.setAttribute('aria-label', 'Hide flashcard definition');
        showWithFade(document.getElementById('fc-action-btns'));
        document.getElementById('fc-action-btns').style.display = 'flex';
    } else {
        // Flip back = hide rating buttons
        fcCardFlipped = false;
        inner.classList.remove('is-flipped');
        const scene = document.getElementById('flashcard-scene');
        scene.setAttribute('aria-pressed', 'false');
        scene.setAttribute('aria-label', 'Reveal flashcard definition');
        document.getElementById('fc-action-btns').style.display = 'none';
    }
}

document.getElementById('flashcard-scene').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        flipCard();
    }
});

function rateCard(knew) {
    const card = flashcardDeck[currentIndex];
    if (knew) { knewItCount++; }
    else      { stillLearningCards.push(card); }

    fcCardFlipped = false;
    document.getElementById('fc-action-btns').style.display = 'none';
    document.getElementById('fc-inner').classList.remove('is-flipped');

    if (currentIndex >= flashcardDeck.length - 1) {
        showFlashcardResults();
    } else {
        currentIndex++;
        renderFlashcard();
    }
}

function shuffleDeck() {
    const deck = [...flashcardDeck];
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    flashcardDeck      = deck;
    currentIndex       = 0;
    knewItCount        = 0;
    stillLearningCards = [];
    fcCardFlipped      = false;
    document.getElementById('fc-action-btns').style.display = 'none';
    document.getElementById('fc-inner').classList.remove('is-flipped');
    renderFlashcard();
}

function showFlashcardResults() {
    document.getElementById('flashcard-container').style.display = 'none';
    document.getElementById('tool-title').innerText = 'Flashcard results';
    const total = flashcardDeck.length;
    const pct   = total > 0 ? Math.round((knewItCount / total) * 100) : 0;
    setResultIcon(pct >= 50 ? 'ph-check-circle' : 'ph-cards');
    document.getElementById('result-title').innerText     = 'Flashcard session complete';
    document.getElementById('result-score').innerText     = `${knewItCount}/${total}`;
    document.getElementById('result-score').style.display = 'block';
    document.getElementById('result-subtitle').innerText  = stillLearningCards.length > 0
        ? `You knew ${pct}% of the deck. Practice the cards you missed.`
        : `You knew ${pct}% of the deck.`;

    document.getElementById('review-btn').style.display             = 'none';
    document.getElementById('retake-btn').innerText                 = 'Restart deck';
    const slBtn = document.getElementById('review-still-learning-btn');
    if (stillLearningCards.length > 0) {
        slBtn.innerText      = `Review ${stillLearningCards.length} missed card${stillLearningCards.length !== 1 ? 's' : ''}`;
        slBtn.style.display  = 'inline-block';
    } else {
        slBtn.style.display  = 'none';
    }
    showWithFade(document.getElementById('result-container'));
    // Save to history
    saveSession('flashcard', {
        documentName: document.getElementById('file-name-display').innerText || 'Unknown document',
        flashcardDeck: [...flashcardDeck],
        knewItCount,
        stillLearningCount: stillLearningCards.length,
        totalCards: flashcardDeck.length,
        pct,
    });
}

function reviewStillLearning() {
    if (!stillLearningCards.length) return;
    flashcardDeck      = [...stillLearningCards];
    knewItCount        = 0;
    stillLearningCards = [];
    currentIndex       = 0;
    fcCardFlipped      = false;
    document.getElementById('result-container').style.display    = 'none';
    document.getElementById('fc-action-btns').style.display      = 'none';
    document.getElementById('fc-inner').classList.remove('is-flipped');
    showWithFade(document.getElementById('flashcard-container'));
    renderFlashcard();
}

// ══════════════════════════════════════════════
// 12. CHAT, VOICE & TTS
// ══════════════════════════════════════════════
let chatHistory  = [];
let ttsEnabled   = false;
const sendChatBtn  = document.getElementById('send-chat-btn');
const chatInputBox = document.getElementById('chat-input-box');
const chatMessages = document.getElementById('chat-messages');
const micBtn       = document.getElementById('mic-btn');

function updateTTSButton() {
    const btn = document.getElementById('tts-toggle-btn');
    if (!btn) return;
    btn.title   = ttsEnabled ? 'Spoken answers on. Select to mute.' : 'Spoken answers off. Select to enable.';
    btn.setAttribute('aria-pressed', ttsEnabled ? 'true' : 'false');
    btn.setAttribute('aria-label', ttsEnabled ? 'Mute spoken answers' : 'Enable spoken answers');
    btn.style.opacity = ttsEnabled ? '1' : '0.4';
    if (ttsEnabled) btn.classList.add('active');
    else            btn.classList.remove('active');
}

function toggleTTS() {
    ttsEnabled = !ttsEnabled;
    if (!ttsEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
    updateTTSButton();
}

function speakText(text) {
    if (!ttsEnabled || !window.speechSynthesis) return;
    try {
        window.speechSynthesis.cancel();
        const plain = text.replace(/\*\*(.*?)\*\*/g,'$1').replace(/\*(.*?)\*/g,'$1').replace(/\n/g,' ');
        const utt = new SpeechSynthesisUtterance(plain);
        utt.rate = 0.95;
        utt.pitch = 1;
        utt.onerror = () => { showNotice('Could not play the spoken answer. You can read it below.'); };
        window.speechSynthesis.speak(utt);
    } catch (err) {
        console.warn('Speech playback failed:', err);
        showNotice('Could not play the spoken answer. You can read it below.');
    }
}

// Enter key sends chat message
chatInputBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatBtn.click(); }
});

function showTypingIndicator() {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ai';
    bubble.id        = 'typing-indicator';
    bubble.innerHTML = '<div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
function hideTypingIndicator() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
}

sendChatBtn.addEventListener('click', async () => {
    const message = chatInputBox.value.trim();
    if (!message || sendChatBtn.disabled) return;
    const sessionVersion = toolSessionVersion;
    if (!activeFileId) { showNotice('Session lost. Please restart.'); return; }

    appendChatMessage('user', message);
    chatInputBox.value = '';
    sendChatBtn.disabled = true;
    sendChatBtn.innerText = '…';
    showTypingIndicator();

    // History EXCLUDES the current message - it travels separately as
    // `message` and is only recorded below AFTER a successful exchange,
    // so the server never receives the same question twice.
    try {
        const fd = new FormData();
        fd.append('file_id', activeFileId);
        fd.append('ct', activeCleanupTicket || '');
        fd.append('message', message);
        fd.append('history', JSON.stringify(chatHistory));

        const res  = await apiFetch('/chat', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        if (sessionVersion !== toolSessionVersion) return;
        hideTypingIndicator();
        appendChatMessage('ai', data.reply);
        // Record the completed exchange only on success - a failed send
        // never happened, so it must not leak into future prompts.
        chatHistory.push({ role: 'user', content: message });
        chatHistory.push({ role: 'ai', content: data.reply });
        if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

        // Speak the reply in voice mode
        speakText(data.reply);

    } catch (err) {
        if (sessionVersion !== toolSessionVersion) return;
        hideTypingIndicator();
        // Session-expired path: server wiped file state (Render restart) or
        // the Gemini file TTL elapsed. Offer a one-click re-upload shortcut.
        const isExpired = err.message && err.message.toLowerCase().includes('session has expired');
        if (isExpired) {
            const bubble = document.createElement('div');
            bubble.className = 'chat-bubble ai';
            bubble.innerHTML =
                '<span class="msg-role">System</span><div class="msg-content"><strong>Your session has expired.</strong> The server was restarted or your document timed out. Go back and upload the file again.</div>' +
                '<button type="button" class="secondary-button compact-button" onclick="endChatSession()">Go back and upload</button>' +
                `<span class="msg-timestamp">${nowTimeStr()}</span>`;
            chatMessages.appendChild(bubble);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } else {
            appendChatMessage('ai', 'System Error: ' + err.message);
        }
    } finally {
        if (sessionVersion === toolSessionVersion) {
            sendChatBtn.disabled = false;
            sendChatBtn.innerText = 'Send';
        }
    }
});

function appendChatMessage(role, text) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + role;
    const safe = formatAndSanitize(text);
    const label = role === 'user' ? 'You' : 'Tutor';
    bubble.innerHTML = `<span class="msg-role">${label}</span><div class="msg-content">${safe}</div><span class="msg-timestamp">${nowTimeStr()}</span>`;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Fire-and-forget deletion of the Gemini-hosted chat document.
// Nulls the ID first so repeated calls are harmless no-ops.
function cleanupActiveChatFile() {
    if (!activeFileId) return;
    const fileId = activeFileId;
    const ticket = activeCleanupTicket;
    activeFileId = null;
    activeCleanupTicket = null;
    cleanupChatFile(fileId, ticket);
}

function cleanupChatFile(fileId, ticket) {
    if (!fileId || !ticket) return;
    try {
        const fd = new FormData();
        fd.append('file_id', fileId);
        // The signed cleanup ticket keeps this working even right AFTER
        // sign-out, when no fresh Firebase token is available.
        if (ticket) fd.append('ct', ticket);
        const opts = { method: 'POST', body: fd };
        fetch('/cleanup', opts).catch(() => {});
    } catch (_) {}
}

// Full teardown used on every exit path: Back buttons go through
// resetAppToDashboard(); sign-outs (manual/auto) reach this via
// onAuthStateChanged; tab close/refresh uses the pagehide beacon below.
function teardownAppState() {
    historyLoadVersion++;
    document.getElementById('historyList').replaceChildren();
    closeHistoryPanel(false);
    resetAppToDashboard();
    ttsEnabled = false;
    updateTTSButton();
    clearTimeout(inactivityTimer);
    clearTimeout(warningTimer);
    hideWarningBanner();
}

async function endChatSession() {
    // → Save chat to history before teardown (only if there was actual conversation)
    if (chatHistory.length > 0) {
        saveSession(document.getElementById('generation-mode').value === 'voice' ? 'voice' : 'chat', {
            documentName: document.getElementById('file-name-display').innerText || 'Unknown document',
            mode: document.getElementById('generation-mode').value,
            chatHistory: chatHistory.slice(),
            messageCount: chatHistory.filter(m => m.role === 'user').length,
        });
    }
    cleanupActiveChatFile();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    resetAppToDashboard();
}

// ── Microphone / Speech Recognition ──
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    || window.mozSpeechRecognition || window.msSpeechRecognition;
let activeRecognition = null;   // kept global so teardown can stop an active session

if (SpeechRecognition) {
    micBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (activeRecognition) {
            activeRecognition.onresult = null;
            activeRecognition.abort();
            return;
        }
        const recognition = new SpeechRecognition();
        const sessionVersion = toolSessionVersion;
        activeRecognition = recognition;
        recognition.continuous     = false;
        recognition.interimResults = false;
        recognition.lang           = document.documentElement.lang || navigator.language || 'en-US';
        recognition.onstart  = () => { if (activeRecognition !== recognition || sessionVersion !== toolSessionVersion) return; micBtn.classList.add('mic-active'); micBtn.setAttribute('aria-pressed', 'true'); micBtn.setAttribute('aria-label', 'Stop microphone'); chatInputBox.placeholder = 'Listening…'; };
        recognition.onresult = (ev) => {
            if (sessionVersion !== toolSessionVersion) return;
            chatInputBox.value = ev.results[0][0].transcript;
            resetMic();
            sendChatBtn.click();
        };
        recognition.onerror = (ev) => {
            if (sessionVersion !== toolSessionVersion) return;
            resetMic();
            if (ev.error === 'not-allowed') showNotice('Microphone access is blocked. Allow it in your browser settings.');
            else if (ev.error !== 'aborted') showNotice('Microphone error: ' + ev.error);
        };
        recognition.onend = resetMic;
        function resetMic() {
            if (activeRecognition !== recognition) return;
            micBtn.classList.remove('mic-active');
            micBtn.setAttribute('aria-pressed', 'false');
            micBtn.setAttribute('aria-label', 'Use microphone');
            chatInputBox.placeholder = 'Type or speak your question…';
            activeRecognition = null;
        }
        try { recognition.start(); } catch (err) { resetMic(); showNotice('Microphone error: ' + err.message); }
    });
} else {
    micBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showNotice('Voice input is unavailable in this browser. Use Chrome or Edge.');
    });
}

// ══════════════════════════════════════════════
// 12b. COPY & PDF EXPORT
// ══════════════════════════════════════════════
function copyTextToClipboard(text, btnEl) {
    const flashCopied = () => {
        if (!btnEl) return;
        btnEl.classList.add('copied');
        btnEl.title = 'Copied!';
        setTimeout(() => { btnEl.classList.remove('copied'); btnEl.title = 'Copy'; }, 1500);
    };
    const fallbackCopy = () => {
        // Legacy browsers / non-secure contexts
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity  = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (_) {}
        ta.remove();
        flashCopied();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(flashCopied).catch(fallbackCopy);
    } else {
        fallbackCopy();
    }
}

function formatQuestionText(q, index, includeAnswer) {
    const letters = ['A','B','C','D','E','F'];
    let out = `Q${index + 1}. ${q.question}
`;
    q.options.forEach((opt, i) => { out += `${letters[i] || '-'}) ${opt}
`; });
    if (includeAnswer) {
        out += `
Answer: ${q.answer}`;
        if (q.explanation) out += `
Explanation: ${q.explanation}`;
    }
    return out;
}

function copyCurrentQuestion() {
    const q = quizData[currentIndex];
    if (!q) return;
    // Deliberately EXCLUDES the answer during an active quiz - no accidental cheating.
    copyTextToClipboard(formatQuestionText(q, currentIndex, false), document.getElementById('q-copy-btn'));
}

function copyReviewItem(index, btnEl) {
    const q = quizData[index];
    if (!q) return;
    copyTextToClipboard(formatQuestionText(q, index, true), btnEl);
}

function sanitizeForPdf(str) {
    // jsPDF core fonts are WinAnsi-only: normalise smart punctuation and
    // strip emojis/symbols that would otherwise render as garbage.
    let out = String(str)
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\u2026/g, '...');
    // Keep printable ASCII/Latin-1 plus newlines (code 10); drop the rest
    const kept = [];
    for (const ch of out) {
        const code = ch.charCodeAt(0);
        if (code === 10 || (code >= 32 && code <= 255)) kept.push(ch);
    }
    return kept.join('');
}

const PDF_COLORS = Object.freeze({
    forest: [30, 75, 56],
    paper: [248, 244, 233],
    ink: [32, 35, 30],
    inkSoft: [92, 96, 85],
    inkFaint: [104, 108, 99],
    success: [40, 95, 66],
    oxblood: [139, 61, 49],
});

function downloadQuizPdf() {
    if (!quizData.length) return;
    const JsPdfCtor = window.jspdf && window.jspdf.jsPDF;
    if (!JsPdfCtor) {
        showNotice('The PDF library did not load. Check your connection and refresh the page.');
        return;
    }

    const mode    = document.getElementById('generation-mode').value;
    const isFlash = mode === 'flashcard';

    const doc   = new JsPdfCtor({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 48;
    const maxW   = pageW - margin * 2;
    let y = margin;

    const ensureSpace = (needed) => {
        if (y + needed > pageH - margin - 24) {
            doc.addPage();
            y = margin;
        }
    };

    // ── Answer key toggle: OFF = clean practice sheet (questions only),
    // ON = full study record with score, marked options & explanations ──
    const hasAnswers = !isFlash && Array.isArray(userAnswers) && userAnswers.some(a => a !== null);
    const includeKey = hasAnswers && document.getElementById('pdf-include-answers')?.checked;

    // ── Header band (subtitle declares which variant this PDF is) ──
    doc.setFillColor(...PDF_COLORS.forest);
    doc.rect(0, 0, pageW, 92, 'F');
    doc.setTextColor(...PDF_COLORS.paper);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text("Lee's AI Study Lab", margin, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    let pdfSubtitle = isFlash ? 'Flashcards Export' : 'Quiz Export';
    if (!isFlash) pdfSubtitle += includeKey ? '  |  Answer Key + Your Results' : '  |  Practice Sheet - no answers';
    doc.text(pdfSubtitle, margin, 62);
    doc.text(dateStr, margin, 78);

    y = 124;
    doc.setTextColor(...PDF_COLORS.ink);

    if (includeKey) {
        let score = 0;
        quizData.forEach((q, i) => { if (q.answer === userAnswers[i]) score++; });
        const pct = Math.round((score / quizData.length) * 100);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(`Score: ${score}/${quizData.length} (${pct}%)`, margin, y);
        y += 26;
    }

    const letters = ['A','B','C','D','E','F'];

    quizData.forEach((item, idx) => {
        if (isFlash) {
            // Term + definition layout for flashcards
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(...PDF_COLORS.ink);
            const termLines = doc.splitTextToSize(`${idx + 1}. ${sanitizeForPdf(item.term)}`, maxW);
            ensureSpace(termLines.length * 16 + 8);
            doc.text(termLines, margin, y);
            y += termLines.length * 16 + 4;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            doc.setTextColor(...PDF_COLORS.inkSoft);
            const defLines = doc.splitTextToSize(sanitizeForPdf(item.definition), maxW);
            ensureSpace(defLines.length * 14 + 16);
            doc.text(defLines, margin, y);
            y += defLines.length * 14 + 16;
            return;
        }

        // Question line
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...PDF_COLORS.ink);
        const qLines = doc.splitTextToSize(`${idx + 1}. ${sanitizeForPdf(item.question)}`, maxW);
        ensureSpace(qLines.length * 16 + 6);
        doc.text(qLines, margin, y);
        y += qLines.length * 16 + 4;

        // Options
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        item.options.forEach((opt, oi) => {
            const correct = item.answer === opt;
            const mine    = includeKey && userAnswers[idx] === opt;
            let line = `${letters[oi] || '-'}) ${sanitizeForPdf(opt)}`;
            if (includeKey && correct)  line += '   [CORRECT]';
            else if (mine)              line += '   [your answer]';
            const oLines = doc.splitTextToSize(line, maxW - 14);
            ensureSpace(oLines.length * 14);
            if (includeKey && correct) { doc.setTextColor(...PDF_COLORS.success); doc.setFont('helvetica', 'bold'); }
            else if (mine)             { doc.setTextColor(...PDF_COLORS.oxblood); }
            else                       { doc.setTextColor(...PDF_COLORS.inkSoft); }
            doc.text(oLines, margin + 14, y);
            y += oLines.length * 14;
            doc.setFont('helvetica', 'normal');
        });

        if (includeKey && userAnswers[idx] === null) {
            doc.setTextColor(...PDF_COLORS.inkFaint);
            ensureSpace(14);
            doc.text('(skipped)', margin + 14, y);
            y += 14;
        }

        // Explanation (part of the answer key - hidden on practice sheets)
        if (item.explanation && includeKey) {
            doc.setTextColor(...PDF_COLORS.inkSoft);
            doc.setFont('helvetica', 'italic');
            const eLines = doc.splitTextToSize('Why: ' + sanitizeForPdf(item.explanation), maxW - 14);
            ensureSpace(eLines.length * 13 + 10);
            doc.text(eLines, margin + 14, y);
            y += eLines.length * 13 + 10;
            doc.setFont('helvetica', 'normal');
        }

        y += 14; // breathing room between items
    });

    // ── Footer page numbers on every page ──
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...PDF_COLORS.inkFaint);
        doc.text(`Page ${p} of ${totalPages}`, pageW / 2, pageH - 24, { align: 'center' });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    doc.save(isFlash ? `ai-study-lab-flashcards-${stamp}.pdf` : `ai-study-lab-quiz-${stamp}.pdf`);
}

// ══════════════════════════════════════════════
// ══════════════════════════════════════════════
// 13. SESSION HISTORY (Firestore)
// ══════════════════════════════════════════════

// ── Save a completed session to Firestore ──
async function saveSession(type, payload) {
    const user = auth.currentUser;
    if (!user) return;
    try {
        await db.collection('users').doc(user.uid)
            .collection('sessions').add({
                type,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                ...payload,
            });
    } catch (err) {
        console.warn('History: could not save session', err);
    }
}

// ── Open the panel and load sessions ──
async function openHistoryPanel() {
    document.getElementById('historyOverlay').style.display = 'block';
    const panel = document.getElementById('historyPanel');
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    setWorkspaceInert(true);
    document.body.style.overflow = 'hidden';
    document.getElementById('history-close-btn').focus();
    await loadHistory();
}

function closeHistoryPanel(restoreFocus = true) {
    const panel = document.getElementById('historyPanel');
    if (!panel.classList.contains('open')) return;
    document.getElementById('historyOverlay').style.display = 'none';
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    setWorkspaceInert(false);
    document.body.style.overflow = '';
    if (restoreFocus) document.getElementById('historyBtn').focus();
}

function setWorkspaceInert(inert) {
    document.querySelectorAll('.site-chrome, #app-container, #landing-container, #auth-container')
        .forEach(el => { el.inert = inert; });
}

document.getElementById('historyPanel').addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const focusable = [...e.currentTarget.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter(el => el.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeHistoryPanel();
});

let historyLoadVersion = 0;
async function loadHistory() {
    const user = auth.currentUser;
    const version = ++historyLoadVersion;
    const list = document.getElementById('historyList');
    if (!user) {
        list.innerHTML = '<div class="history-empty">Sign in to see your history.</div>';
        return;
    }
    list.innerHTML = '<div class="history-empty">Loading your sessions…</div>';
    try {
        const snap = await db.collection('users').doc(user.uid)
            .collection('sessions')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();
        if (version !== historyLoadVersion || auth.currentUser?.uid !== user.uid) return;
        if (snap.empty) {
            list.innerHTML = '<div class="history-empty">No sessions yet.<br>Complete a quiz, flashcard deck or chat to see your history here!</div>';
            return;
        }
        list.innerHTML = '';
        snap.docs.forEach(doc => renderHistoryItem(list, doc.id, doc.data()));
    } catch (err) {
        if (version !== historyLoadVersion || auth.currentUser?.uid !== user.uid) return;
        console.error('History load error:', err);
        list.innerHTML = '<div class="history-empty">Could not load history. Please try again.</div>';
    }
}

const TYPE_LABELS = { quiz: 'Quiz', flashcard: 'Flashcards', chat: 'Chat', voice: 'Voice' };

function renderHistoryItem(list, docId, data) {
    const date = typeof data.createdAt?.toDate === 'function' ? data.createdAt.toDate().toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : 'Unknown date';

    let scoreText = '';
    if (data.type === 'quiz')      scoreText = `Score: ${data.score}% (${data.numQuestions} questions)`;
    if (data.type === 'flashcard') scoreText = `Knew: ${data.knewItCount}/${data.totalCards} cards (${data.pct}%)`;
    if (data.type === 'chat' || data.type === 'voice') scoreText = `${data.messageCount || 0} messages exchanged`;

    const item = document.createElement('div');
    item.className = 'history-item';
    item.setAttribute('data-type', data.type);
    item.innerHTML = `
        <button type="button" class="history-open">
        <span class="history-item-top">
            <span class="history-badge">${escapeHtml(TYPE_LABELS[data.type] || 'Session')}</span>
            <span class="history-doc">${escapeHtml(data.documentName || 'Unknown document')}</span>
        </span>
        <span class="history-meta">${escapeHtml(date)}</span>
        ${scoreText ? `<span class="history-score">${escapeHtml(scoreText)}</span>` : ''}
        </button>
        <button type="button" class="history-delete-btn" title="Delete this session" aria-label="Delete this session"><i class="ph ph-trash" aria-hidden="true"></i></button>
    `;
    item.querySelector('.history-open').addEventListener('click', () => {
        restoreSession(data);
        closeHistoryPanel();
    });
    item.querySelector('.history-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteHistorySession(docId, item);
    });
    list.appendChild(item);
}

async function deleteHistorySession(docId, itemEl) {
    const user = auth.currentUser;
    if (!user) return;
    const version = historyLoadVersion;
    if (!(await confirmAction('Delete this session from your history?', 'Delete session'))) return;
    if (auth.currentUser?.uid !== user.uid || version !== historyLoadVersion) return;
    itemEl.style.opacity = '0.4';
    itemEl.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try {
        await db.collection('users').doc(user.uid).collection('sessions').doc(docId).delete();
        if (auth.currentUser?.uid !== user.uid || version !== historyLoadVersion) return;
        itemEl.remove();
        const list = document.getElementById('historyList');
        if (!list.children.length) {
            list.innerHTML = '<div class="history-empty">No sessions yet.</div>';
        }
    } catch (err) {
        if (auth.currentUser?.uid !== user.uid || version !== historyLoadVersion) return;
        itemEl.style.opacity = '1';
        itemEl.querySelectorAll('button').forEach(button => { button.disabled = false; });
        showNotice('Could not delete the session. Please try again.');
    }
}

function restoreSession(data) {
    // Navigate to the tool view with a read-only restored banner
    resetAppToDashboard();
    closeHistoryPanel();

    // Restore synchronously so navigation cannot leave a queued restore behind.
    {
        if (data.type === 'quiz') {
            quizData    = data.quizData || [];
            userAnswers = data.userAnswers || [];
            if (!quizData.length) { showNotice('This session has no question data saved.'); return; }
            document.getElementById('dashboard-view').style.display = 'none';
            showWithFade(document.getElementById('tool-view'));
            document.getElementById('generation-mode').value = 'quiz';
            document.getElementById('tool-title').innerText  = 'Quiz results';
            document.getElementById('quizForm').style.display = 'none';

            let score = 0;
            quizData.forEach((q, i) => { if (q.answer === userAnswers[i]) score++; });
            const pct = Math.round((score / quizData.length) * 100);

            setResultIcon('ph-clock-counter-clockwise');
            document.getElementById('result-title').innerText    = 'Restored session';
            document.getElementById('result-score').innerText    = pct + '%';
            document.getElementById('result-score').style.display = 'block';
            document.getElementById('result-subtitle').innerText = `${data.documentName || 'Unknown document'}, ${quizData.length} questions`;
            document.getElementById('review-btn').style.display  = 'inline-block';
            document.getElementById('review-still-learning-btn').style.display = 'none';
            document.getElementById('retake-btn').innerText      = 'Retake quiz';
            document.getElementById('pdf-answers-label').style.display = 'inline-block';

            // Insert restored banner
            const rc = document.getElementById('result-container');
            const existing = rc.querySelector('.restored-banner');
            if (!existing) {
                const banner = document.createElement('div');
                banner.className = 'restored-banner';
                banner.innerHTML = '<strong>Restored from history</strong><span>' + escapeHtml(data.documentName || 'Unknown document') + '</span>';
                rc.insertBefore(banner, rc.firstChild);
            }
            showWithFade(rc);

        } else if (data.type === 'flashcard') {
            quizData       = data.flashcardDeck || [];
            flashcardDeck  = [...quizData];
            knewItCount    = data.knewItCount || 0;
            if (!quizData.length) { showNotice('This session has no flashcard data saved.'); return; }
            document.getElementById('dashboard-view').style.display = 'none';
            showWithFade(document.getElementById('tool-view'));
            document.getElementById('generation-mode').value = 'flashcard';
            document.getElementById('tool-title').innerText  = 'Flashcard results';
            document.getElementById('quizForm').style.display = 'none';

            const total = quizData.length;
            setResultIcon('ph-clock-counter-clockwise');
            document.getElementById('result-title').innerText    = 'Restored flashcard session';
            document.getElementById('result-score').innerText    = `${knewItCount}/${total}`;
            document.getElementById('result-score').style.display = 'block';
            document.getElementById('result-subtitle').innerText = `${data.documentName || 'Unknown document'}, ${total} cards`;
            document.getElementById('review-btn').style.display  = 'none';
            document.getElementById('review-still-learning-btn').style.display = 'none';
            document.getElementById('retake-btn').innerText      = 'Restart deck';
            document.getElementById('pdf-answers-label').style.display = 'none';

            const rc = document.getElementById('result-container');
            const existing = rc.querySelector('.restored-banner');
            if (!existing) {
                const banner = document.createElement('div');
                banner.className = 'restored-banner';
                banner.innerHTML = '<strong>Restored from history</strong><span>' + escapeHtml(data.documentName || 'Unknown document') + '</span>';
                rc.insertBefore(banner, rc.firstChild);
            }
            showWithFade(rc);

        } else if (data.type === 'chat' || data.type === 'voice') {
            const history = (data.chatHistory || []).filter(msg => msg && typeof msg.content === 'string');
            chatHistory = history.slice(-20);
            document.getElementById('file-name-display').innerText = data.documentName || 'Unknown document';
            if (!history.length) { showNotice('This chat session has no messages saved.'); return; }
            document.getElementById('dashboard-view').style.display = 'none';
            showWithFade(document.getElementById('tool-view'));
            document.getElementById('generation-mode').value = data.type;
            document.getElementById('tool-title').innerText  = data.type === 'voice' ? 'Voice session' : 'Chat session';
            document.getElementById('quizForm').style.display = 'none';

            const msgBox = document.getElementById('chat-messages');
            msgBox.innerHTML = '';
            // Header banner
            const banner = document.createElement('div');
            banner.className = 'restored-banner';
            banner.innerHTML = '<strong>Restored chat from history</strong><span>' + escapeHtml(data.documentName || 'Unknown document') + '</span>';
            
            const resumeBtn = document.createElement('button');
            resumeBtn.className = 'secondary-button compact-button';
            resumeBtn.innerText = 'Resume chat';
            resumeBtn.onclick = () => promptResumeArchivedChat(data.documentName, banner);
            banner.appendChild(resumeBtn);
            
            msgBox.appendChild(banner);

            // Replay all messages
            history.forEach(msg => appendChatMessage(msg.role === 'user' ? 'user' : 'ai', msg.content));

            // Show chat UI but disable input to make it read-only initially
            showWithFade(document.getElementById('chat-ui-container'));
            document.getElementById('chat-input-box').disabled  = true;
            document.getElementById('send-chat-btn').disabled   = true;
            document.getElementById('mic-btn').disabled         = true;
            document.getElementById('chat-input-box').placeholder = 'Read-only restored session';
        }
    }
}

// ── Resume a chat from history (Manual file selection) ──
function promptResumeArchivedChat(docName, bannerEl) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.pptx';
    input.style.display = 'none';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fileError = validateUpload(file);
        if (fileError) { showNotice(fileError); return; }
        const sessionVersion = toolSessionVersion;
        
        bannerEl.innerHTML = '<strong>Uploading document</strong><span>Keeping the existing chat ready.</span>';
        
        try {
            const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '.pdf';
            const fd = new FormData();
            fd.append('document', file, 'upload' + ext);
            
            const res = await apiFetch('/init_chat', { method: 'POST', body: fd });
            const resData = await res.json();
            if (!res.ok) throw new Error(resData.error);
            
            if (sessionVersion !== toolSessionVersion) {
                cleanupChatFile(resData.file_id, resData.ct);
                return;
            }
            cleanupActiveChatFile();
            activeFileId = resData.file_id;
            activeCleanupTicket = resData.ct || null;
            
            document.getElementById('chat-input-box').disabled  = false;
            document.getElementById('send-chat-btn').disabled   = false;
            document.getElementById('mic-btn').disabled         = !SpeechRecognition;
            document.getElementById('chat-input-box').placeholder = 'Type or speak your question…';
            
            bannerEl.innerHTML = '<strong>Session resumed</strong><span>You can now chat normally.</span>';
            setTimeout(() => { if (bannerEl.parentNode) bannerEl.remove(); }, 4000);
        } catch (err) {
            if (sessionVersion !== toolSessionVersion) return;
            console.error('Resume error:', err);
            bannerEl.innerHTML = '<strong>Session could not be resumed.</strong>';
            const retry = document.createElement('button');
            retry.className = 'secondary-button compact-button';
            retry.textContent = 'Try uploading again';
            retry.onclick = () => promptResumeArchivedChat(docName, bannerEl);
            bannerEl.appendChild(retry);
            showNotice('Could not resume chat: ' + err.message);
        }
    };
    
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
}

// ══════════════════════════════════════════════
// 14. AUTO-LOGOUT (10 min inactivity + 2-min warning)
// ══════════════════════════════════════════════
let inactivityTimer;
let warningTimer;
const TIMEOUT_MS = 10 * 60 * 1000;   // 10 minutes total
const WARNING_MS =  8 * 60 * 1000;   // show warning at 8 min (2 min before logout)

let countdownInterval;
function showWarningBanner() {
    const banner = document.getElementById('session-warning-banner');
    if (!banner || !auth.currentUser) return;
    banner.style.display = 'block';
    let secsLeft = 120;
    const el = document.getElementById('session-countdown');
    clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        secsLeft--;
        if (el) {
            const m = Math.floor(secsLeft / 60);
            const s = String(secsLeft % 60).padStart(2, '0');
            el.textContent = `${m}:${s}`;
        }
        if (secsLeft <= 0) clearInterval(countdownInterval);
    }, 1000);
}
function hideWarningBanner() {
    const banner = document.getElementById('session-warning-banner');
    if (banner) banner.style.display = 'none';
    clearInterval(countdownInterval);
}

function resetTimer() {
    clearTimeout(inactivityTimer);
    clearTimeout(warningTimer);
    hideWarningBanner();
    if (!auth.currentUser) return;
    warningTimer    = setTimeout(showWarningBanner, WARNING_MS);
    inactivityTimer = setTimeout(forceLogout, TIMEOUT_MS);
}
function forceLogout() {
    hideWarningBanner();
    auth.signOut().then(() => {
        showSignInScreen();
        showAuthError('Session expired after 10 minutes of inactivity. Please sign in again.');
        errorBox.style.color = '';
    });
}
let lastActivityReset = 0;
function resetTimerFromActivity() {
    const now = Date.now();
    if (now - lastActivityReset < 1000) return;
    lastActivityReset = now;
    resetTimer();
}
['mousemove','keypress','scroll','touchstart','click'].forEach(ev =>
    document.addEventListener(ev, resetTimerFromActivity, { passive: true })
);
window.onload = resetTimerFromActivity;

// ── Cleanup on tab close / refresh / navigation ──
// sendBeacon survives unload, unlike fetch - guarantees the Gemini-hosted
// document is deleted even if the user abandons the page mid-session.
window.addEventListener('pagehide', () => {
    if (!activeFileId || !navigator.sendBeacon) return;
    const fd = new FormData();
    fd.append('file_id', activeFileId);
    // Beacons cannot send Authorization headers - the signed cleanup
    // ticket issued at session start authorises this request instead.
    if (activeCleanupTicket) fd.append('ct', activeCleanupTicket);
    navigator.sendBeacon('/cleanup', fd);
});
