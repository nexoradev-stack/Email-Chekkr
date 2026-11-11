// Email Chekkr — page behaviour: theme switch, menu, single check, bulk CSV check, forms.

import { createVerifier, parseDomainList, runPool, STATUS } from './engine/verify.js';
import { createDohResolver } from './engine/dns.js';
import { checkSyntax } from './engine/syntax.js';
import { parseCsv, findEmailColumn, toCsv } from './engine/csv.js';
import { FORMS } from './config.js';

const MAX_ROWS = 10000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const PREVIEW_ROWS = 50;
const THEME_KEY = 'email-chekkr-theme';

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const STATUS_LABEL = { valid: 'Valid', risky: 'Risky', invalid: 'Invalid', unknown: 'Unknown' };

// ---------- Theme ----------

function currentTheme() {
  const set = document.documentElement.getAttribute('data-theme');
  if (set === 'light' || set === 'dark') return set;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initTheme() {
  const button = document.querySelector('.theme-toggle');
  if (!button) return;
  const label = () => button.setAttribute('aria-label', currentTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  label();
  button.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage blocked: theme still switches */ }
    label();
    document.dispatchEvent(new CustomEvent('chekkr:theme', { detail: next }));
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    label();
    document.dispatchEvent(new CustomEvent('chekkr:theme', { detail: currentTheme() }));
  });
}

// ---------- Menu ----------

