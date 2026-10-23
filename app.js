(() => {
  'use strict';

  const SCHEMA = 'ezhamkulam-thookkam-save';
  const SCHEMA_VERSION = 1;
  const MAX_VALAYAM = 196;
  const DEFAULT_QUANTITY = 'ഒറ്റ';
  const MURIS = [
    'ഏഴംകുളം തെക്ക്',
    'ഏഴംകുളം വടക്ക്',
    'അറുകാലിക്കൽ കിഴക്ക്',
    'അറുകാലിക്കൽ പടിഞ്ഞാറ്',
    'നെടുമൺ',
    'പറക്കോട് തെക്ക്',
    'പറക്കോട് വടക്ക്',
    'പറക്കോട് ഇടയിൽ',
    'മങ്ങാട്',
    'ചെറുകുന്നത്ത്'
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const startGate = $('#startGate');
  const application = $('#application');
  const mainView = $('#mainView');
  const printRoot = $('#printRoot');
  const uploadForm = $('#uploadForm');
  const databaseFile = $('#databaseFile');
  const dropZone = $('#dropZone');
  const uploadError = $('#uploadError');
  const toast = $('#toast');
  const saveStatus = $('#saveStatus');

  let db = null;
  let activeSection = 'home';
  let dirty = false;
  let editingThookakaranId = null;
  let editingVazhipadukaranId = null;
  let toastTimer = null;

  const nowISO = () => new Date().toISOString();
  const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const currentYear = 2026;

  function createEmptyDatabase() {
    const stamp = nowISO();
    return {
      schema: SCHEMA,
      schemaVersion: SCHEMA_VERSION,
      meta: {
        templeName: 'Ezhamkulam Devi Temple',
        festivalYear: currentYear,
        createdAt: stamp,
        updatedAt: stamp,
        lastSavedAt: null
      },
      thookakarans: [],
      vazhipadukarans: [],
      chart: { year: currentYear, boxes: [] }
    };
  }

  function normalizeDatabase(input) {
    if (!input || typeof input !== 'object') throw new Error('The file does not contain a database object.');
    if (input.schema !== SCHEMA) throw new Error('This does not look like an Ezhamkulam Thookkam save file.');
    if (input.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported save-file version (${input.schemaVersion ?? 'unknown'}). This trial supports version ${SCHEMA_VERSION}.`);
    if (!Array.isArray(input.thookakarans) || !Array.isArray(input.vazhipadukarans) || !input.chart || !Array.isArray(input.chart.boxes)) {
      throw new Error('The save file is missing one or more required registers.');
    }
    const normalized = structuredClone(input);
    normalized.meta = normalized.meta && typeof normalized.meta === 'object' ? normalized.meta : {};
    normalized.meta.templeName ||= 'Ezhamkulam Devi Temple';
    normalized.meta.festivalYear ||= currentYear;
    normalized.chart.year ||= normalized.meta.festivalYear || currentYear;
    normalized.chart.boxes = normalized.chart.boxes.map((box) => ({
      id: String(box.id || makeId('box')),
      valayamNumber: Number.isFinite(Number(box.valayamNumber)) ? Number(box.valayamNumber) : 1,
      muri: MURIS.includes(box.muri) ? box.muri : '',
      entries: [0, 1, 2].map((index) => {
        const entry = Array.isArray(box.entries) ? box.entries[index] || {} : {};
        return {
          vazhipadukaranId: entry.vazhipadukaranId || null,
          registrationNo: String(entry.registrationNo || ''),
          quantity: String(entry.quantity ?? DEFAULT_QUANTITY)
        };
      })
    }));
    normalized.thookakarans = normalized.thookakarans.map((person) => ({
      id: String(person.id || makeId('thook')),
      registrationNo: String(person.registrationNo || ''),
      name: String(person.name || ''),
      address: String(person.address || ''),
      createdAt: person.createdAt || nowISO()
    }));
    normalized.vazhipadukarans = normalized.vazhipadukarans.map((person) => ({
      id: String(person.id || makeId('vazhi')),
      registrationNo: String(person.registrationNo || ''),
      name: String(person.name || ''),
      address: String(person.address || ''),
      kuttiyeEduth: Boolean(person.kuttiyeEduth),
      thookakaranIds: Array.isArray(person.thookakaranIds) ? person.thookakaranIds.map(String) : [],
      manualThookakarans: Array.isArray(person.manualThookakarans) ? person.manualThookakarans.map((x) => ({ name: String(x.name || ''), address: String(x.address || '') })).filter((x) => x.name.trim()) : [],
      createdAt: person.createdAt || nowISO()
    }));
    return normalized;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  function nl2br(value) {
    return esc(value).replace(/\r?\n/g, '<br>');
  }

  function sameReg(a, b) {
    return String(a ?? '').trim().toLocaleLowerCase() === String(b ?? '').trim().toLocaleLowerCase();
  }

  function getThookakaran(id) {
    return db?.thookakarans.find((person) => person.id === id) || null;
  }

  function getVazhipadukaran(id) {
    return db?.vazhipadukarans.find((person) => person.id === id) || null;
  }

  function findVazhiByReg(registrationNo) {
    return db?.vazhipadukarans.find((person) => sameReg(person.registrationNo, registrationNo)) || null;
  }

  function findThookByReg(registrationNo) {
    return db?.thookakarans.find((person) => sameReg(person.registrationNo, registrationNo)) || null;
  }

  function personThookakarans(person) {
    if (!person) return [];
    const registered = (person.thookakaranIds || []).map(getThookakaran).filter(Boolean).map((entry) => ({ name: entry.name, address: entry.address, registrationNo: entry.registrationNo, source: 'registered' }));
    const manual = (person.manualThookakarans || []).filter((entry) => entry.name.trim()).map((entry) => ({ name: entry.name, address: entry.address, registrationNo: '', source: 'manual' }));
    return [...registered, ...manual];
  }

  function boxKuttiye(box) {
    return (box.entries || []).some((entry) => {
      const person = getVazhipadukaran(entry.vazhipadukaranId);
      return Boolean(person?.kuttiyeEduth);
    });
  }

  function boxEntryCount(box) {
    return (box.entries || []).filter((entry) => getVazhipadukaran(entry.vazhipadukaranId)).length;
  }

  function formatDate(value) {
    if (!value) return 'Not saved yet';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3800);
  }

  function setDirty(value = true) {
    dirty = value;
    if (!db) return;
    const statusText = saveStatus.querySelector('span:last-child');
    saveStatus.classList.toggle('dirty', dirty);
    saveStatus.classList.toggle('error', false);
    statusText.textContent = dirty ? 'Unsaved changes' : 'Database loaded';
    $('#downloadSaveButton').title = dirty ? 'Download to keep your unsaved changes' : 'Download a backup of the current database';
  }

  function downloadBlob(filename, content, type = 'application/json') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function downloadDatabase(isFirstSetup = false) {
    if (!db) return;
    const stamp = nowISO();
    db.meta.updatedAt = stamp;
    db.meta.lastSavedAt = stamp;
    const year = db.chart.year || db.meta.festivalYear || currentYear;
    const dateStamp = stamp.slice(0, 10);
    const filename = `ezhamkulam-thookkam-save-${dateStamp}.json`;
    const contents = JSON.stringify(db, null, 2);
    downloadBlob(filename, contents);
    setDirty(false);
    if (isFirstSetup) showToast('Starter database downloaded. Keep it safe; it is your first save file.');
    else showToast('Database save file downloaded. Use this file next time you open the app.');
    renderStatus();
  }

  function renderStatus() {
    if (!db) return;
    const statusText = saveStatus.querySelector('span:last-child');
    saveStatus.classList.toggle('dirty', dirty);
    statusText.textContent = dirty ? 'Unsaved changes' : 'Database loaded';
  }

  function activateDatabase(loadedDb, message) {
    db = loadedDb;
    activeSection = 'home';
    editingThookakaranId = null;
    editingVazhipadukaranId = null;
    dirty = false;
    startGate.hidden = true;
    application.hidden = false;
    renderApp();
    showToast(message);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function setUploadError(message = '') {
    uploadError.textContent = message;
    uploadError.hidden = !message;
  }

  async function loadDatabaseFile(file) {
    setUploadError('');
    if (!file) return;
    if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
      setUploadError('Please choose a database save file ending in .json.');
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const loadedDb = normalizeDatabase(parsed);
      activateDatabase(loadedDb, `Save file loaded: ${file.name}`);
      databaseFile.value = '';
    } catch (error) {
      setUploadError(error instanceof SyntaxError ? 'The file is not valid JSON. Choose an earlier database save file.' : error.message || 'Could not open this save file.');
    }
  }

  uploadForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const file = databaseFile.files?.[0];
    if (!file) {
      setUploadError('Choose your latest database save file first.');
      return;
    }
    loadDatabaseFile(file);
  });

  $('#chooseFileButton').addEventListener('click', () => databaseFile.click());
  dropZone.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    databaseFile.click();
  });
  dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); databaseFile.click(); }
  });
  databaseFile.addEventListener('change', () => {
    const file = databaseFile.files?.[0];
    if (file) {
      dropZone.querySelector('strong').textContent = file.name;
      dropZone.querySelector('span').textContent = `${(file.size / 1024).toFixed(1)} KB · ready to upload`;
      setUploadError('');
    }
  });
  ['dragenter', 'dragover'].forEach((name) => dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach((name) => dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.remove('drag-over'); }));
  dropZone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) loadDatabaseFile(file);
  });

  $('#createDatabaseButton').addEventListener('click', () => {
    const ok = window.confirm('Create a brand-new empty database? This will not restore any previous records. Use this only for first-time setup or when you intentionally want to start a separate register.');
    if (!ok) return;
    db = createEmptyDatabase();
    downloadDatabase(true);
    activateDatabase(db, 'New empty database created for this session.');
  });

  $('#downloadSaveButton').addEventListener('click', () => downloadDatabase(false));
  $('#switchDatabaseButton').addEventListener('click', () => {
    if (dirty && !window.confirm('You have unsaved changes. Switch databases anyway? Download the save file first or those changes will be lost.')) return;
    db = null;
    dirty = false;
    editingThookakaranId = null;
    editingVazhipadukaranId = null;
    application.hidden = true;
    startGate.hidden = false;
    uploadForm.reset();
    setUploadError('');
    dropZone.querySelector('strong').textContent = 'Choose your database file';
    dropZone.querySelector('span').textContent = 'ezhamkulam-thookkam-save-2026-....json';
  });

  window.addEventListener('beforeunload', (event) => {
    if (db && dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  document.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-nav]');
    if (nav && db) {
      event.preventDefault();
      activeSection = nav.dataset.nav;
      editingThookakaranId = null;
      editingVazhipadukaranId = null;
      renderApp();
      return;
    }
    const action = event.target.closest('[data-action]');
    if (!action || !db) return;
    const kind = action.dataset.action;
    if (kind === 'download-save') downloadDatabase(false);
    if (kind === 'create-thookakaran') { editingThookakaranId = null; renderApp(); $('#thookakaranRegNo')?.focus(); }
    if (kind === 'create-vazhipadukaran') { editingVazhipadukaranId = null; renderApp(); $('#vazhiRegNo')?.focus(); }
    if (kind === 'cancel-thook-edit') { editingThookakaranId = null; renderApp(); }
    if (kind === 'cancel-vazhi-edit') { editingVazhipadukaranId = null; renderApp(); }
    if (kind === 'edit-thook') { editingThookakaranId = action.dataset.id; activeSection = 'thookakaran'; renderApp(); $('#thookakaranName')?.focus(); }
    if (kind === 'delete-thook') deleteThookakaran(action.dataset.id);
    if (kind === 'edit-vazhi') { editingVazhipadukaranId = action.dataset.id; activeSection = 'vazhipadukaran'; renderApp(); $('#vazhiName')?.focus(); }
    if (kind === 'delete-vazhi') deleteVazhipadukaran(action.dataset.id);
    if (kind === 'add-box') addValayamBox();
    if (kind === 'delete-box') deleteValayamBox(action.dataset.id);
    if (kind === 'print-chart') {
      if (!db.chart.boxes.length) { showToast('Add at least one Valayam box before printing.'); return; }
      if (!commitPendingChartForms()) return;
      renderPrintRoot();
      window.print();
    }
    if (kind === 'clear-vazhi-edit') { editingVazhipadukaranId = null; activeSection = 'vazhipadukaran'; renderApp(); }
  });

  function renderApp() {
    if (!db) return;
    $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.nav === activeSection));
    if (activeSection === 'home') mainView.innerHTML = renderHome();
    else if (activeSection === 'thookakaran') mainView.innerHTML = renderThookakaranScreen();
    else if (activeSection === 'vazhipadukaran') mainView.innerHTML = renderVazhipadukaranScreen();
    else if (activeSection === 'chart') mainView.innerHTML = renderChartScreen();
    else { activeSection = 'home'; mainView.innerHTML = renderHome(); }
    renderStatus();
    renderPrintRoot();
    bindCurrentForm();
  }

  function renderHome() {
    const totalFilled = db.chart.boxes.reduce((sum, box) => sum + boxEntryCount(box), 0);
    return `
      <div class="page-heading">
        <div><p class="eyebrow-dark">TEMPLE RECORDS · ${esc(db.chart.year || currentYear)}</p><h1>Namaskaram 🙏</h1><p>Manage registrations and prepare the Vazhipadu Thookkam chart from one place. Changes are held in this session until you download the database save file.</p></div>
        <div class="heading-actions"><button type="button" class="button button-primary" data-action="download-save">↓ Download save file</button></div>
      </div>
      <div class="metrics-grid">
        <div class="metric-card"><div class="metric-icon">♙</div><div><small>Registered Thookakarans</small><strong>${db.thookakarans.length}</strong></div></div>
        <div class="metric-card"><div class="metric-icon">♧</div><div><small>Registered Vazhipadukarans</small><strong>${db.vazhipadukarans.length}</strong></div></div>
        <div class="metric-card"><div class="metric-icon">▦</div><div><small>Valayam boxes created</small><strong>${db.chart.boxes.length}<span style="font-size:11px;color:#8b7972;font-weight:600"> / ${MAX_VALAYAM}</span></strong></div></div>
      </div>
      <p class="section-label">SELECT AN OPTION</p>
      <div class="menu-grid">
        <button type="button" class="menu-card" data-nav="thookakaran"><span class="menu-card-icon">♙</span><h3>Register Thookakaran</h3><p>Maintain a register of Thookakarans with manually assigned registration numbers, names and addresses.</p><span class="card-link">Open register <span>→</span></span></button>
        <button type="button" class="menu-card" data-nav="vazhipadukaran"><span class="menu-card-icon">♧</span><h3>Add Vazhipadukaran</h3><p>Register the Vazhipadukaran, store the Kuttiye Eduth status, and associate multiple registered or manually typed Thookakarans.</p><span class="card-link">Open register <span>→</span></span></button>
        <button type="button" class="menu-card" data-nav="chart"><span class="menu-card-icon">▦</span><h3>Chart</h3><p>Add Valayam boxes, choose one Muri for each box, and fill its three positions by registration number.</p><span class="card-link">Build chart <span>→</span></span></button>
      </div>
      <div class="info-banner"><span aria-hidden="true">ⓘ</span><div><strong>Save-file reminder.</strong> This website does not keep a server copy of your data. Download a fresh save file after changes and upload that file next time. Do not put database save files containing personal details into a public GitHub repository.</div></div>
      <div class="panel" style="margin-top:18px"><div class="panel-title-row"><div><h2>Current chart progress</h2><p>Registered Vazhipadukaran entries linked to the chart.</p></div><span class="badge ${dirty ? 'warn' : ''}">${dirty ? 'Save needed' : 'Session loaded'}</span></div><div class="chart-summary-line"><span>Entry positions filled</span><strong>${totalFilled} / ${db.chart.boxes.length * 3}</strong><span>Last saved in file: ${esc(formatDate(db.meta.lastSavedAt))}</span></div></div>`;
  }

  function renderThookakaranScreen() {
    const current = editingThookakaranId ? getThookakaran(editingThookakaranId) : null;
    const formTitle = current ? 'Edit Thookakaran record' : 'Register a Thookakaran';
    const rows = db.thookakarans.length ? db.thookakarans.slice().sort((a, b) => a.registrationNo.localeCompare(b.registrationNo, undefined, { numeric: true })).map((person) => {
      const linkedCount = db.vazhipadukarans.filter((v) => (v.thookakaranIds || []).includes(person.id)).length;
      return `<tr><td><span class="cell-primary">${esc(person.registrationNo)}</span></td><td><span class="cell-primary">${esc(person.name)}</span></td><td>${nl2br(person.address) || '<span class="cell-secondary">No address entered</span>'}</td><td>${linkedCount}</td><td><div class="table-actions"><button type="button" class="small-action" data-action="edit-thook" data-id="${esc(person.id)}">Edit</button><button type="button" class="small-action danger" data-action="delete-thook" data-id="${esc(person.id)}">Delete</button></div></td></tr>`;
    }).join('') : '';
    return `
      <div class="page-heading"><div><p class="eyebrow-dark">REGISTER 01</p><h1>Register Thookakaran</h1><p>Add and maintain the Thookakaran register. Registration numbers are assigned manually and must be unique within this register.</p></div><div class="heading-actions"><button class="button button-secondary" type="button" data-action="download-save">↓ Save backup</button></div></div>
      <section class="panel"><div class="panel-title-row"><div><h2>${formTitle}</h2><p>These details can be selected from the Vazhipadukaran form.</p></div>${current ? '<span class="badge warn">Editing</span>' : ''}</div>
        <form id="thookakaranForm" data-form="thookakaran" novalidate>
          <div class="form-grid">
            <label class="field"><span class="form-label">Registration number *</span><input id="thookakaranRegNo" name="registrationNo" type="text" maxlength="40" placeholder="e.g. TK-001" value="${esc(current?.registrationNo || '')}" required><span class="field-hint">Type the number you use in the temple register.</span></label>
            <label class="field"><span class="form-label">Full name *</span><input id="thookakaranName" name="name" type="text" maxlength="140" placeholder="Enter full name" value="${esc(current?.name || '')}" required></label>
            <label class="field full-width"><span class="form-label">Address *</span><textarea name="address" maxlength="500" placeholder="House name, place, locality" required>${esc(current?.address || '')}</textarea></label>
          </div>
          <div id="thookFormMessage" class="form-message error-message" role="alert" hidden></div>
          <div class="form-actions"><button class="button button-primary" type="submit">${current ? 'Update Thookakaran' : 'Save Thookakaran'}</button>${current ? '<button class="button button-quiet" type="button" data-action="cancel-thook-edit">Cancel edit</button>' : '<button class="button button-quiet" type="reset">Clear form</button>'}</div>
        </form>
      </section>
      <section class="panel"><div class="panel-title-row"><div><h2>Thookakaran register <span class="cell-secondary">(${db.thookakarans.length})</span></h2><p>Saved records for this database file.</p></div></div>
        ${rows ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Reg. number</th><th>Name</th><th>Address</th><th>Linked records</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty-state"><div class="empty-symbol">♙</div><strong>No Thookakarans registered yet</strong><p>Enter the first record above. It will become available for linking to Vazhipadukarans.</p></div>`}
      </section>`;
  }

  function renderVazhipadukaranScreen() {
    const current = editingVazhipadukaranId ? getVazhipadukaran(editingVazhipadukaranId) : null;
    const formTitle = current ? 'Edit Vazhipadukaran record' : 'Add a Vazhipadukaran';
    const registeredChoices = db.thookakarans.length ? db.thookakarans.slice().sort((a, b) => a.registrationNo.localeCompare(b.registrationNo, undefined, { numeric: true })).map((person) => {
      const checked = current && current.thookakaranIds.includes(person.id) ? ' checked' : '';
      return `<label class="link-option"><input type="checkbox" name="thookakaranIds" value="${esc(person.id)}"${checked}><span><strong>${esc(person.registrationNo)} · ${esc(person.name)}</strong><small>${esc(person.address || 'No address entered')}</small></span></label>`;
    }).join('') : '';
    const manual = current?.manualThookakarans?.length ? current.manualThookakarans : [{ name: '', address: '' }];
    const manualRows = manual.map((person, index) => renderManualThookRow(person, index)).join('');
    const rows = db.vazhipadukarans.length ? db.vazhipadukarans.slice().sort((a, b) => a.registrationNo.localeCompare(b.registrationNo, undefined, { numeric: true })).map((person) => {
      const thooks = personThookakarans(person).map((x) => `${x.registrationNo ? `${x.registrationNo} · ` : ''}${x.name}`).join(', ');
      const inChart = db.chart.boxes.some((box) => box.entries.some((entry) => entry.vazhipadukaranId === person.id));
      return `<tr><td><span class="cell-primary">${esc(person.registrationNo)}</span></td><td><span class="cell-primary">${esc(person.name)}</span></td><td>${nl2br(person.address)}</td><td>${person.kuttiyeEduth ? '<span class="badge">അതെ</span>' : '<span class="cell-secondary">—</span>'}</td><td>${esc(thooks || 'Not assigned')}</td><td><div class="table-actions"><button type="button" class="small-action" data-action="edit-vazhi" data-id="${esc(person.id)}">Edit</button><button type="button" class="small-action danger" data-action="delete-vazhi" data-id="${esc(person.id)}" ${inChart ? 'title="Remove this record from the chart first"' : ''}>Delete</button></div></td></tr>`;
    }).join('') : '';
    return `
      <div class="page-heading"><div><p class="eyebrow-dark">REGISTER 02</p><h1>Add Vazhipadukaran</h1><p>Save a Vazhipadukaran's details once. The Chart screen will retrieve them by registration number.</p></div><div class="heading-actions"><button class="button button-secondary" type="button" data-action="download-save">↓ Save backup</button></div></div>
      <section class="panel"><div class="panel-title-row"><div><h2>${formTitle}</h2><p>The checkbox is stored with the record; the final printed chart will show the traditional text/blank format.</p></div>${current ? '<span class="badge warn">Editing</span>' : ''}</div>
        <form id="vazhipadukaranForm" data-form="vazhipadukaran" novalidate>
          <div class="form-grid">
            <label class="field"><span class="form-label">Registration number *</span><input id="vazhiRegNo" name="registrationNo" type="text" maxlength="40" placeholder="e.g. 125" value="${esc(current?.registrationNo || '')}" required><span class="field-hint">Manually assigned and unique within this register.</span></label>
            <label class="field"><span class="form-label">Full name *</span><input id="vazhiName" name="name" type="text" maxlength="140" placeholder="Enter full name" value="${esc(current?.name || '')}" required></label>
            <label class="field full-width"><span class="form-label">Address *</span><textarea name="address" maxlength="500" placeholder="House name, place, locality" required>${esc(current?.address || '')}</textarea></label>
            <div class="full-width"><label class="check-row"><input type="checkbox" name="kuttiyeEduth"${current?.kuttiyeEduth ? ' checked' : ''}><span><strong>കുട്ടിയെ എടുത്ത് (Kuttiye Eduth)</strong><small>Tick this when it applies. In the printed chart, the grouped cell will show “അതെ” if any of its three linked entries is checked; otherwise it remains blank to match the reference chart.</small></span></label></div>
          </div>
          <div class="divider-label">SELECT FROM REGISTERED THOOKAKARANS</div>
          ${registeredChoices ? `<div class="link-picker">${registeredChoices}</div>` : `<div class="info-banner" style="margin-top:0"><span>ⓘ</span><div>No registered Thookakarans yet. Add them in <strong>Register Thookakaran</strong>, or enter a Thookakaran manually below.</div></div>`}
          <div class="divider-label">OR TYPE THOOKAKARAN DETAILS MANUALLY</div>
          <div id="manualThookList" class="manual-list">${manualRows}</div>
          <div class="form-actions"><button type="button" class="button button-secondary" id="addManualThookButton">+ Add another manual Thookakaran</button></div>
          <div id="vazhiFormMessage" class="form-message error-message" role="alert" hidden></div>
          <div class="form-actions"><button class="button button-primary" type="submit">${current ? 'Update Vazhipadukaran' : 'Save Vazhipadukaran'}</button>${current ? '<button class="button button-quiet" type="button" data-action="cancel-vazhi-edit">Cancel edit</button>' : '<button class="button button-quiet" type="reset">Clear form</button>'}</div>
        </form>
      </section>
      <section class="panel"><div class="panel-title-row"><div><h2>Vazhipadukaran register <span class="cell-secondary">(${db.vazhipadukarans.length})</span></h2><p>One person may be associated with more than one Thookakaran.</p></div></div>
        ${rows ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Reg. number</th><th>Name</th><th>Address</th><th>Kuttiye Eduth</th><th>Thookakaran(s)</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty-state"><div class="empty-symbol">♧</div><strong>No Vazhipadukarans registered yet</strong><p>Add the first person using the form above.</p></div>`}
      </section>`;
  }

  function renderManualThookRow(person, index) {
    return `<div class="manual-row"><label class="field"><span class="form-label">Manual Thookakaran name</span><input name="manualThookName" type="text" maxlength="140" placeholder="Type name" value="${esc(person.name || '')}"></label><label class="field"><span class="form-label">Address</span><input name="manualThookAddress" type="text" maxlength="500" placeholder="Type address" value="${esc(person.address || '')}"></label><button type="button" class="remove-manual" data-action="remove-manual" aria-label="Remove this manual Thookakaran">Remove</button></div>`;
  }

  function renderChartScreen() {
    const boxes = db.chart.boxes.slice().sort((a, b) => a.valayamNumber - b.valayamNumber);
    const boxCards = boxes.length ? boxes.map(renderBoxEditor).join('') : `<div class="panel chart-empty-state"><div class="empty-state"><div class="empty-symbol">▦</div><strong>No Valayam boxes yet</strong><p>Add a Valayam box. Every box contains exactly three entry positions, one shared Muri dropdown, and one grouped Kuttiye Eduth output cell. The trial supports Valayam numbers up to ${MAX_VALAYAM}.</p><button class="button button-primary" type="button" data-action="add-box">+ Add Valayam 1</button></div></div>`;
    const filled = boxes.reduce((sum, box) => sum + boxEntryCount(box), 0);
    return `
      <div class="page-heading"><div><p class="eyebrow-dark">CHART BUILDER · ${esc(db.chart.year || currentYear)}</p><h1>Vazhipadu Thookkam Chart</h1><p>Each Valayam is one box containing three entries. Choose one Muri per box, then enter a registered Vazhipadukaran number to load that person's saved details.</p></div><div class="heading-actions"><button class="button button-secondary" type="button" data-action="download-save">↓ Save backup</button><button class="button button-primary" type="button" data-action="print-chart">Print / Save as PDF</button></div></div>
      <div class="chart-toolbar"><p><strong>${boxes.length} / ${MAX_VALAYAM} Valayam boxes</strong><br><span id="filledEntryCount">${filled}</span> registered entry positions filled · “ഒറ്റ” is the default value in the എണ്ണം column.</p><button class="button button-primary" type="button" data-action="add-box" ${boxes.length >= MAX_VALAYAM ? 'disabled' : ''}>+ Add next Valayam</button></div>
      ${boxes.length ? `<div class="chart-summary-line"><span>Tip: save each box after entering its numbers. Print also saves valid edits currently visible on this screen.</span><span>Printed pages: <strong>${Math.ceil(boxes.length / 3)}</strong> · 3 Valayam boxes per page</span></div><div class="valayam-list">${boxCards}</div><div id="chartLivePreview">${renderLiveChartPreview(boxes)}</div><div class="form-actions" style="justify-content:flex-end;margin-top:20px"><button class="button button-primary" type="button" data-action="print-chart">Print / Save as PDF</button></div>` : boxCards}
      <datalist id="vazhiRegistrationOptions">${db.vazhipadukarans.map((person) => `<option value="${esc(person.registrationNo)}">${esc(person.name)}</option>`).join('')}</datalist>
      <div class="info-banner"><span>ⓘ</span><div>Registration numbers identify people in the database; the large Valayam number on the left is a separate chart position. The final PDF uses the six-column layout from the reference and prints up to three Valayam boxes per page.</div></div>`;
  }

  function renderBoxEditor(box) {
    const entryCards = [0, 1, 2].map((index) => {
      const entry = box.entries[index] || { registrationNo: '', quantity: DEFAULT_QUANTITY };
      const person = getVazhipadukaran(entry.vazhipadukaranId) || findVazhiByReg(entry.registrationNo);
      const thooks = personThookakarans(person);
      const preview = person ? `<strong>${esc(person.name)}</strong>${person.address ? ` · ${esc(person.address)}` : ''}<br><span class="cell-secondary">Thookakaran(s): ${esc(thooks.map((x) => x.name).join(', ') || 'Not yet assigned')}</span>` : (entry.registrationNo ? '<span class="warning-text">No matching Vazhipadukaran. Register the person first.</span>' : 'Enter an existing Vazhipadukaran registration number.');
      const previewClass = person ? '' : (entry.registrationNo ? ' warning' : ' muted');
      return `<div class="entry-editor"><div class="entry-editor-head"><span class="entry-index">${index + 1}</span><strong>Entry ${index + 1}</strong></div><div class="entry-fields"><label class="field"><span class="form-label">Vazhipadukaran registration number</span><input name="entryRegistrationNo${index}" type="text" maxlength="40" list="vazhiRegistrationOptions" data-resolve-entry="${index}" data-box-id="${esc(box.id)}" value="${esc(entry.registrationNo || person?.registrationNo || '')}" placeholder="e.g. 125" autocomplete="off"></label><label class="field"><span class="form-label">എണ്ണം · Quantity</span><input name="entryQuantity${index}" type="text" maxlength="35" value="${esc(entry.quantity ?? DEFAULT_QUANTITY)}" placeholder="ഒറ്റ"></label></div><div class="entry-resolution${previewClass}" data-preview-box="${esc(box.id)}" data-preview-entry="${index}">${preview}</div></div>`;
    }).join('');
    return `<section class="valayam-card"><div class="valayam-header"><div class="valayam-title"><span class="valayam-number">${esc(box.valayamNumber)}</span><div><h3>Valayam ${esc(box.valayamNumber)}</h3><p><span data-count-box="${esc(box.id)}">${boxEntryCount(box)}</span> of 3 entries linked</p></div></div><button type="button" class="small-action danger" data-action="delete-box" data-id="${esc(box.id)}">Remove box</button></div><form class="valayam-body" data-form="box" data-box-id="${esc(box.id)}" novalidate><div class="valayam-top-fields"><label class="field"><span class="form-label">മുറി · Muri for this whole box *</span><select name="muri" required><option value="">Choose one Muri</option>${MURIS.map((muri) => `<option value="${esc(muri)}"${box.muri === muri ? ' selected' : ''}>${esc(muri)}</option>`).join('')}</select><span class="field-hint">The same choice applies to all three entries in this Valayam.</span></label><div class="muri-shared-note">One Muri is shared by entries 1, 2 and 3. If you change this dropdown, the new Muri applies to this entire box only.</div></div>${entryCards}<p class="box-form-error" role="alert" data-box-error="${esc(box.id)}" hidden></p><div class="valayam-actions"><span class="cell-secondary">Kuttiye Eduth in the printout is combined for the box from the linked records.</span><button class="button button-primary" type="submit">Save Valayam ${esc(box.valayamNumber)}</button></div></form></section>`;
  }

  function draftChartBoxesFromScreen() {
    const draftBoxes = db.chart.boxes.map((box) => ({
      ...box,
      entries: (box.entries || []).map((entry) => ({ ...entry }))
    }));
    $$('.valayam-body').forEach((form) => {
      const box = draftBoxes.find((item) => item.id === form.dataset.boxId);
      if (!box) return;
      box.muri = String(form.elements.muri.value || '').trim();
      box.entries = [0, 1, 2].map((index) => {
        const registrationNo = String(form.elements[`entryRegistrationNo${index}`].value || '').trim();
        const person = registrationNo ? findVazhiByReg(registrationNo) : null;
        return {
          vazhipadukaranId: person?.id || null,
          registrationNo: person?.registrationNo || registrationNo,
          quantity: String(form.elements[`entryQuantity${index}`].value || '').trim() || DEFAULT_QUANTITY
        };
      });
    });
    return draftBoxes.sort((a, b) => a.valayamNumber - b.valayamNumber);
  }

  function renderLiveChartPreview(boxes = draftChartBoxesFromScreen()) {
    if (!boxes.length) return '';
    const rows = boxes.map((box) => [0, 1, 2].map((index) => {
      const entry = box.entries[index] || { vazhipadukaranId: null, registrationNo: '', quantity: DEFAULT_QUANTITY };
      const person = getVazhipadukaran(entry.vazhipadukaranId) || findVazhiByReg(entry.registrationNo);
      const vazhiCell = person
        ? `<span class="sub-number">${index + 1}.</span> ${esc(person.name)}${person.address ? `<br><span class="live-address">${nl2br(person.address)}</span>` : ''}`
        : (entry.registrationNo ? `<span class="preview-missing">Unmatched number: ${esc(entry.registrationNo)}</span>` : '');
      const thookCell = personThookakarans(person).map((item, itemIndex) => `<div><span class="sub-number">${itemIndex + 1}.</span> ${esc(item.name)}${item.address ? `<br><span class="live-address">${nl2br(item.address)}</span>` : ''}</div>`).join('<br>');
      const groupCells = index === 0 ? `<td class="live-valayam-number" rowspan="3">${esc(box.valayamNumber)}</td><td class="live-muri" rowspan="3">${esc(box.muri || '')}</td>` : '';
      const kuttiyeCell = index === 0 ? `<td class="live-kuttiye" rowspan="3">${boxKuttiye(box) ? 'അതെ' : ''}</td>` : '';
      return `<tr>${groupCells}<td class="live-vazhi">${vazhiCell}</td><td class="live-quantity">${esc(entry.quantity ?? DEFAULT_QUANTITY)}</td><td class="live-thook">${thookCell}</td>${kuttiyeCell}</tr>`;
    }).join('')).join('');
    return `<section class="panel live-preview-panel"><div class="panel-title-row"><div><h2>Traditional six-column chart preview</h2><p>This preview updates as you type. Print will commit valid entries shown here to the session database.</p></div><span class="badge">Live preview</span></div><div class="table-wrap"><table class="data-table live-chart-table"><thead><tr><th>വളയം</th><th>മുറി</th><th>വഴിപാടുകാർ</th><th>എണ്ണം</th><th>തൂക്കക്കാർ</th><th>കുട്ടിയെ എടുത്ത്</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  function updateLiveChartPreview() {
    const container = $('#chartLivePreview');
    const draftBoxes = draftChartBoxesFromScreen();
    if (container) container.innerHTML = renderLiveChartPreview(draftBoxes);
    const filled = draftBoxes.reduce((sum, box) => sum + box.entries.filter((entry) => getVazhipadukaran(entry.vazhipadukaranId)).length, 0);
    const filledCount = $('#filledEntryCount');
    if (filledCount) filledCount.textContent = String(filled);
    draftBoxes.forEach((box) => {
      const counter = $(`[data-count-box="${CSS.escape(box.id)}"]`);
      if (counter) counter.textContent = String(box.entries.filter((entry) => getVazhipadukaran(entry.vazhipadukaranId)).length);
    });
  }

  function commitPendingChartForms() {
    let firstInvalid = null;
    const updates = [];
    for (const form of $$('.valayam-body')) {
      const box = db.chart.boxes.find((item) => item.id === form.dataset.boxId);
      if (!box) continue;
      const muri = String(form.elements.muri.value || '').trim();
      const entries = [0, 1, 2].map((index) => ({
        registrationNo: String(form.elements[`entryRegistrationNo${index}`].value || '').trim(),
        quantity: String(form.elements[`entryQuantity${index}`].value || '').trim() || DEFAULT_QUANTITY
      }));
      let message = '';
      if (entries.some((entry) => entry.registrationNo) && !muri) message = `Choose a Muri for Valayam ${box.valayamNumber} before printing.`;
      for (const entry of entries) {
        if (entry.registrationNo && !findVazhiByReg(entry.registrationNo)) {
          message = `Valayam ${box.valayamNumber}: no Vazhipadukaran was found with registration number “${entry.registrationNo}”.`;
          break;
        }
      }
      const error = $(`[data-box-error="${CSS.escape(box.id)}"]`, form);
      if (message) {
        error.textContent = message;
        error.hidden = false;
        if (!firstInvalid) firstInvalid = form;
      } else {
        error.hidden = true;
        updates.push({ box, muri, entries: entries.map((entry) => {
          const person = entry.registrationNo ? findVazhiByReg(entry.registrationNo) : null;
          return { vazhipadukaranId: person?.id || null, registrationNo: person?.registrationNo || '', quantity: entry.quantity };
        }) });
      }
    }
    if (firstInvalid) {
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    let changed = false;
    updates.forEach(({ box, muri, entries }) => {
      if (box.muri !== muri || JSON.stringify(box.entries) !== JSON.stringify(entries)) changed = true;
      box.muri = muri;
      box.entries = entries;
    });
    if (changed) setDirty(true);
    renderApp();
    return true;
  }

  function bindCurrentForm() {
    const thookForm = $('#thookakaranForm');
    if (thookForm) thookForm.addEventListener('submit', saveThookakaranForm);
    const vazhiForm = $('#vazhipadukaranForm');
    if (vazhiForm) {
      vazhiForm.addEventListener('submit', saveVazhipadukaranForm);
      $('#addManualThookButton')?.addEventListener('click', () => {
        const list = $('#manualThookList');
        const index = $$('.manual-row', list).length;
        list.insertAdjacentHTML('beforeend', renderManualThookRow({ name: '', address: '' }, index));
      });
    }
    $$('.valayam-body').forEach((form) => {
      form.addEventListener('submit', saveValayamForm);
      form.addEventListener('input', updateLiveChartPreview);
      form.addEventListener('change', updateLiveChartPreview);
      $$('[data-resolve-entry]', form).forEach((input) => input.addEventListener('input', () => updateEntryPreview(input)));
    });
  }

  function formMessage(form, selector, message) {
    const target = $(selector, form);
    target.textContent = message;
    target.hidden = !message;
  }

  function saveThookakaranForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const registrationNo = String(values.get('registrationNo') || '').trim();
    const name = String(values.get('name') || '').trim();
    const address = String(values.get('address') || '').trim();
    let error = '';
    if (!registrationNo || !name || !address) error = 'Registration number, name and address are required.';
    const duplicate = db.thookakarans.find((person) => sameReg(person.registrationNo, registrationNo) && person.id !== editingThookakaranId);
    if (!error && duplicate) error = `Registration number “${registrationNo}” is already used by ${duplicate.name}.`;
    if (error) { formMessage(form, '#thookFormMessage', error); return; }
    if (editingThookakaranId) {
      const existing = getThookakaran(editingThookakaranId);
      if (!existing) { formMessage(form, '#thookFormMessage', 'This record could not be found. Refresh the register and try again.'); return; }
      Object.assign(existing, { registrationNo, name, address });
      showToast('Thookakaran record updated. Download the save file to keep it.');
    } else {
      db.thookakarans.push({ id: makeId('thook'), registrationNo, name, address, createdAt: nowISO() });
      showToast('Thookakaran registered. Download the save file to keep it.');
    }
    editingThookakaranId = null;
    setDirty(true);
    renderApp();
  }

  function saveVazhipadukaranForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const registrationNo = String(values.get('registrationNo') || '').trim();
    const name = String(values.get('name') || '').trim();
    const address = String(values.get('address') || '').trim();
    const kuttiyeEduth = form.elements.kuttiyeEduth.checked;
    const thookakaranIds = $$('input[name="thookakaranIds"]:checked', form).map((input) => input.value);
    const manualNames = $$('input[name="manualThookName"]', form);
    const manualAddresses = $$('input[name="manualThookAddress"]', form);
    const manualThookakarans = manualNames.map((input, index) => ({ name: input.value.trim(), address: manualAddresses[index]?.value.trim() || '' })).filter((entry) => entry.name);
    let error = '';
    if (!registrationNo || !name || !address) error = 'Registration number, name and address are required.';
    const duplicate = db.vazhipadukarans.find((person) => sameReg(person.registrationNo, registrationNo) && person.id !== editingVazhipadukaranId);
    if (!error && duplicate) error = `Registration number “${registrationNo}” is already used by ${duplicate.name}.`;
    const invalidAddressWithoutName = manualNames.some((input, index) => !input.value.trim() && manualAddresses[index]?.value.trim());
    if (!error && invalidAddressWithoutName) error = 'A manual Thookakaran address has been entered without a name. Add the name or clear that address field.';
    if (error) { formMessage(form, '#vazhiFormMessage', error); return; }
    const record = { registrationNo, name, address, kuttiyeEduth, thookakaranIds, manualThookakarans };
    if (editingVazhipadukaranId) {
      const existing = getVazhipadukaran(editingVazhipadukaranId);
      if (!existing) { formMessage(form, '#vazhiFormMessage', 'This record could not be found. Refresh the register and try again.'); return; }
      Object.assign(existing, record);
      showToast('Vazhipadukaran record updated. Download the save file to keep it.');
    } else {
      db.vazhipadukarans.push({ id: makeId('vazhi'), ...record, createdAt: nowISO() });
      showToast('Vazhipadukaran registered. Download the save file to keep it.');
    }
    editingVazhipadukaranId = null;
    setDirty(true);
    renderApp();
  }

  function updateEntryPreview(input) {
    const form = input.closest('form');
    const index = Number(input.dataset.resolveEntry);
    const preview = $(`[data-preview-box="${CSS.escape(input.dataset.boxId)}"][data-preview-entry="${index}"]`, form);
    if (!preview) return;
    const registrationNo = input.value.trim();
    if (!registrationNo) {
      preview.className = 'entry-resolution muted';
      preview.textContent = 'Enter an existing Vazhipadukaran registration number.';
      return;
    }
    const person = findVazhiByReg(registrationNo);
    if (!person) {
      preview.className = 'entry-resolution warning';
      preview.innerHTML = '<strong>No matching Vazhipadukaran.</strong> Register this person first, or check the registration number.';
      return;
    }
    const thooks = personThookakarans(person);
    preview.className = 'entry-resolution';
    preview.innerHTML = `<strong>${esc(person.name)}</strong>${person.address ? ` · ${esc(person.address)}` : ''}<br><span class="cell-secondary">Thookakaran(s): ${esc(thooks.map((x) => x.name).join(', ') || 'Not yet assigned')}</span>`;
  }

  function saveValayamForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const box = db.chart.boxes.find((entry) => entry.id === form.dataset.boxId);
    if (!box) return;
    const muri = String(form.elements.muri.value || '').trim();
    const entries = [0, 1, 2].map((index) => ({
      registrationNo: String(form.elements[`entryRegistrationNo${index}`].value || '').trim(),
      quantity: String(form.elements[`entryQuantity${index}`].value || '').trim() || DEFAULT_QUANTITY
    }));
    const filledEntries = entries.filter((entry) => entry.registrationNo);
    const errorTarget = $(`[data-box-error="${CSS.escape(box.id)}"]`, form);
    let error = '';
    if (filledEntries.length && !muri) error = 'Choose one Muri for this Valayam before saving its entries.';
    for (const entry of filledEntries) {
      const person = findVazhiByReg(entry.registrationNo);
      if (!person) { error = `No Vazhipadukaran was found with registration number “${entry.registrationNo}”. Register the person first or correct the number.`; break; }
    }
    if (error) { errorTarget.textContent = error; errorTarget.hidden = false; return; }
    box.muri = muri;
    box.entries = entries.map((entry) => {
      const person = entry.registrationNo ? findVazhiByReg(entry.registrationNo) : null;
      return { vazhipadukaranId: person?.id || null, registrationNo: person?.registrationNo || '', quantity: entry.quantity };
    });
    setDirty(true);
    renderApp();
    showToast(`Valayam ${box.valayamNumber} saved for this session. Download the database file to keep it.`);
  }

  function addValayamBox() {
    const used = new Set(db.chart.boxes.map((box) => Number(box.valayamNumber)));
    let nextNumber = 1;
    while (used.has(nextNumber) && nextNumber <= MAX_VALAYAM) nextNumber += 1;
    if (nextNumber > MAX_VALAYAM) { showToast(`This trial supports Valayam numbers 1 to ${MAX_VALAYAM}.`); return; }
    db.chart.boxes.push({
      id: makeId('box'),
      valayamNumber: nextNumber,
      muri: '',
      entries: [0, 1, 2].map(() => ({ vazhipadukaranId: null, registrationNo: '', quantity: DEFAULT_QUANTITY }))
    });
    db.chart.boxes.sort((a, b) => a.valayamNumber - b.valayamNumber);
    setDirty(true);
    renderApp();
    showToast(`Valayam ${nextNumber} added with three entry positions.`);
    const target = $(`.valayam-body[data-box-id="${CSS.escape(db.chart.boxes.find((box) => box.valayamNumber === nextNumber).id)}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function deleteValayamBox(id) {
    const box = db.chart.boxes.find((entry) => entry.id === id);
    if (!box) return;
    if (!window.confirm(`Remove Valayam ${box.valayamNumber} from the current chart? This does not delete anyone from the registers.`)) return;
    db.chart.boxes = db.chart.boxes.filter((entry) => entry.id !== id);
    setDirty(true);
    renderApp();
    showToast(`Valayam ${box.valayamNumber} removed. Other Valayam numbers were not changed.`);
  }

  function deleteThookakaran(id) {
    const person = getThookakaran(id);
    if (!person) return;
    const references = db.vazhipadukarans.filter((v) => (v.thookakaranIds || []).includes(id));
    if (references.length) {
      showToast(`Cannot delete ${person.name} yet; linked to ${references.length} Vazhipadukaran record(s). Remove the association first.`);
      return;
    }
    if (!window.confirm(`Delete Thookakaran ${person.registrationNo} · ${person.name}?`)) return;
    db.thookakarans = db.thookakarans.filter((entry) => entry.id !== id);
    setDirty(true);
    renderApp();
    showToast('Thookakaran deleted from this session. Download a save file to keep the change.');
  }

  function deleteVazhipadukaran(id) {
    const person = getVazhipadukaran(id);
    if (!person) return;
    const references = db.chart.boxes.filter((box) => box.entries.some((entry) => entry.vazhipadukaranId === id));
    if (references.length) {
      showToast(`Cannot delete ${person.name} yet; remove this record from the chart first.`);
      return;
    }
    if (!window.confirm(`Delete Vazhipadukaran ${person.registrationNo} · ${person.name}?`)) return;
    db.vazhipadukarans = db.vazhipadukarans.filter((entry) => entry.id !== id);
    setDirty(true);
    renderApp();
    showToast('Vazhipadukaran deleted from this session. Download a save file to keep the change.');
  }

  function buildThookCell(person) {
    const thooks = personThookakarans(person);
    if (!thooks.length) return '';
    return thooks.map((thook, index) => `<div><span class="sub-number">${index + 1}.</span> ${esc(thook.name)}${thook.address ? `<br>${nl2br(thook.address)}` : ''}</div>`).join('<br>');
  }

  function buildVazhiCell(person) {
    if (!person) return '';
    return `<span class="sub-number">${esc(person.registrationNo || '') ? '' : ''}</span>${esc(person.name)}${person.address ? `<br>${nl2br(person.address)}` : ''}`;
  }

  function renderPrintRoot() {
    if (!db) { printRoot.innerHTML = ''; return; }
    const boxes = db.chart.boxes.slice().sort((a, b) => a.valayamNumber - b.valayamNumber);
    if (!boxes.length) {
      printRoot.innerHTML = `<div class="print-empty">No Valayam boxes have been added yet.</div>`;
      return;
    }
    const pages = [];
    for (let i = 0; i < boxes.length; i += 3) pages.push(boxes.slice(i, i + 3));
    printRoot.innerHTML = pages.map((pageBoxes, pageIndex) => {
      const rows = pageBoxes.map((box) => {
        const entries = [0, 1, 2].map((index) => box.entries[index] || { vazhipadukaranId: null, quantity: DEFAULT_QUANTITY });
        const rowHtml = entries.map((entry, entryIndex) => {
          const person = getVazhipadukaran(entry.vazhipadukaranId) || findVazhiByReg(entry.registrationNo);
          const vazhiCell = person ? `<span class="sub-number">${entryIndex + 1}.</span> ${esc(person.name)}${person.address ? `<br>${nl2br(person.address)}` : ''}` : '';
          const thookCell = buildThookCell(person);
          const sharedCells = entryIndex === 0 ? `<td class="valayam-number-cell" rowspan="3">${esc(box.valayamNumber)}</td><td class="muri-cell" rowspan="3">${esc(box.muri || '')}</td>` : '';
          const kuttiyeCell = entryIndex === 0 ? `<td class="kuttiye-cell" rowspan="3">${boxKuttiye(box) ? 'അതെ' : ''}</td>` : '';
          return `<tr>${sharedCells}<td class="vazhi-cell">${vazhiCell}</td><td class="quantity-cell">${esc(entry.quantity ?? DEFAULT_QUANTITY)}</td><td class="thookam-cell">${thookCell}</td>${kuttiyeCell}</tr>`;
        }).join('');
        return rowHtml;
      }).join('');
      return `<section class="print-page"><header class="print-page-title"><h1>EZHAMKULAM DEVI TEMPLE</h1><p>Vazhipadu Thookkam · ${esc(db.chart.year || currentYear)}</p></header><table class="print-chart-table"><thead><tr><th class="valayam-number-cell">വളയം</th><th class="muri-cell">മുറി</th><th class="vazhi-cell">വഴിപാടുകാർ</th><th class="quantity-cell">എണ്ണം</th><th class="thookam-cell">തൂക്കക്കാർ</th><th class="kuttiye-cell">കുട്ടിയെ എടുത്ത്</th></tr></thead><tbody>${rows}</tbody></table><div class="print-footer">© ${esc(db.chart.year || currentYear)} Thookkam · Page ${pageIndex + 1}</div></section>`;
    }).join('');
  }

  // Event delegation for remove buttons inside the repeating manual Thookakaran rows.
  document.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-action="remove-manual"]');
    if (!remove) return;
    const list = $('#manualThookList');
    const rows = $$('.manual-row', list);
    if (rows.length <= 1) {
      const name = $('input[name="manualThookName"]', rows[0]);
      const address = $('input[name="manualThookAddress"]', rows[0]);
      if (name) name.value = '';
      if (address) address.value = '';
      return;
    }
    remove.closest('.manual-row')?.remove();
  });

  // Keep the print preview in sync before a user opens the browser's print dialog.
  window.addEventListener('beforeprint', renderPrintRoot);
})();
