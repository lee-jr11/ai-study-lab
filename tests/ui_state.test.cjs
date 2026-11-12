const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const { runInContext } = require('node:vm');

const html = readFileSync('templates/index.html', 'utf8');
const appScript = readFileSync('static/app.js', 'utf8');

function setup(t, { blockedStorage = false } = {}) {
    const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const w = dom.window;
    const auth = { currentUser: { uid: 'test-user', getIdToken: async () => 'test-token' },
        onAuthStateChanged() {}, setPersistence: async () => {}, signOut: async () => { auth.currentUser = null; } };
    const authFactory = () => auth;
    authFactory.Auth = { Persistence: { NONE: 'none' } };
    const db = {};
    w.firebase = { initializeApp() {}, auth: authFactory, firestore: () => db };
    if (blockedStorage) {
        Object.defineProperty(w, 'localStorage', { get() { throw new w.DOMException('Storage blocked', 'SecurityError'); } });
    }
    w.scrollTo = () => {};
    w.alert = () => {};
    w.confirm = () => true;
    w.fetch = async () => ({ ok: true, json: async () => ({}) });
    const context = dom.getInternalVMContext();
    runInContext(appScript, context);
    return { w, auth, db, doc: w.document, run: code => runInContext(code, context) };
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('blocked storage does not prevent initialization or theme changes', t => {
    const { doc } = setup(t, { blockedStorage: true });
    assert.equal(doc.documentElement.dataset.theme, 'light');
    doc.getElementById('themeToggle').click();
    assert.equal(doc.documentElement.dataset.theme, 'dark');
});

test('sign-out clears private history and invalidates pending history loads', async t => {
    const { db, doc, run } = setup(t);
    const pending = deferred();
    const query = { orderBy() { return this; }, limit() { return this; }, get() { return pending.promise; } };
    db.collection = () => ({ doc: () => ({ collection: () => query }) });
    run('renderHistoryItem(document.getElementById("historyList"), "old", {type:"quiz",documentName:"Private lecture.pdf"})');
    const load = run('loadHistory()');
    run('teardownAppState()');
    pending.resolve({ empty: false, docs: [{id: 'old', data: () => ({type:'quiz', documentName:'Private lecture.pdf'})}] });
    await load;
    assert.doesNotMatch(doc.getElementById('historyList').textContent, /Private lecture/);
    assert.equal(doc.querySelector('.history-item'), null);
});

test('switching accounts during delete confirmation cancels the deletion', async t => {
    const { w, auth, db, doc, run } = setup(t);
    let deletes = 0;
    db.collection = () => ({ doc: () => ({ collection: () => ({ doc: () => ({ delete: async () => { deletes++; } }) }) }) });
    run('renderHistoryItem(document.getElementById("historyList"), "old", {type:"quiz"})');
    const confirmation = deferred();
    run('confirmAction = () => window.pendingConfirmation');
    w.pendingConfirmation = confirmation.promise;
    const deletion = run('deleteHistorySession("old", document.querySelector(".history-item"))');
    auth.currentUser = { uid: 'another-user' };
    confirmation.resolve(true);
    await deletion;
    assert.equal(deletes, 0);
});

test('reset keeps the difficulty label, value, and accessible description consistent', t => {
    const { w, doc, run } = setup(t);
    const slider = doc.getElementById('difficulty-slider');
    slider.value = '3';
    slider.dispatchEvent(new w.Event('input'));
    assert.equal(doc.getElementById('difficulty-hidden').value, 'hard');
    run('resetAppToDashboard()');
    assert.equal(slider.value, '2');
    assert.equal(doc.getElementById('difficulty-hidden').value, 'medium');
    assert.ok(doc.getElementById('lbl-2').classList.contains('active'));
    assert.equal(slider.getAttribute('aria-valuetext'), 'Intermediate');
});

test('restored chat retains context, and a new session clears its read-only controls', t => {
    const { doc, run } = setup(t);
    run(`restoreSession({type:'chat',documentName:'Lecture.pdf',chatHistory:[{role:'user',content:'Explain elasticity'}]})`);
    assert.equal(doc.getElementById('chat-input-box').disabled, true);
    assert.equal(run('chatHistory[0].content'), 'Explain elasticity');
    assert.equal(doc.getElementById('file-name-display').innerText, 'Lecture.pdf');
    run('resetAppToDashboard(); openTool("chat")');
    assert.equal(doc.getElementById('chat-input-box').disabled, false);
    assert.equal(doc.getElementById('send-chat-btn').disabled, false);
    assert.equal(run('chatHistory.length'), 0);
    assert.equal(doc.querySelector('.restored-banner'), null);
});

test('history metadata is rendered as text rather than executable markup', t => {
    const { doc, run } = setup(t);
    run(`renderHistoryItem(document.getElementById('historyList'), 'one', {
        type:'quiz',score:'<img src=x onerror=alert(1)>',numQuestions:10,documentName:'<script>bad()</script>'
    })`);
    assert.equal(doc.querySelector('#historyList img, #historyList script'), null);
    assert.match(doc.getElementById('historyList').textContent, /<img/);
});

test('duplicate generation is ignored and a late chat upload is cleaned up after exit', async t => {
    const { w, doc, run } = setup(t);
    const pending = deferred();
    const calls = [];
    w.fetch = async (url, options) => {
        calls.push({ url, options });
        return url === '/init_chat' ? pending.promise : { ok: true };
    };
    run('openTool("chat")');
    Object.defineProperty(doc.getElementById('document'), 'files', { value: [new w.File(['%PDF-sample'], 'lecture.pdf')], configurable: true });
    const form = doc.getElementById('quizForm');
    form.dispatchEvent(new w.Event('submit', { cancelable: true }));
    form.dispatchEvent(new w.Event('submit', { cancelable: true }));
    await flush();
    assert.equal(calls.filter(c => c.url === '/init_chat').length, 1);
    run('resetAppToDashboard()');
    pending.resolve({ ok: true, json: async () => ({ file_id: 'files/late', ct: 'signed-ticket' }) });
    await flush();
    assert.equal(run('activeFileId'), null);
    assert.equal(doc.getElementById('chat-ui-container').style.display, 'none');
    const cleanup = calls.find(c => c.url === '/cleanup');
    assert.ok(cleanup);
    assert.equal(cleanup.options.body.get('file_id'), 'files/late');
});

test('late chat replies cannot appear in the next session', async t => {
    const { w, doc, run } = setup(t);
    const pending = deferred();
    let sends = 0;
    w.fetch = async url => { if (url === '/chat') { sends++; return pending.promise; } return {ok:true}; };
    run('activeFileId="files/one"; activeCleanupTicket="ticket"; openTool("chat")');
    doc.getElementById('chat-input-box').value = 'What is elasticity?';
    doc.getElementById('send-chat-btn').click();
    await flush();
    run('resetAppToDashboard(); openTool("chat")');
    pending.resolve({ok:true,json:async () => ({reply:'Old response must not appear'})});
    await flush();
    assert.equal(sends, 1);
    assert.equal(run('chatHistory.length'), 0);
    assert.doesNotMatch(doc.getElementById('chat-messages').textContent, /Old response/);
});

test('empty, unsupported, and oversized documents fail before uploading', t => {
    const { run } = setup(t);
    assert.match(run('validateUpload({name:"lecture.pdf",size:0})'), /empty/);
    assert.match(run('validateUpload({name:"lecture.docx",size:2})'), /PDF and PPTX/);
    assert.match(run('validateUpload({name:"lecture.pdf",size:10485761})'), /10 MB/);
    assert.equal(run('validateUpload({name:"Lecture.PDF",size:500})'), '');
});

test('account mode updates the visible heading and password autocomplete', t => {
    const { doc, run } = setup(t);
    run('toggleAuthMode()');
    assert.equal(doc.getElementById('auth-form-title').innerText, 'Create account');
    assert.equal(doc.getElementById('auth-password').autocomplete, 'new-password');
    assert.equal(doc.getElementById('pw-checklist').hidden, true);
    run('toggleAuthMode()');
    assert.equal(doc.getElementById('auth-form-title').innerText, 'Sign in');
});

test('password requirements reflect each rule while signing up', t => {
    const { w, doc, run } = setup(t);
    run('toggleAuthMode()');
    const password = doc.getElementById('auth-password');
    password.value = 'abc';
    password.dispatchEvent(new w.Event('input'));
    const checklist = doc.getElementById('pw-checklist');
    assert.equal(checklist.hidden, false);
    assert.equal(checklist.querySelector('[data-password-rule="length"]').classList.contains('is-met'), false);
    assert.equal(checklist.querySelector('[data-password-rule="upper"]').classList.contains('is-met'), false);

    password.value = 'Abcdef1!';
    password.dispatchEvent(new w.Event('input'));
    assert.equal([...checklist.querySelectorAll('li')].every(item => item.classList.contains('is-met')), true);
});

test('auth fields validate on blur and clear when the user starts fixing them', t => {
    const { w, doc, run } = setup(t);
    run('toggleAuthMode()');

    const firstName = doc.getElementById('auth-firstname');
    firstName.dispatchEvent(new w.Event('blur'));
    assert.equal(firstName.getAttribute('aria-invalid'), 'true');
    assert.match(doc.getElementById('auth-firstname-error').textContent, /first name/i);

    firstName.value = 'Lee';
    firstName.dispatchEvent(new w.Event('input'));
    assert.equal(firstName.hasAttribute('aria-invalid'), false);
    assert.equal(doc.getElementById('auth-firstname-error').textContent, '');

    const email = doc.getElementById('auth-email');
    email.value = 'lee@example';
    email.dispatchEvent(new w.Event('blur'));
    assert.equal(email.getAttribute('aria-invalid'), 'true');
    assert.match(doc.getElementById('auth-email-error').textContent, /full email address/i);
});

test('auth busy state disables controls and reports progress', t => {
    const { doc, run } = setup(t);
    run('setAuthPending(true)');
    const submit = doc.getElementById('auth-submit-btn');
    assert.equal(submit.disabled, true);
    assert.equal(submit.getAttribute('aria-busy'), 'true');
    assert.match(submit.textContent, /Signing in/);
    assert.equal(doc.getElementById('auth-email').disabled, true);
    assert.equal(doc.getElementById('auth-google-btn').disabled, true);

    run('setAuthPending(false)');
    assert.equal(submit.disabled, false);
    assert.equal(submit.getAttribute('aria-busy'), 'false');
    assert.equal(submit.textContent, 'Sign in');
    assert.equal(doc.getElementById('auth-email').disabled, false);
});

test('auth errors use friendly messages and receive focus', t => {
    const { doc, run } = setup(t);
    run('showAuthError(authErrorMessage({code:"auth/too-many-requests"}))');
    const errorBox = doc.getElementById('auth-error');
    assert.equal(errorBox.style.display, 'block');
    assert.match(errorBox.textContent, /Too many attempts/);
    assert.equal(doc.activeElement, errorBox);
    assert.equal(errorBox.classList.contains('is-success'), false);
});

test('status feedback stays inside the product UI', async t => {
    const { doc, run } = setup(t);
    run('showNotice("PDF did not load")');
    const notice = doc.getElementById('app-notice');
    assert.equal(notice.hidden, false);
    assert.match(notice.textContent, /PDF did not load/);
    assert.equal(await run('confirmAction("Delete session?")'), true);
});

test('a late unauthorized response cannot sign out a different account', async t => {
    const { w, auth, run } = setup(t);
    const pending = deferred();
    w.fetch = () => pending.promise;
    const response = run('apiFetch("/chat")');
    await flush();
    auth.currentUser = { uid: 'next-user' };
    pending.resolve({status:401});
    await assert.rejects(response, /account changed/);
    assert.equal(auth.currentUser.uid, 'next-user');
});

test('quiz timing counts elapsed time when background callbacks are delayed', t => {
    const { w, run } = setup(t);
    let tick;
    let time = 1000;
    w.Date.now = () => time;
    w.setInterval = cb => { tick = cb; return 123; };
    w.clearInterval = () => {};
    run(`quizData=[{question:'One?',options:['A','B'],answer:'A'},{question:'Two?',options:['C','D'],answer:'C'}];
        userAnswers=[null,null];questionTimedOut=[false,false];questionTimeRemaining=[30,30];
        activeQuizTimerLimit=30;currentIndex=0;renderQuestion()`);
    time += 31000;
    tick();
    assert.equal(run('questionTimedOut[0]'), true);
    assert.equal(run('currentIndex'), 1);
    assert.equal(run('questionTimeRemaining[0]'), 0);
});

test('history open and delete use separate native buttons', t => {
    const { doc, run } = setup(t);
    run(`renderHistoryItem(document.getElementById('historyList'),'one',{type:'quiz',score:80,numQuestions:5})`);
    const row = doc.querySelector('.history-item');
    assert.equal(row.querySelectorAll('button').length, 2);
    assert.equal(row.querySelector('button button'), null);
    assert.equal(row.getAttribute('role'), null);
});

test('quiz count validates on blur with an actionable error', t => {
    const { w, doc, run } = setup(t);
    run('openTool("quiz")');
    const input = doc.getElementById('num_questions');
    input.value = '0';
    input.dispatchEvent(new w.Event('blur'));

    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.equal(doc.getElementById('num_questions-error').hidden, false);
    assert.match(doc.getElementById('num_questions-error').textContent, /Enter a number from 1 to 30/);

    input.value = '12';
    input.dispatchEvent(new w.Event('blur'));
    assert.equal(input.getAttribute('aria-invalid'), 'false');
    assert.equal(doc.getElementById('num_questions-error').hidden, true);
});

test('quiz generation exposes a disabled, announced loading state', t => {
    const { doc, run } = setup(t);
    run('openTool("quiz"); setGenerationPending(true, "quiz")');
    const form = doc.getElementById('quizForm');
    const submit = doc.getElementById('submitBtn');
    const status = doc.getElementById('form-status');

    assert.equal(form.getAttribute('aria-busy'), 'true');
    assert.equal(submit.disabled, true);
    assert.equal(submit.getAttribute('aria-busy'), 'true');
    assert.match(submit.textContent, /Building quiz/);
    assert.equal(status.hidden, false);

    run('setGenerationPending(false, "quiz")');
    assert.equal(form.getAttribute('aria-busy'), 'false');
    assert.equal(submit.disabled, false);
    assert.equal(submit.textContent, 'Generate quiz');
    assert.equal(status.hidden, true);
});

test('review copy controls have an accessible name', t => {
    const { doc, run } = setup(t);
    run(`quizData=[{question:'One?',options:['A','B'],answer:'A',explanation:'Because A.'}];
        userAnswers=['A'];showReview()`);
    const copy = doc.querySelector('.review-block .copy-btn');
    assert.equal(copy.getAttribute('aria-label'), 'Copy question 1 and answer');
});

test('account identity lives in one profile menu', t => {
    const { doc, run } = setup(t);
    run("setProfileIdentity('Lee Mensah'); setProfileMenu(true)");
    const trigger = doc.getElementById('logoutBtn');
    const menu = doc.getElementById('profileDropdown');

    assert.equal(doc.getElementById('profile-avatar').textContent, 'LM');
    assert.equal(doc.getElementById('profile-name').textContent, 'Lee Mensah');
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(trigger.getAttribute('aria-label'), 'Open account menu for Lee Mensah');
    assert.equal(menu.style.display, 'grid');
    assert.equal(menu.querySelectorAll('.profile-action').length, 1);

    run('setProfileMenu(false)');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(menu.style.display, 'none');
});