function initMenu() {
  const toggle = document.querySelector('.menu-toggle');
  const nav = $('site-nav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
}

// ---------- Shared verifier ----------

let verifierPromise;
function getVerifier() {
  if (!verifierPromise) {
    verifierPromise = fetch('assets/data/disposable-domains.txt')
      .then((res) => (res.ok ? res.text() : ''))
      .catch(() => '')
      .then((text) => createVerifier({ resolve: createDohResolver(), disposable: parseDomainList(text) }));
  }
  return verifierPromise;
}

// ---------- Single check ----------

function checkItem(state, title, detail) {
  const mark = { ok: '✓', warn: '!', bad: '✕', wait: '…', skip: '–' }[state];
  return `<li class="${state}"><span class="mark" aria-hidden="true">${mark}</span>
    <span><strong>${escapeHtml(title)}</strong><span class="detail">${escapeHtml(detail)}</span></span></li>`;
}

function splitAddress(email) {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return [null, null];
  return [email.slice(0, at), email.slice(at + 1)];
}

function renderAnatomy(email, local, domain, localState, domainState) {
  $('address').innerHTML = local !== null
    ? `<span class="seg"><span class="part ${localState}">${escapeHtml(local)}</span><span class="seg-label">name</span></span>`
      + '<span class="at" aria-hidden="true">@</span>'
      + `<span class="seg"><span class="part ${domainState}">${escapeHtml(domain)}</span><span class="seg-label">domain</span></span>`
    : `<span class="seg"><span class="part bad">${escapeHtml(email || ' ')}</span><span class="seg-label">address</span></span>`;
}

function renderChecklist(items) {
  $('checklist').innerHTML = items.map(([state, title, detail]) => checkItem(state, title, detail)).join('');
}

function mxDetail(result) {
  return {
    mx: 'Mail server found',
    'a-fallback': 'No mail server record',
    'null-mx': 'Says it never accepts email',
    'no-mail': 'No mail server found',
    nxdomain: 'Domain does not exist',
    error: 'No answer in time',
    'not-checked': 'Not checked'
  }[result] || '';
}

function buildChecklist(result) {
  const c = result.checks;
  const items = [];
  items.push(c.syntax ? ['ok', 'Format', 'Written correctly'] : ['bad', 'Format', 'Not a valid address']);
  if (!c.syntax) {
    items.push(['skip', 'Domain', 'Not checked'], ['skip', 'Mail server', 'Not checked'],
      ['skip', 'Temporary inbox', 'Not checked'], ['skip', 'Person or team', 'Not checked']);
    return items;
  }
  const exists = c.mx !== 'nxdomain' && c.mx !== 'error';
  items.push(c.mx === 'error' ? ['wait', 'Domain', 'No answer yet'] : exists ? ['ok', 'Domain', 'Exists'] : ['bad', 'Domain', 'Does not exist']);
  const mxState = c.mx === 'mx' ? 'ok' : c.mx === 'a-fallback' ? 'warn' : c.mx === 'error' ? 'wait' : 'bad';
  items.push([mxState, 'Mail server', mxDetail(c.mx)]);
  items.push(c.disposable ? ['warn', 'Temporary inbox', 'Known disposable domain'] : ['ok', 'Temporary inbox', 'Not disposable']);
  items.push(c.role ? ['warn', 'Person or team', 'Team address'] : ['ok', 'Person or team', 'Looks like a person']);
  if (result.suggestion) items.push(['warn', 'Typo', 'Domain looks mistyped']);
  return items;
}

function renderVerdict(result) {
  const v = $('verdict');
  const color = `var(--${result.status})`;
  v.className = `verdict ${result.status}`;
  v.innerHTML = `<span class="status">${STATUS_LABEL[result.status]}</span>
    <span class="score">Score ${result.score} / 100</span>
    <div class="meter" aria-hidden="true"><span style="background:${color}"></span></div>`;
  v.hidden = false;
  requestAnimationFrame(() => { v.querySelector('.meter span').style.width = `${result.score}%`; });

  const reason = $('reason-line');
  const suggest = result.suggestion
    ? ` <button type="button" data-suggest="${escapeHtml(result.suggestion)}">Check ${escapeHtml(result.suggestion)} instead</button>`
    : '';
  reason.innerHTML = `${escapeHtml(result.reason)}.${suggest}`.replace('?.', '?');
  reason.hidden = false;
}

async function runSingle(email) {
  $('result-panel').hidden = false;
  $('verdict').hidden = true;
  $('reason-line').hidden = true;

  const syntax = checkSyntax(email);
  const [local, domain] = splitAddress(syntax.email);

  if (!syntax.ok) {
    renderAnatomy(syntax.email, local, domain, 'bad', 'bad');
    const result = { status: STATUS.INVALID, score: 0, reason: syntax.reason, suggestion: null, checks: { syntax: false } };
    renderChecklist(buildChecklist(result));
    renderVerdict(result);
    return;
  }

  renderAnatomy(syntax.email, local, domain, 'ok', 'wait');
  renderChecklist([
    ['ok', 'Format', 'Written correctly'],
    ['wait', 'Domain', 'Checking…'],
    ['wait', 'Mail server', 'Checking…'],
    ['wait', 'Temporary inbox', 'Checking…'],
    ['wait', 'Person or team', 'Checking…']
  ]);

  const verifier = await getVerifier();
  const result = await verifier.verify(syntax.email);
  const c = result.checks;
  let domainState = 'ok';
  if (result.status === STATUS.INVALID) domainState = 'bad';
  else if (result.status === STATUS.UNKNOWN) domainState = 'wait';
  else if (c.disposable || result.suggestion || c.mx === 'a-fallback') domainState = 'warn';
  renderAnatomy(syntax.email, local, domain, c.role ? 'warn' : 'ok', domainState);
  renderChecklist(buildChecklist(result));
  renderVerdict(result);
}

function initSingle() {
  const form = $('single-form');
  const input = $('single-input');
  if (!form) return;

  const run = (value) => runSingle(value).catch(() => {
    renderVerdict({ status: 'unknown', score: 50, reason: 'Something went wrong while checking. Try again', checks: {} });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!input.value.trim()) { input.focus(); return; }
    run(input.value);
  });
  document.querySelectorAll('[data-try]').forEach((button) => {
    button.addEventListener('click', () => { input.value = button.dataset.try; run(input.value); });
  });
  $('reason-line').addEventListener('click', (e) => {
    const button = e.target.closest('[data-suggest]');
    if (!button) return;
    input.value = button.dataset.suggest;
    run(input.value);
  });
  getVerifier(); // warm up the disposable list
}

// ---------- Bulk CSV ----------

const bulk = { rows: null, column: -1, hasHeader: false, results: null, fileName: '', controller: null };

function showBulkError(message) {
  const box = $('bulk-error');
  box.textContent = message;
  box.hidden = !message;
}

function setBulkView(view) {
  $('bulk-empty').hidden = view !== 'empty';
  $('bulk-progress').hidden = view !== 'progress';
  $('bulk-result').hidden = view !== 'result';
}

function outputRows(onlyValid) {
  const header = bulk.hasHeader ? bulk.rows[0] : bulk.rows[0].map((_, i) => (i === bulk.column ? 'email' : `column_${i + 1}`));
  const out = [[...header, 'chekkr_status', 'chekkr_score', 'chekkr_reason', 'chekkr_suggestion']];
  const data = bulk.hasHeader ? bulk.rows.slice(1) : bulk.rows;
  data.forEach((row, i) => {
    const r = bulk.results[i];
    if (!r) return;
    if (onlyValid && r.status !== STATUS.VALID) return;
    out.push([...row, r.status, r.score, r.reason, r.suggestion || '']);
  });
  return out;
}

function download(rows, suffix) {
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const base = bulk.fileName.replace(/\.csv$/i, '') || 'list';
  a.href = url;
  a.download = `${base}-chekkr-${suffix}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderBulkResult(stopped) {
  const results = bulk.results.filter(Boolean);
  const total = results.length;
  const counts = { valid: 0, risky: 0, invalid: 0, unknown: 0 };
  results.forEach((r) => { counts[r.status] += 1; });

  $('bulk-file-name').textContent = `${bulk.fileName}: ${total.toLocaleString()} addresses checked${stopped ? ' (stopped early)' : ''}`;
  $('summary-bar').innerHTML = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([status, n]) => `<span class="${status}" style="flex:${n}"></span>`)
    .join('');
  $('counts').innerHTML = Object.entries(counts)
    .map(([status, n]) => `<li><b>${n.toLocaleString()}</b><span class="dot" style="background:var(--${status})"></span>${STATUS_LABEL[status]}</li>`)
    .join('');

  const data = bulk.hasHeader ? bulk.rows.slice(1) : bulk.rows;
  $('preview-rows').innerHTML = data.slice(0, PREVIEW_ROWS).map((row, i) => {
    const r = bulk.results[i];
    if (!r) return '';
    return `<tr><td class="email">${escapeHtml(row[bulk.column] || '')}</td>
      <td><span class="pill ${r.status}">${STATUS_LABEL[r.status]}</span></td>
      <td class="why">${escapeHtml(r.reason)}</td></tr>`;
  }).join('');
  $('table-caption').textContent = total > PREVIEW_ROWS
    ? `Showing the first ${PREVIEW_ROWS} of ${total.toLocaleString()}. Download the file to see all.`
    : '';
  $('download-valid').disabled = counts.valid === 0;
  setBulkView('result');
}

async function runBulk(file) {
  showBulkError('');
  if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
    showBulkError('This file isn\'t a CSV. Save your sheet as CSV and try again.');
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    showBulkError('This file is larger than 5 MB. Split it into smaller files and try again.');
    return;
  }

  const rows = parseCsv(await file.text());
  const { index, hasHeader } = findEmailColumn(rows);
  if (index < 0) {
    showBulkError('No email column found. Add a header called "Email" above your addresses and try again.');
    return;
  }
  const dataRows = hasHeader ? rows.slice(1) : rows;
  if (!dataRows.length) {
    showBulkError('The file has no rows to check.');
    return;
  }
  if (dataRows.length > MAX_ROWS) {
    showBulkError(`This file has ${dataRows.length.toLocaleString()} rows. The limit is ${MAX_ROWS.toLocaleString()}. Split it into smaller files and try again.`);
    return;
  }

  Object.assign(bulk, { rows, column: index, hasHeader, results: new Array(dataRows.length), fileName: file.name });
  bulk.controller = new AbortController();

  setBulkView('progress');
  const bar = $('bulk-progress-bar');
  const text = $('bulk-progress-text');
  bar.style.width = '0%';
  text.textContent = `Checking 0 of ${dataRows.length.toLocaleString()}…`;

  const verifier = await getVerifier();
  const emails = dataRows.map((row) => row[index] || '');
  bulk.results = await runPool(emails, (email) => verifier.verify(email), {
    concurrency: 8,
    signal: bulk.controller.signal,
    onProgress: (done, total) => {
      bar.style.width = `${(done / total) * 100}%`;
      text.textContent = `Checking ${done.toLocaleString()} of ${total.toLocaleString()}…`;
    }
  });

  if (!bulk.results.some(Boolean)) {
    setBulkView('empty');
    return;
  }
  renderBulkResult(bulk.controller.signal.aborted);
}

function initBulk() {
  const input = $('csv-input');
  const drop = $('drop');
  if (!input) return;
  const fail = () => { setBulkView('empty'); showBulkError('Something went wrong reading this file. Check it opens in a spreadsheet, then try again.'); };

  input.addEventListener('change', () => {
    if (input.files[0]) runBulk(input.files[0]).catch(fail);
    input.value = '';
  });
  ['dragenter', 'dragover'].forEach((type) => drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((type) => drop.addEventListener(type, () => drop.classList.remove('dragging')));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) runBulk(file).catch(fail);
  });

  $('bulk-cancel').addEventListener('click', () => bulk.controller?.abort());
  $('download-all').addEventListener('click', () => download(outputRows(false), 'results'));
  $('download-valid').addEventListener('click', () => download(outputRows(true), 'valid'));
}

// ---------- Contact and waitlist forms ----------
// Sends through Web3Forms when an access key is set in config.js. Until then,
// falls back to opening the visitor's mail app (if a fallback address is set),
// or explains that the form isn't connected yet.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formStatus(form, message, kind) {
  const el = form.querySelector('.form-status');
  el.textContent = message;
  el.className = `form-status ${kind || ''}`;
}

function formFields(form) {
  const data = {};
  new FormData(form).forEach((value, key) => { if (key !== 'botcheck') data[key] = String(value).trim(); });
  return data;
}

async function sendForm(kind, data) {
  const subject = kind === 'waitlist'
    ? `Email Chekkr waitlist: ${data.plan || 'plan not chosen'}`
    : `Email Chekkr contact: ${data.topic || 'message'}`;
  if (FORMS.web3formsKey) {
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ access_key: FORMS.web3formsKey, subject, from_name: 'Email Chekkr website', form: kind, ...data })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) throw new Error(json.message || 'send failed');
    return 'sent';
  }
  if (FORMS.fallbackEmail) {
    const body = Object.entries(data).map(([k, v]) => `${k}: ${v}`).join('\n');
    window.location.href = `mailto:${FORMS.fallbackEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return 'mail-app';
  }
  return 'not-connected';
}

function initForms() {
  document.querySelectorAll('form[data-form]').forEach((form) => {
    const kind = form.dataset.form;
    const button = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.querySelector('[name="botcheck"]')?.checked) return;
      const data = formFields(form);
      const missing = [...form.querySelectorAll('[required]')].find((el) => !el.value.trim());
      if (missing) { formStatus(form, 'Please fill in every field.', 'err'); missing.focus(); return; }
      if (!EMAIL_RE.test(data.email || '')) { formStatus(form, 'Please enter a valid email address.', 'err'); form.querySelector('[name="email"]').focus(); return; }
      button.disabled = true;
      formStatus(form, 'Sending…');
      try {
        const outcome = await sendForm(kind, data);
        if (outcome === 'sent') {
          form.reset();
          formStatus(form, kind === 'waitlist' ? "You're on the list. We'll email you when paid plans open." : "Thanks — your message is on its way. We'll reply by email.", 'ok');
        } else if (outcome === 'mail-app') {
          formStatus(form, 'Your mail app should open with the message ready to send.', 'ok');
        } else {
          formStatus(form, "This form isn't connected yet. Please try again soon.", 'err');
        }
      } catch {
        formStatus(form, "Couldn't send right now. Check your connection and try again.", 'err');
      } finally {
        button.disabled = false;
      }
    });
  });

  // contact.html?topic=api preselects the topic
  const topic = new URLSearchParams(window.location.search).get('topic');
  const select = $('c-topic');
  if (topic && select && [...select.options].some((o) => o.value === topic)) select.value = topic;
}

function initPlanButtons() {
  const select = $('wl-plan');
  document.querySelectorAll('[data-plan]').forEach((button) => {
    button.addEventListener('click', () => {
      if (select) select.value = button.dataset.plan;
      $('waitlist')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      $('wl-email')?.focus({ preventScroll: true });
    });
  });
}

// ---------- Start ----------

document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });
initTheme();
initMenu();
initSingle();
initBulk();
initForms();
initPlanButtons();
