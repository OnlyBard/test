(() => {
  'use strict';

  const SCHEMA = 'ezhamkulam-thookkam-save';
  const SCHEMA_VERSION = 2;
  const MAX_VALAYAM = 196;
  const DEFAULT_QUANTITY = 'ഒറ്റ';
  const KARAPURAMS = {
    thekke: ['ഏഴംകുളം തെക്ക്', 'അറുകാലിക്കൽ കിഴക്ക്', 'നെടുമൺ', 'പറക്കോട് വടക്ക്', 'മങ്ങാട്'],
    vadakke: ['ഏഴംകുളം വടക്ക്', 'അറുകാലിക്കൽ പടിഞ്ഞാറ്', 'പറക്കോട് തെക്ക്', 'പറക്കോട് ഇടയിൽ', 'ചെറുകുന്നത്ത്']
  };
  // This interleaved order matches the numbered Muri slots (Mangadu is slot 9).
  const MURI_CYCLE = [
    'ഏഴംകുളം തെക്ക്', 'ഏഴംകുളം വടക്ക്', 'അറുകാലിക്കൽ കിഴക്ക്', 'അറുകാലിക്കൽ പടിഞ്ഞാറ്',
    'നെടുമൺ', 'പറക്കോട് തെക്ക്', 'പറക്കോട് വടക്ക്', 'പറക്കോട് ഇടയിൽ', 'മങ്ങാട്', 'ചെറുകുന്നത്ത്'
  ];
  const MURIS = [...KARAPURAMS.thekke, ...KARAPURAMS.vadakke];
  const QUANTITY_LABELS = { 1: 'ഒറ്റ', 2: 'ഇരട്ട', 3: 'മൂന്ന്' };

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
  let activeNarukideelMuri = 'ഏഴംകുളം വടക്ക്';
  let aiKarapuram = 'thekke';
  let aiBaseMuri = 'ഏഴംകുളം തെക്ക്';
  let aiSourceMuri = 'അറുകാലിക്കൽ കിഴക്ക്';
  let aiProposal = null;

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
      narukideel: { results: [], slotFallbacks: {} },
      chart: { year: currentYear, boxes: [] }
    };
  }

  function normalizeDatabase(input) {
    if (!input || typeof input !== 'object') throw new Error('The file does not contain a database object.');
    if (input.schema !== SCHEMA) throw new Error('This does not look like an Ezhamkulam Thookkam save file.');
    if (![1, SCHEMA_VERSION].includes(Number(input.schemaVersion))) throw new Error(`Unsupported save-file version (${input.schemaVersion ?? 'unknown'}). This trial supports versions 1 and ${SCHEMA_VERSION}.`);
    if (!Array.isArray(input.thookakarans) || !Array.isArray(input.vazhipadukarans) || !input.chart || !Array.isArray(input.chart.boxes)) {
      throw new Error('The save file is missing one or more required registers.');
    }
    const normalized = structuredClone(input);
    normalized.schemaVersion = SCHEMA_VERSION;
    normalized.meta = normalized.meta && typeof normalized.meta === 'object' ? normalized.meta : {};
    normalized.meta.templeName ||= 'Ezhamkulam Devi Temple';
    normalized.meta.festivalYear ||= currentYear;
    normalized.chart.year ||= normalized.meta.festivalYear || currentYear;
    normalized.chart.boxes = normalized.chart.boxes.map((box) => {
      if (!box || typeof box !== 'object') throw new Error('The save file contains an invalid Valayam box.');
      const valayamNumber = Number(box.valayamNumber);
      if (!Number.isInteger(valayamNumber) || valayamNumber < 1 || valayamNumber > MAX_VALAYAM) {
        throw new Error(`Valayam number “${box.valayamNumber ?? ''}” is invalid. This trial supports Valayams 1 to ${MAX_VALAYAM}.`);
      }
      return {
        id: String(box.id || makeId('box')),
        valayamNumber,
        muri: String(box.muri || ''),
        entries: [0, 1, 2].map((index) => {
          const entry = Array.isArray(box.entries) ? box.entries[index] || {} : {};
          return {
            vazhipadukaranId: entry.vazhipadukaranId || null,
            registrationNo: String(entry.registrationNo || ''),
            quantity: String(entry.quantity ?? DEFAULT_QUANTITY),
            muri: MURIS.includes(entry.muri) ? entry.muri : '',
            drawNumber: Number.isInteger(Number(entry.drawNumber)) && Number(entry.drawNumber) > 0 ? Number(entry.drawNumber) : null,
            narukideelEntryKey: String(entry.narukideelEntryKey || '')
          };
        })
      };
    });
    normalized.thookakarans = normalized.thookakarans.map((person) => ({
      id: String(person.id || makeId('thook')),
      registrationNo: String(person.registrationNo || ''),
      name: String(person.name || ''),
      address: String(person.address || ''),
      createdAt: person.createdAt || nowISO()
    }));
    normalized.vazhipadukarans = normalized.vazhipadukarans.map((person) => {
      if (!person || typeof person !== 'object') throw new Error('The save file contains an invalid Vazhipadukaran record.');
      const count = Number(person.thookamCount || 1);
      if (!Number.isInteger(count) || count < 1 || count > 3) throw new Error(`Invalid Thookam count for registration “${person.registrationNo || 'unknown'}”. Use 1, 2 or 3.`);
      const oldKutti = Boolean(person.kuttiyeEduth);
      const selectedKutti = Number(person.kuttiyeEduthThookam || (oldKutti ? 1 : 0));
      if (selectedKutti && (!Number.isInteger(selectedKutti) || selectedKutti < 1 || selectedKutti > count)) throw new Error(`Kuttiye Eduth selection is invalid for registration “${person.registrationNo || 'unknown'}”.`);
      return {
        id: String(person.id || makeId('vazhi')),
        registrationNo: String(person.registrationNo || ''),
        name: String(person.name || ''),
        address: String(person.address || ''),
        muri: MURIS.includes(person.muri) ? person.muri : '',
        thookamCount: count,
        kuttiyeEduthThookam: selectedKutti >= 1 && selectedKutti <= count ? selectedKutti : 0,
        kuttiyeEduth: selectedKutti >= 1 && selectedKutti <= count ? true : oldKutti,
        thookakaranIds: Array.isArray(person.thookakaranIds) ? person.thookakaranIds.map(String) : [],
        manualThookakarans: Array.isArray(person.manualThookakarans) ? person.manualThookakarans.map((x) => ({ name: String(x.name || ''), address: String(x.address || '') })).filter((x) => x.name.trim()) : [],
        createdAt: person.createdAt || nowISO()
      };
    });
    const rawNarukideel = normalized.narukideel && typeof normalized.narukideel === 'object' ? normalized.narukideel : {};
    if (rawNarukideel.results != null && !Array.isArray(rawNarukideel.results)) throw new Error('Narukideel results must be a list in the save file.');
    normalized.narukideel = {
      results: Array.isArray(rawNarukideel.results) ? rawNarukideel.results.map((result) => {
        if (!result || typeof result !== 'object' || !MURIS.includes(result.muri)) throw new Error('The save file contains a Narukideel result with an invalid Muri.');
        if (result.entries != null && !Array.isArray(result.entries)) throw new Error(`The ${result.muri} Narukideel entries must be a list.`);
        return {
          muri: result.muri,
          updatedAt: result.updatedAt || nowISO(),
          entries: Array.isArray(result.entries) ? result.entries.map((entry) => {
            if (!entry || typeof entry !== 'object') throw new Error(`The ${result.muri} Narukideel result contains an invalid entry.`);
            const person = normalized.vazhipadukarans.find((item) => item.id === entry.vazhipadukaranId) || normalized.vazhipadukarans.find((item) => sameReg(item.registrationNo, entry.registrationNo));
            return { key: String(entry.key || `${result.muri}::${person?.id || entry.registrationNo || ''}`), vazhipadukaranId: person?.id || null, registrationNo: String(person?.registrationNo || entry.registrationNo || ''), drawNumber: Number(entry.drawNumber), thookamCount: Math.max(1, Math.min(3, Number(entry.thookamCount || person?.thookamCount || 1))) };
          }) : []
        };
      }) : [],
      slotFallbacks: rawNarukideel.slotFallbacks && typeof rawNarukideel.slotFallbacks === 'object' ? rawNarukideel.slotFallbacks : {}
    };

    // Treat an uploaded JSON as a database, not as trusted application code.
    // Reject ambiguous IDs/numbers before allowing someone to edit or print records.
    function assertUniqueIdsAndRegistrationNumbers(items, label) {
      const ids = new Set();
      const registrationNumbers = new Map();
      for (const item of items) {
        if (ids.has(item.id)) throw new Error(`The save file contains duplicate internal IDs in the ${label} register.`);
        ids.add(item.id);
        const registrationNo = String(item.registrationNo || '').trim();
        if (!registrationNo) throw new Error(`Every ${label} record in the save file must have a registration number.`);
        const key = registrationNo.toLocaleLowerCase();
        if (registrationNumbers.has(key)) throw new Error(`Duplicate ${label} registration number “${registrationNo}” in the save file. Correct the duplicate before importing.`);
        registrationNumbers.set(key, true);
      }
    }
    assertUniqueIdsAndRegistrationNumbers(normalized.thookakarans, 'Thookakaran');
    assertUniqueIdsAndRegistrationNumbers(normalized.vazhipadukarans, 'Vazhipadukaran');
    const knownThookakaranIds = new Set(normalized.thookakarans.map((person) => person.id));
    for (const person of normalized.vazhipadukarans) {
      if (person.thookakaranIds.some((id) => !knownThookakaranIds.has(id))) throw new Error(`Vazhipadukaran ${person.registrationNo} references a Thookakaran that is missing from the register.`);
    }

    if (normalized.chart.boxes.length > MAX_VALAYAM) throw new Error(`The save file contains more than ${MAX_VALAYAM} Valayam boxes.`);
    const seenBoxIds = new Set();
    const seenValayamNumbers = new Set();
    for (const box of normalized.chart.boxes) {
      if (seenBoxIds.has(box.id)) throw new Error('The save file contains duplicate internal IDs for Valayam boxes.');
      if (seenValayamNumbers.has(box.valayamNumber)) throw new Error(`Valayam ${box.valayamNumber} appears more than once in the save file.`);
      seenBoxIds.add(box.id);
      seenValayamNumbers.add(box.valayamNumber);
    }

    const resultsByMuri = new Set();
    const resultKeys = new Set();
    const resultPeople = new Set();
    for (const result of normalized.narukideel.results) {
      if (resultsByMuri.has(result.muri)) throw new Error(`The save file contains more than one Narukideel result for ${result.muri}.`);
      resultsByMuri.add(result.muri);
      const drawNumbers = new Set();
      for (const entry of result.entries) {
        const person = normalized.vazhipadukarans.find((item) => item.id === entry.vazhipadukaranId);
        if (!Number.isInteger(entry.drawNumber) || entry.drawNumber < 1) throw new Error(`The ${result.muri} Narukideel result contains a number that is not a positive whole number.`);
        if (!person) throw new Error(`A Narukideel entry in ${result.muri} does not match a registered Vazhipadukaran.`);
        if (person.muri && person.muri !== result.muri) throw new Error(`${person.registrationNo} is registered under ${person.muri}, but appears in the ${result.muri} Narukideel result.`);
        if (drawNumbers.has(entry.drawNumber)) throw new Error(`Narukideel number ${entry.drawNumber} is duplicated in ${result.muri}.`);
        if (resultKeys.has(entry.key)) throw new Error(`The save file contains a repeated Narukideel result key for ${person.registrationNo}.`);
        if (resultPeople.has(person.id)) throw new Error(`${person.registrationNo} appears in more than one Muri's Narukideel results.`);
        drawNumbers.add(entry.drawNumber);
        resultKeys.add(entry.key);
        resultPeople.add(person.id);
        entry.thookamCount = person.thookamCount || entry.thookamCount;
      }
    }

    const chartPeople = new Map();
    const chartKeys = new Set();
    for (const box of normalized.chart.boxes) {
      const inBox = new Set();
      for (const entry of box.entries) {
        if (!entry.vazhipadukaranId && !entry.registrationNo && !entry.narukideelEntryKey) continue;
        const byId = normalized.vazhipadukarans.find((item) => item.id === entry.vazhipadukaranId) || null;
        const byReg = entry.registrationNo ? normalized.vazhipadukarans.find((item) => sameReg(item.registrationNo, entry.registrationNo)) || null : null;
        if (byId && byReg && byId.id !== byReg.id) throw new Error(`Valayam ${box.valayamNumber} contains mismatched Vazhipadukaran ID and registration number.`);
        const person = byId || byReg;
        if (!person) throw new Error(`Valayam ${box.valayamNumber} refers to a Vazhipadukaran that is not in the register.`);
        if (inBox.has(person.id)) throw new Error(`Valayam ${box.valayamNumber} lists ${person.registrationNo} more than once.`);
        if (chartPeople.has(person.id)) throw new Error(`${person.registrationNo} is assigned to both Valayam ${chartPeople.get(person.id)} and Valayam ${box.valayamNumber}.`);
        if (entry.narukideelEntryKey) {
          const resultEntry = normalized.narukideel.results.flatMap((result) => result.entries).find((candidate) => candidate.key === entry.narukideelEntryKey);
          if (!resultEntry || resultEntry.vazhipadukaranId !== person.id || (entry.drawNumber && resultEntry.drawNumber !== entry.drawNumber)) throw new Error(`Valayam ${box.valayamNumber} contains an invalid Narukideel link for ${person.registrationNo}.`);
          if (chartKeys.has(entry.narukideelEntryKey)) throw new Error(`A Narukideel lot is linked to more than one Valayam in the save file.`);
          chartKeys.add(entry.narukideelEntryKey);
        }
        inBox.add(person.id);
        chartPeople.set(person.id, box.valayamNumber);
        entry.vazhipadukaranId = person.id;
        entry.registrationNo = person.registrationNo;
        entry.quantity = quantityLabel(person.thookamCount || 1);
        entry.muri = person.muri || entry.muri;
      }
    }
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
      return Boolean(person?.kuttiyeEduth || Number(person?.kuttiyeEduthThookam || 0) > 0);
    });
  }

  function karapuramForMuri(muri) {
    if (KARAPURAMS.thekke.includes(muri)) return 'thekke';
    if (KARAPURAMS.vadakke.includes(muri)) return 'vadakke';
    return '';
  }

  function getBoxMuriSummary(box) {
    const found = [];
    (box.entries || []).forEach((entry) => {
      const person = getVazhipadukaran(entry.vazhipadukaranId) || findVazhiByReg(entry.registrationNo);
      const muri = MURIS.includes(entry.muri) ? entry.muri : person?.muri;
      if (muri && !found.includes(muri)) found.push(muri);
    });
    found.sort((a, b) => MURI_CYCLE.indexOf(a) - MURI_CYCLE.indexOf(b));
    return found.length ? found.join(' / ') : String(box.muri || '');
  }

  function getNextValayamNumber() {
    const used = new Set((db?.chart?.boxes || []).map((box) => Number(box.valayamNumber)));
    let next = 1;
    while (used.has(next) && next <= MAX_VALAYAM) next += 1;
    return next;
  }

  function getNextSequentialValayamNumber() {
    // Keep the chart sequence contiguous if the user removes a draft/confirmed
    // Valayam for correction. Never skip the first unoccupied number.
    return getNextValayamNumber();
  }

  function getUsedNarukideelKeys() {
    const used = new Set();
    (db?.chart?.boxes || []).forEach((box) => (box.entries || []).forEach((entry) => { if (entry.narukideelEntryKey) used.add(entry.narukideelEntryKey); }));
    return used;
  }

  function getNarukideelResult(muri) {
    return db?.narukideel?.results?.find((result) => result.muri === muri) || null;
  }

  function getRemainingNarukideelEntries(muri) {
    const result = getNarukideelResult(muri);
    if (!result) return [];
    const used = getUsedNarukideelKeys();
    return result.entries.filter((entry) => !used.has(entry.key)).map((entry) => {
      const person = getVazhipadukaran(entry.vazhipadukaranId) || findVazhiByReg(entry.registrationNo);
      return { ...entry, person, muri, count: Math.max(1, Math.min(3, Number(person?.thookamCount || entry.thookamCount || 1))) };
    }).filter((entry) => entry.person).sort((a, b) => a.drawNumber - b.drawNumber || a.registrationNo.localeCompare(b.registrationNo, undefined, { numeric: true }));
  }

  function allRemainingForMuri(muri) {
    return getRemainingNarukideelEntries(muri);
  }

  function getScheduledBaseMuri(valayamNumber) {
    const slot = ((Number(valayamNumber) - 1) % 10) + 1;
    const nominal = MURI_CYCLE[slot - 1];
    const nominalKara = karapuramForMuri(nominal);
    // A missing result is not evidence that a Muri is exhausted. Only a saved result with no unallocated entries may trigger the traditional fallback.
    if (!getNarukideelResult(nominal) || allRemainingForMuri(nominal).length) return { muri: nominal, nominal, slot, fallback: false, kara: nominalKara };
    const order = KARAPURAMS[nominalKara] || [];
    if (!order.length) return { muri: nominal, nominal, slot, fallback: false, kara: nominalKara };
    const fallbackIndexStored = Number(db.narukideel.slotFallbacks[String(slot)]);
    let startIndex = Number.isInteger(fallbackIndexStored) && fallbackIndexStored >= 0 && fallbackIndexStored < order.length
      ? fallbackIndexStored
      : (order.indexOf(nominal) + 1) % order.length;
    for (let offset = 0; offset < order.length; offset += 1) {
      const candidate = order[(startIndex + offset) % order.length];
      if (allRemainingForMuri(candidate).length) return { muri: candidate, nominal, slot, fallback: true, kara: nominalKara, fallbackIndex: (startIndex + offset) % order.length };
    }
    return { muri: nominal, nominal, slot, fallback: true, kara: nominalKara, fallbackIndex: startIndex };
  }

  function combinationsSummingToThree(candidates, anchorKey = '') {
    const results = [];
    const sorted = candidates.slice().sort((a, b) => {
      if (a.muri !== b.muri) return MURI_CYCLE.indexOf(a.muri) - MURI_CYCLE.indexOf(b.muri);
      return a.drawNumber - b.drawNumber;
    });
    function walk(start, chosen, sum) {
      if (sum === 3) {
        if (!anchorKey || chosen.some((entry) => entry.key === anchorKey)) results.push(chosen.slice());
        return;
      }
      if (sum > 3 || chosen.length >= 3) return;
      for (let i = start; i < sorted.length; i += 1) {
        const item = sorted[i];
        if (chosen.some((entry) => entry.key === item.key)) continue;
        walk(i + 1, [...chosen, item], sum + item.count);
      }
    }
    walk(0, [], 0);
    results.sort((a, b) => {
      const aOther = a.filter((x) => x.muri !== a[0]?.muri).length;
      const bOther = b.filter((x) => x.muri !== b[0]?.muri).length;
      if (aOther !== bOther) return aOther - bOther;
      const aMax = Math.max(...a.map((x) => x.drawNumber));
      const bMax = Math.max(...b.map((x) => x.drawNumber));
      if (aMax !== bMax) return aMax - bMax;
      return a.length - b.length;
    });
    return results[0] || null;
  }

  function buildValayamProposal(baseMuri, sourceMuri = '') {
    const baseEntries = allRemainingForMuri(baseMuri);
    if (!baseEntries.length) return { error: `No unallocated Narukideel entries remain in ${baseMuri}. The expected Muri may have finished; use the suggested next Muri in the same Karapuram.` };
    const anchor = baseEntries[0];
    const baseOnly = combinationsSummingToThree(baseEntries, anchor.key);
    if (baseOnly) return { entries: baseOnly, baseMuri, sourceMuri: '', usedSource: false };
    if (!sourceMuri || sourceMuri === baseMuri) return { error: `The next available entry in ${baseMuri} has ${anchor.count} Thookam(s), and the remaining entries from that Muri cannot complete a total of 3. Select a source Muri from the same Karapuram to complete this Valayam.` };
    const kara = karapuramForMuri(baseMuri);
    if (karapuramForMuri(sourceMuri) !== kara) return { error: 'The source Muri must belong to the same Karapuram as the scheduled Muri.' };
    const sourceEntries = allRemainingForMuri(sourceMuri);
    if (!sourceEntries.length) return { error: `No unallocated Narukideel entries remain in source Muri ${sourceMuri}. Choose another Muri in the same Karapuram.` };
    const mixed = combinationsSummingToThree([...baseEntries, ...sourceEntries], anchor.key);
    if (!mixed) return { error: `No combination totals exactly 3 using ${baseMuri} and ${sourceMuri}. Choose another source Muri, or check the entered Narukideel numbers and Thookam counts.` };
    const usedSource = mixed.some((entry) => entry.muri === sourceMuri);
    if (!usedSource) return { error: `A valid group was not found using ${sourceMuri}. Try another source Muri.` };
    return { entries: mixed, baseMuri, sourceMuri, usedSource: true };
  }

  function quantityLabel(count) { return QUANTITY_LABELS[Math.max(1, Math.min(3, Number(count) || 1))]; }

  function renderKuttiyeOptions(count, selected) {
    return Array.from({ length: count }, (_, index) => {
      const number = index + 1;
      return `<label class="check-row thookam-kutti-option"><input type="checkbox" name="kuttiyeEduthThookam" value="${number}"${Number(selected) === number ? ' checked' : ''}><span><strong>Thookam ${number} — കുട്ടിയെ എടുത്ത്</strong><small>Only one Thookam can be selected for this Vazhipadukaran.</small></span></label>`;
    }).join('');
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
    if (kind === 'quick-add-thookakaran') quickAddThookakaranFromVazhi();
    if (kind === 'save-narukideel') saveNarukideelForm();
    if (kind === 'generate-ai-proposal') generateAiProposal();
    if (kind === 'confirm-ai-valayam') confirmAiValayam();
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
    else if (activeSection === 'narukideel') mainView.innerHTML = renderNarukideelScreen();
    else if (activeSection === 'ai') mainView.innerHTML = renderAiScreen();
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
        <button type="button" class="menu-card" data-nav="narukideel"><span class="menu-card-icon">№</span><h3>Narukideel Result</h3><p>Choose a Muri and type each registered Vazhipadukaran's drawn number. No upload is needed.</p><span class="card-link">Enter result <span>→</span></span></button>
        <button type="button" class="menu-card" data-nav="ai"><span class="menu-card-icon">✦</span><h3>AI Valayam Assistant</h3><p>Find groups totalling exactly three Thookams, choose a same-Karapuram source Muri when needed, and confirm each Valayam.</p><span class="card-link">Build Valayams <span>→</span></span></button>
        <button type="button" class="menu-card" data-nav="chart"><span class="menu-card-icon">▦</span><h3>Chart</h3><p>Review confirmed Valayams in the original six-column layout and print the chart.</p><span class="card-link">View chart <span>→</span></span></button>
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
      return `<tr><td><span class="cell-primary">${esc(person.registrationNo)}</span></td><td><span class="cell-primary">${esc(person.name)}</span></td><td>${nl2br(person.address)}</td><td>${esc(person.muri || 'Muri not selected')}</td><td>${person.thookamCount || 1}</td><td>${person.kuttiyeEduthThookam ? `<span class="badge">Thookam ${person.kuttiyeEduthThookam} · അതെ</span>` : '<span class="cell-secondary">—</span>'}</td><td>${esc(thooks || 'Not assigned')}</td><td><div class="table-actions"><button type="button" class="small-action" data-action="edit-vazhi" data-id="${esc(person.id)}">Edit</button><button type="button" class="small-action danger" data-action="delete-vazhi" data-id="${esc(person.id)}" ${inChart ? 'title="Remove this record from the chart first"' : ''}>Delete</button></div></td></tr>`;
    }).join('') : '';
    return `
      <div class="page-heading"><div><p class="eyebrow-dark">REGISTER 02</p><h1>Add Vazhipadukaran</h1><p>Save the person's Muri and Thookam count once. The Narukideel screen will let you enter their drawn number for that Muri.</p></div><div class="heading-actions"><button class="button button-secondary" type="button" data-action="download-save">↓ Save backup</button></div></div>
      <section class="panel"><div class="panel-title-row"><div><h2>${formTitle}</h2><p>Choose the Muri, record how many Thookams this person has, and select Kuttiye Eduth for the specific Thookam if applicable.</p></div>${current ? '<span class="badge warn">Editing</span>' : ''}</div>
        <form id="vazhipadukaranForm" data-form="vazhipadukaran" novalidate>
          <div class="form-grid">
            <label class="field"><span class="form-label">Registration number *</span><input id="vazhiRegNo" name="registrationNo" type="text" maxlength="40" placeholder="e.g. 125" value="${esc(current?.registrationNo || '')}" required><span class="field-hint">Manually assigned and unique within this register.</span></label>
            <label class="field"><span class="form-label">Full name *</span><input id="vazhiName" name="name" type="text" maxlength="140" placeholder="Enter full name" value="${esc(current?.name || '')}" required></label>
            <label class="field full-width"><span class="form-label">Address *</span><textarea name="address" maxlength="500" placeholder="House name, place, locality" required>${esc(current?.address || '')}</textarea></label>
            <label class="field"><span class="form-label">മുറി · Muri *</span><select name="muri" required><option value="">Choose Muri</option>${MURI_CYCLE.map((m) => `<option value="${esc(m)}"${current?.muri === m ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
            <label class="field"><span class="form-label">Number of Thookams *</span><select name="thookamCount" id="thookamCountSelect" required>${[1,2,3].map((count) => `<option value="${count}"${Number(current?.thookamCount || 1) === count ? ' selected' : ''}>${count} · ${esc(quantityLabel(count))}</option>`).join('')}</select></label>
            <div class="full-width"><div class="divider-label" style="margin-top:4px">KUTTIYE EDUTH · ASK PER THOOKAM</div><div id="kuttiyeOptions" class="kuttiye-options">${renderKuttiyeOptions(Number(current?.thookamCount || 1), Number(current?.kuttiyeEduthThookam || (current?.kuttiyeEduth ? 1 : 0)))}</div><p class="field-hint">Choose no box if it does not apply. Only one Thookam per Vazhipadukaran can be marked.</p></div>
          </div>
          <div class="divider-label">SELECT FROM REGISTERED THOOKAKARANS</div>
          <div id="registeredThookChoices" class="link-picker">${registeredChoices || '<p class="cell-secondary">No registered Thookakarans yet. Add them below or from the Thookakaran register.</p>'}</div>
          <details class="quick-thook-panel"><summary>+ Register a new Thookakaran directly here</summary><div class="form-grid quick-thook-grid"><label class="field"><span class="form-label">Thookakaran registration number *</span><input id="quickThookRegNo" maxlength="40" placeholder="e.g. TK-003"></label><label class="field"><span class="form-label">Full name *</span><input id="quickThookName" maxlength="140" placeholder="Thookakaran name"></label><label class="field full-width"><span class="form-label">Address *</span><input id="quickThookAddress" maxlength="500" placeholder="House name and place"></label><div class="full-width"><button class="button button-secondary" type="button" data-action="quick-add-thookakaran">Save new Thookakaran and select</button></div></div></details>
          <div class="divider-label">OR TYPE THOOKAKARAN DETAILS MANUALLY</div>
          <div id="manualThookList" class="manual-list">${manualRows}</div>
          <div class="form-actions"><button type="button" class="button button-secondary" id="addManualThookButton">+ Add another manual Thookakaran</button></div>
          <div id="vazhiFormMessage" class="form-message error-message" role="alert" hidden></div>
          <div class="form-actions"><button class="button button-primary" type="submit">${current ? 'Update Vazhipadukaran' : 'Save Vazhipadukaran'}</button>${current ? '<button class="button button-quiet" type="button" data-action="cancel-vazhi-edit">Cancel edit</button>' : '<button class="button button-quiet" type="reset">Clear form</button>'}</div>
        </form>
      </section>
      <section class="panel"><div class="panel-title-row"><div><h2>Vazhipadukaran register <span class="cell-secondary">(${db.vazhipadukarans.length})</span></h2><p>One person may be associated with more than one Thookakaran.</p></div></div>
        ${rows ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Reg. number</th><th>Name</th><th>Address</th><th>Muri</th><th>Thookams</th><th>Kuttiye Eduth</th><th>Thookakaran(s)</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty-state"><div class="empty-symbol">♧</div><strong>No Vazhipadukarans registered yet</strong><p>Add the first person using the form above.</p></div>`}
      </section>`;
  }

  function renderNarukideelScreen() {
    const muri = MURIS.includes(activeNarukideelMuri) ? activeNarukideelMuri : MURI_CYCLE[0];
    const people = db.vazhipadukarans.filter((person) => person.muri === muri).slice().sort((a, b) => a.registrationNo.localeCompare(b.registrationNo, undefined, { numeric: true }));
    const saved = getNarukideelResult(muri);
    const currentNumbers = new Map((saved?.entries || []).map((entry) => [entry.vazhipadukaranId, entry.drawNumber]));
    const statusPill = saved ? `<span class="badge">${saved.entries.length} number(s) saved</span>` : '<span class="badge warn">Not entered yet</span>';
    const rows = people.map((person) => {
      const drawn = currentNumbers.get(person.id) || '';
      return `<tr><td><strong>${esc(person.registrationNo)}</strong><div class="cell-secondary">${esc(person.name)}</div></td><td>${esc(person.address || '—')}</td><td>${person.thookamCount || 1} · ${esc(quantityLabel(person.thookamCount || 1))}</td><td><label class="draw-number-field"><span class="sr-only">Narukideel number for ${esc(person.name)}</span><input name="draw_${esc(person.id)}" type="number" min="1" step="1" inputmode="numeric" placeholder="Number received" value="${esc(drawn)}" data-draw-person="${esc(person.id)}"></label></td></tr>`;
    }).join('');
    const resultCards = MURI_CYCLE.map((item) => {
      const result = getNarukideelResult(item);
      const remaining = getRemainingNarukideelEntries(item).length;
      return `<div class="result-muri-card ${item === muri ? 'selected' : ''}"><span class="result-muri-name">${esc(item)}</span><strong>${result ? result.entries.length : 0}</strong><small>${result ? `${remaining} unallocated` : 'No result saved'}</small></div>`;
    }).join('');
    return `
      <div class="page-heading"><div><p class="eyebrow-dark">STAGE 03 · MANUAL RESULT ENTRY</p><h1>Narukideel Result</h1><p>Choose a Muri, then type the Narukideel number received by each registered Vazhipadukaran in that Muri. These entered numbers are the source of truth; no result file upload is required.</p></div><div class="heading-actions"><button class="button button-secondary" type="button" data-action="download-save">↓ Save backup</button></div></div>
      <section class="panel"><div class="panel-title-row"><div><h2>1. Select Muri</h2><p>The Muri is taken from each person's registration. Results are stored separately for every Muri.</p></div>${statusPill}</div>
        <label class="field"><span class="form-label">മുറി · Muri *</span><select id="narukideelMuriSelect">${MURI_CYCLE.map((item) => `<option value="${esc(item)}"${muri === item ? ' selected' : ''}>${esc(item)} · ${karapuramForMuri(item) === 'thekke' ? 'തെക്കേ കരപ്പുറം' : 'വടക്കേ കരപ്പുറം'}</option>`).join('')}</select></label>
        <div class="result-status-grid">${resultCards}</div>
      </section>
      <section class="panel"><div class="panel-title-row"><div><h2>2. Enter the drawn numbers</h2><p>Registration number and Muri come from the register. Only type the number that this person received in Narukideel.</p></div><span class="muri-pill">${esc(muri)}</span></div>
        ${people.length ? `<form id="narukideelForm" data-muri="${esc(muri)}"><div class="table-wrap"><table class="data-table narukideel-table"><thead><tr><th>Registration / Vazhipadukaran</th><th>Address</th><th>Thookam count</th><th>Narukideel number received</th></tr></thead><tbody>${rows}</tbody></table></div><div class="narukideel-form-footer"><span class="cell-secondary">Leave the field blank if the draw number has not been entered yet. Duplicate draw numbers in the same Muri will be rejected.</span><button class="button button-primary" type="submit">Save ${esc(muri)} result</button></div><p id="narukideelError" class="form-message error-message" role="alert" hidden></p></form>` : `<div class="empty-state"><div class="empty-symbol">№</div><strong>No Vazhipadukaran registered under ${esc(muri)}</strong><p>Go to Add Vazhipadukaran and select this Muri first. The person will then appear here automatically.</p><button class="button button-secondary" type="button" data-nav="vazhipadukaran">Register Vazhipadukaran</button></div>`}
      </section>
      <section class="panel"><div class="panel-title-row"><div><h2>3. Continue to AI Valayam</h2><p>Once the result has numbers, AI checks available lots and proposes one Valayam at a time. Each proposal must be confirmed separately.</p></div></div><button class="button button-primary" type="button" data-nav="ai">Open AI Valayam Assistant →</button></section>`;
  }

  function saveNarukideelForm() {
    const form = $('#narukideelForm');
    if (!form || !db) return;
    const muri = form.dataset.muri;
    const people = db.vazhipadukarans.filter((person) => person.muri === muri);
    const entries = [];
    const drawNumbers = new Map();
    let error = '';
    for (const person of people) {
      const input = $(`[name="draw_${CSS.escape(person.id)}"]`, form);
      const raw = String(input?.value || '').trim();
      if (!raw) continue;
      const drawNumber = Number(raw);
      if (!Number.isInteger(drawNumber) || drawNumber < 1) { error = `Enter a positive whole number for ${person.name}.`; break; }
      if (drawNumbers.has(drawNumber)) { error = `Narukideel number ${drawNumber} is assigned to both ${drawNumbers.get(drawNumber)} and ${person.name} in ${muri}. Each number must be unique within this Muri.`; break; }
      drawNumbers.set(drawNumber, person.name);
      entries.push({ key: `${muri}::${person.id}`, vazhipadukaranId: person.id, registrationNo: person.registrationNo, drawNumber, thookamCount: person.thookamCount || 1 });
    }
    const errorBox = $('#narukideelError');
    if (error) {
      errorBox.textContent = error;
      errorBox.hidden = false;
      return;
    }
    const existing = getNarukideelResult(muri);
    if (existing && existing.entries.some((entry) => getUsedNarukideelKeys().has(entry.key) && !entries.some((next) => next.key === entry.key && next.drawNumber === entry.drawNumber))) {
      errorBox.textContent = 'Some records from this result have already been used in a confirmed Valayam. Remove or revise those Valayams before changing their Narukideel numbers.';
      errorBox.hidden = false;
      return;
    }
    if (!entries.length) {
      if (!existing) {
        errorBox.textContent = 'Enter at least one Narukideel number before saving this Muri result.';
        errorBox.hidden = false;
        return;
      }
      db.narukideel.results = db.narukideel.results.filter((result) => result.muri !== muri);
      setDirty(true);
      aiProposal = null;
      showToast(`${muri}: the unused Narukideel result was cleared. Re-enter the numbers after correcting the register.`);
      renderApp();
      return;
    }
    const result = { muri, updatedAt: nowISO(), entries: entries.sort((a, b) => a.drawNumber - b.drawNumber) };
    const index = db.narukideel.results.findIndex((entry) => entry.muri === muri);
    if (index >= 0) db.narukideel.results[index] = result;
    else db.narukideel.results.push(result);
    setDirty(true);
    aiProposal = null;
    showToast(`${muri}: ${entries.length} Narukideel number(s) saved. Download the save file to keep them.`);
    renderApp();
  }

  function defaultSourceMuri(baseMuri) {
    const kara = karapuramForMuri(baseMuri);
    const order = KARAPURAMS[kara] || [];
    const baseIndex = order.indexOf(baseMuri);
    for (let offset = 1; offset < order.length; offset += 1) {
      const candidate = order[(baseIndex + offset) % order.length];
      if (getRemainingNarukideelEntries(candidate).length) return candidate;
    }
    return order.find((candidate) => candidate !== baseMuri) || '';
  }

  function renderAiScreen() {
    const valayamNumber = getNextSequentialValayamNumber();
    const scheduled = getScheduledBaseMuri(valayamNumber);
    aiKarapuram = scheduled.kara || 'thekke';
    aiBaseMuri = scheduled.muri;
    if (!aiSourceMuri || karapuramForMuri(aiSourceMuri) !== aiKarapuram || aiSourceMuri === aiBaseMuri) aiSourceMuri = defaultSourceMuri(aiBaseMuri);
    const baseEntries = getRemainingNarukideelEntries(aiBaseMuri);
    const sourceEntries = aiSourceMuri ? getRemainingNarukideelEntries(aiSourceMuri) : [];
    const resultSummary = (KARAPURAMS[aiKarapuram] || []).map((muri) => {
      const result = getNarukideelResult(muri);
      const remaining = getRemainingNarukideelEntries(muri).length;
      return `<div class="result-muri-card ${muri === aiBaseMuri ? 'selected' : ''}"><span class="result-muri-name">${esc(muri)}</span><strong>${result ? result.entries.length : 0}</strong><small>${result ? `${remaining} unallocated` : 'Result not entered'}</small></div>`;
    }).join('');
    const proposalMarkup = aiProposal ? (aiProposal.error
      ? `<div class="inline-error"><strong>Cannot propose a valid Valayam yet</strong><p>${esc(aiProposal.error)}</p></div>`
      : `<div class="ai-proposal-card"><div class="ai-proposal-heading"><div><p class="eyebrow-dark">PROPOSAL · NOT YET CONFIRMED</p><h3>Valayam ${valayamNumber}</h3></div><span class="badge warn">Pending confirmation</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Draw no.</th><th>Muri</th><th>Vazhipadukaran</th><th>Thookams</th></tr></thead><tbody>${aiProposal.entries.map((entry) => `<tr><td><strong>${entry.drawNumber}</strong></td><td>${esc(entry.muri)}</td><td><strong>${esc(entry.person.name)}</strong><div class="cell-secondary">${esc(entry.registrationNo)} · ${esc(entry.person.address || '')}</div></td><td>${esc(quantityLabel(entry.count))}</td></tr>`).join('')}</tbody></table></div><div class="ai-total-line"><div><strong>Total: 3 Thookams</strong><span>Sorted by Muri order, then Narukideel number.</span></div><span class="badge">3 / 3</span></div><div class="ai-confirm-note"><strong>Confirm is the commit point.</strong><p>Until you confirm, this proposal does not enter the final chart and none of its lots are marked used.</p></div><div class="form-actions"><button class="button button-secondary" type="button" data-action="generate-ai-proposal">Regenerate proposal</button><button class="button button-primary" type="button" data-action="confirm-ai-valayam">✓ Confirm Valayam ${valayamNumber}</button></div></div>`)
      : `<div class="empty-state"><div class="empty-symbol">✦</div><strong>No proposal yet</strong><p>Check the scheduled Muri and source Muri, then ask the AI assistant to find a combination that totals exactly three Thookams.</p><button class="button button-primary" type="button" data-action="generate-ai-proposal">Generate Valayam ${valayamNumber} proposal</button></div>`;
    return `
      <div class="page-heading"><div><p class="eyebrow-dark">STAGE 04 · REVIEW BEFORE COMMIT</p><h1>AI Valayam Assistant</h1><p>Build the Valayam sequence from the manually entered Narukideel results. The assistant never invents draw numbers, and each Valayam needs its own confirmation.</p></div><div class="heading-actions"><button class="button button-secondary" type="button" data-action="download-save">↓ Save backup</button></div></div>
      <section class="panel"><div class="panel-title-row"><div><h2>Valayam ${valayamNumber} · Scheduled Muri</h2><p>The position cycles through the temple's numbered ten-Muri order. If the designated Muri is exhausted, the next available Muri in the same Karapuram can take over that slot.</p></div><span class="badge">${scheduled.slot} / 10 slot</span></div>
        <div class="scheduled-muri-banner"><div><span class="form-label">Karapuram</span><strong>${aiKarapuram === 'thekke' ? 'തെക്കേ കരപ്പുറം' : 'വടക്കേ കരപ്പുറം'}</strong></div><div><span class="form-label">Scheduled / active Muri</span><strong>${esc(aiBaseMuri)}</strong></div><div><span class="form-label">Numbered slot</span><strong>${scheduled.slot} / 10</strong></div></div><p class="field-hint">The scheduled slot is ${esc(scheduled.nominal)}${scheduled.fallback ? `, but that Muri is exhausted. The next available Muri in the same Karapuram is ${esc(scheduled.muri)}.` : '.'} The user chooses only the supplementary source Muri below.</p>
        <div class="result-status-grid">${resultSummary}</div>
      </section>
      <section class="panel"><div class="panel-title-row"><div><h2>Balancing source</h2><p>If the active Muri cannot complete a Valayam alone, choose the Muri that may contribute the remaining Thookams. The dropdown only shows the same Karapuram.</p></div></div>
        <label class="field"><span class="form-label">Take remaining Thookam(s) from</span><select id="aiSourceMuriSelect"><option value="">Choose source Muri</option>${(KARAPURAMS[aiKarapuram] || []).filter((muri) => muri !== aiBaseMuri).map((muri) => `<option value="${esc(muri)}"${aiSourceMuri === muri ? ' selected' : ''}>${esc(muri)} · ${getRemainingNarukideelEntries(muri).length} available</option>`).join('')}</select></label>
        <div class="ai-candidates-grid"><div class="candidate-card"><span class="cell-secondary">ACTIVE MURI</span><strong>${esc(aiBaseMuri)}</strong><p>${baseEntries.length} unused Narukideel entry/entries</p>${baseEntries.slice(0,4).map((entry) => `<div class="candidate-line"><span>#${entry.drawNumber} · ${esc(entry.person.name)}</span><span>${entry.count} Thookam</span></div>`).join('') || '<p>No unallocated result entries saved.</p>'}</div><div class="candidate-card"><span class="cell-secondary">SOURCE MURI</span><strong>${esc(aiSourceMuri || 'Not selected')}</strong><p>${sourceEntries.length} unused Narukideel entry/entries</p>${sourceEntries.slice(0,4).map((entry) => `<div class="candidate-line"><span>#${entry.drawNumber} · ${esc(entry.person.name)}</span><span>${entry.count} Thookam</span></div>`).join('') || '<p>Select a source Muri and enter its Narukideel result if needed.</p>'}</div></div>
        <div class="info-banner"><span>ⓘ</span><div><strong>Balancing rule:</strong> every Valayam must total exactly 3 Thookams. A lot with 2 and a lot with 3 cannot be grouped together; the assistant searches for a complementary 1 from the same Muri first, then from the selected same-Karapuram source Muri.</div></div>
      </section>
      <section class="panel"><div class="panel-title-row"><div><h2>Propose and confirm</h2><p>Preview the exact people and draw numbers before committing this Valayam.</p></div></div>${proposalMarkup}</section>
      <div class="info-banner"><span>ⓘ</span><div>Trial logic: the system uses the entered result records and stored Thookam counts. The traditional slot mapping is built into the prototype and should be checked against the temple's complete procedure before operational use.</div></div>`;
  }

  function generateAiProposal() {
    if (!db) return;
    const valayamNumber = getNextSequentialValayamNumber();
    const scheduled = getScheduledBaseMuri(valayamNumber);
    if (scheduled.kara && aiKarapuram !== scheduled.kara && allRemainingForMuri(scheduled.muri).length) {
      aiKarapuram = scheduled.kara;
      aiBaseMuri = scheduled.muri;
    }
    if (karapuramForMuri(aiBaseMuri) !== aiKarapuram) aiBaseMuri = (KARAPURAMS[aiKarapuram] || [])[0];
    const sourceMuri = aiSourceMuri;
    aiProposal = buildValayamProposal(aiBaseMuri, sourceMuri);
    renderApp();
    if (aiProposal.error) showToast('No complete Valayam proposal yet. Check available Muri results and source choice.');
    else showToast(`Valayam ${valayamNumber} proposed. Review the people and numbers before confirming.`);
  }

  function confirmAiValayam() {
    if (!db || !aiProposal || aiProposal.error) { showToast('Generate a valid proposal before confirming.'); return; }
    const valayamNumber = getNextSequentialValayamNumber();
    if (valayamNumber > MAX_VALAYAM) { showToast(`This trial supports Valayam numbers 1 to ${MAX_VALAYAM}.`); return; }
    const used = getUsedNarukideelKeys();
    if (aiProposal.entries.some((entry) => used.has(entry.key))) { aiProposal = null; renderApp(); showToast('One or more proposed lots have already been used. Generate a new proposal.'); return; }
    // Re-read each proposed lot from the live result before committing. Registration edits can
    // otherwise leave a stale count or Muri attached to a proposal that was already displayed.
    const liveEntries = aiProposal.entries.map((proposed) => {
      const live = getRemainingNarukideelEntries(proposed.muri).find((entry) => entry.key === proposed.key);
      if (!live || live.drawNumber !== proposed.drawNumber || live.count !== proposed.count || live.person.id !== proposed.person.id) return null;
      return live;
    });
    if (liveEntries.some((entry) => !entry)) {
      aiProposal = null;
      renderApp();
      showToast('The Narukideel result or registration changed after this proposal. Generate and review a fresh proposal.');
      return;
    }
    const alreadyCharted = liveEntries.find((entry) => db.chart.boxes.some((box) => (box.entries || []).some((existing) => existing.vazhipadukaranId === entry.person.id || (existing.registrationNo && sameReg(existing.registrationNo, entry.person.registrationNo)))));
    if (alreadyCharted) {
      aiProposal = null;
      renderApp();
      showToast(`Vazhipadukaran ${alreadyCharted.person.registrationNo} is already assigned to a Valayam. Review the chart before continuing.`);
      return;
    }
    const total = liveEntries.reduce((sum, entry) => sum + entry.count, 0);
    if (total !== 3) { aiProposal = null; renderApp(); showToast('This proposal does not total exactly three Thookams and cannot be confirmed. Generate a new proposal.'); return; }
    const ordered = liveEntries.slice().sort((a, b) => MURI_CYCLE.indexOf(a.muri) - MURI_CYCLE.indexOf(b.muri) || a.drawNumber - b.drawNumber);
    const entries = [0, 1, 2].map((i) => {
      const item = ordered[i];
      return item ? {
        vazhipadukaranId: item.person.id,
        registrationNo: item.person.registrationNo,
        quantity: quantityLabel(item.count),
        muri: item.muri,
        drawNumber: item.drawNumber,
        narukideelEntryKey: item.key
      } : { vazhipadukaranId: null, registrationNo: '', quantity: '', muri: '', drawNumber: null, narukideelEntryKey: '' };
    });
    db.chart.boxes.push({ id: makeId('box'), valayamNumber, muri: [...new Set(ordered.map((entry) => entry.muri))].sort((a, b) => MURI_CYCLE.indexOf(a) - MURI_CYCLE.indexOf(b)).join(' / '), entries });
    db.chart.boxes.sort((a, b) => a.valayamNumber - b.valayamNumber);
    // When an exhausted slot is reassigned, advance only that slot's same-Karapuram fallback pointer.
    const scheduled = getScheduledBaseMuri(valayamNumber);
    if (scheduled.fallback || aiBaseMuri !== scheduled.nominal) {
      const karaOrder = KARAPURAMS[karapuramForMuri(aiBaseMuri)] || [];
      const currentIndex = karaOrder.indexOf(aiBaseMuri);
      if (currentIndex >= 0) db.narukideel.slotFallbacks[String(scheduled.slot)] = (currentIndex + 1) % karaOrder.length;
    }
    setDirty(true);
    aiProposal = null;
    aiBaseMuri = getScheduledBaseMuri(getNextSequentialValayamNumber()).muri;
    aiKarapuram = karapuramForMuri(aiBaseMuri) || aiKarapuram;
    aiSourceMuri = defaultSourceMuri(aiBaseMuri);
    activeSection = 'ai';
    renderApp();
    showToast(`Valayam ${valayamNumber} confirmed and added to the chart. Review the next Valayam separately.`);
  }

  function quickAddThookakaranFromVazhi() {
    const form = $('#vazhipadukaranForm');
    if (!form) return;
    const registrationNo = String($('#quickThookRegNo')?.value || '').trim();
    const name = String($('#quickThookName')?.value || '').trim();
    const address = String($('#quickThookAddress')?.value || '').trim();
    const duplicate = db.thookakarans.find((person) => sameReg(person.registrationNo, registrationNo));
    if (!registrationNo || !name || !address) { showToast('Enter the new Thookakaran number, name and address first.'); return; }
    if (duplicate) { showToast(`Registration number ${registrationNo} already belongs to ${duplicate.name}.`); return; }
    const person = { id: makeId('thook'), registrationNo, name, address, createdAt: nowISO() };
    db.thookakarans.push(person);
    const choices = $('#registeredThookChoices');
    if (choices) {
      const label = document.createElement('label');
      label.className = 'link-option';
      label.innerHTML = `<input type="checkbox" name="thookakaranIds" value="${esc(person.id)}" checked><span><strong>${esc(person.registrationNo)} · ${esc(person.name)}</strong><small>${esc(person.address)}</small></span>`;
      choices.prepend(label);
    }
    $('#quickThookRegNo').value = '';
    $('#quickThookName').value = '';
    $('#quickThookAddress').value = '';
    setDirty(true);
    showToast(`Thookakaran ${registrationNo} registered and selected. Save the Vazhipadukaran form to link them.`);
  }

  function renderManualThookRow(person, index) {
    return `<div class="manual-row"><label class="field"><span class="form-label">Manual Thookakaran name</span><input name="manualThookName" type="text" maxlength="140" placeholder="Type name" value="${esc(person.name || '')}"></label><label class="field"><span class="form-label">Address</span><input name="manualThookAddress" type="text" maxlength="500" placeholder="Type address" value="${esc(person.address || '')}"></label><button type="button" class="remove-manual" data-action="remove-manual" aria-label="Remove this manual Thookakaran">Remove</button></div>`;
  }

  function renderChartScreen() {
    const boxes = db.chart.boxes.slice().sort((a, b) => a.valayamNumber - b.valayamNumber);
    const boxCards = boxes.length ? boxes.map(renderBoxEditor).join('') : `<div class="panel chart-empty-state"><div class="empty-state"><div class="empty-symbol">▦</div><strong>No Valayam boxes yet</strong><p>Add a Valayam box. Every Valayam has three Thookams in total. The Muri cell is derived from the linked people and may contain more than one Muri. The trial supports Valayam numbers up to ${MAX_VALAYAM}.</p><button class="button button-primary" type="button" data-action="add-box">+ Add Valayam 1</button></div></div>`;
    const filled = boxes.reduce((sum, box) => sum + boxEntryCount(box), 0);
    return `
      <div class="page-heading"><div><p class="eyebrow-dark">CHART BUILDER · ${esc(db.chart.year || currentYear)}</p><h1>Vazhipadu Thookkam Chart</h1><p>Each Valayam is one box containing three entries. Each person keeps their registered Muri. AI-confirmed Valayams can combine Muris from the same Karapuram; manual entries are retrieved by registration number.</p></div><div class="heading-actions"><button class="button button-secondary" type="button" data-action="download-save">↓ Save backup</button><button class="button button-primary" type="button" data-action="print-chart">Print / Save as PDF</button></div></div>
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
      const displayQuantity = person ? quantityLabel(person.thookamCount || 1) : (entry.quantity ?? DEFAULT_QUANTITY);
      return `<div class="entry-editor"><div class="entry-editor-head"><span class="entry-index">${index + 1}</span><strong>Entry ${index + 1}</strong></div><div class="entry-fields"><label class="field"><span class="form-label">Vazhipadukaran registration number</span><input name="entryRegistrationNo${index}" type="text" maxlength="40" list="vazhiRegistrationOptions" data-resolve-entry="${index}" data-box-id="${esc(box.id)}" value="${esc(entry.registrationNo || person?.registrationNo || '')}" placeholder="e.g. 125" autocomplete="off"></label><label class="field"><span class="form-label">എണ്ണം · Quantity (from register)</span><input name="entryQuantity${index}" type="text" maxlength="35" value="${esc(displayQuantity)}" placeholder="ഒറ്റ" readonly aria-readonly="true" title="Automatically comes from this Vazhipadukaran's registered Thookam count"></label></div><div class="entry-resolution${previewClass}" data-preview-box="${esc(box.id)}" data-preview-entry="${index}">${preview}</div></div>`;
    }).join('');
    return `<section class="valayam-card"><div class="valayam-header"><div class="valayam-title"><span class="valayam-number">${esc(box.valayamNumber)}</span><div><h3>Valayam ${esc(box.valayamNumber)}</h3><p><span data-count-box="${esc(box.id)}">${boxEntryCount(box)}</span> of 3 entry rows linked</p></div></div><button type="button" class="small-action danger" data-action="delete-box" data-id="${esc(box.id)}">Remove box</button></div><form class="valayam-body" data-form="box" data-box-id="${esc(box.id)}" novalidate><div class="valayam-top-fields"><div class="muri-readout"><span class="form-label">മുറി · Muri(s) for this Valayam</span><strong data-box-muri="${esc(box.id)}">${esc(getBoxMuriSummary(box) || 'Derived from each registered Vazhipadukaran')}</strong><span class="field-hint">A Valayam may include more than one Muri. The chart derives this cell from the people in the confirmed group.</span></div><div class="muri-shared-note">The AI proposal follows the Valayam sequence and Karapuram rules. The traditional Muri column can show combined Muris.</div></div>${entryCards}<p class="box-form-error" role="alert" data-box-error="${esc(box.id)}" hidden></p><div class="valayam-actions"><span class="cell-secondary">Kuttiye Eduth in print is shown in the traditional grouped cell.</span><button class="button button-primary" type="submit">Save Valayam ${esc(box.valayamNumber)}</button></div></form></section>`;
  }

  function draftChartBoxesFromScreen() {
    const draftBoxes = db.chart.boxes.map((box) => ({ ...box, entries: (box.entries || []).map((entry) => ({ ...entry })) }));
    $$('.valayam-body').forEach((form) => {
      const box = draftBoxes.find((item) => item.id === form.dataset.boxId);
      if (!box) return;
      box.entries = [0, 1, 2].map((index) => {
        const registrationNo = String(form.elements[`entryRegistrationNo${index}`].value || '').trim();
        const person = registrationNo ? findVazhiByReg(registrationNo) : null;
        return {
          vazhipadukaranId: person?.id || null,
          registrationNo: person?.registrationNo || registrationNo,
          quantity: person ? quantityLabel(person.thookamCount || 1) : (String(form.elements[`entryQuantity${index}`].value || '').trim() || DEFAULT_QUANTITY),
          muri: person?.muri || box.entries[index]?.muri || ''
        };
      });
      box.muri = [...new Set(box.entries.map((entry) => entry.muri).filter(Boolean))].sort((a, b) => MURI_CYCLE.indexOf(a) - MURI_CYCLE.indexOf(b)).join(' / ');
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
      const groupCells = index === 0 ? `<td class="live-valayam-number" rowspan="3">${esc(box.valayamNumber)}</td><td class="live-muri" rowspan="3">${esc(getBoxMuriSummary(box))}</td>` : '';
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
    // Prevent a registered Vazhipadukaran from being counted in more than one
    // Valayam, including edits that have not yet been saved to the database.
    const assignedPersonToValayam = new Map();
    for (const form of $$('.valayam-body')) {
      const box = db.chart.boxes.find((item) => item.id === form.dataset.boxId);
      if (!box) continue;
      const entries = [0, 1, 2].map((index) => ({
        registrationNo: String(form.elements[`entryRegistrationNo${index}`].value || '').trim(),
        quantity: String(form.elements[`entryQuantity${index}`].value || '').trim() || DEFAULT_QUANTITY
      }));
      let message = '';
      const resolved = [];
      const filled = entries.filter((entry) => entry.registrationNo);
      for (const entry of filled) {
        const person = findVazhiByReg(entry.registrationNo);
        if (!person) {
          message = `Valayam ${box.valayamNumber}: no Vazhipadukaran was found with registration number “${entry.registrationNo}”.`;
          break;
        }
        if (resolved.some((item) => item.id === person.id)) {
          message = `Valayam ${box.valayamNumber}: Vazhipadukaran ${person.registrationNo} is listed more than once.`;
          break;
        }
        if (assignedPersonToValayam.has(person.id)) {
          message = `Valayam ${box.valayamNumber}: Vazhipadukaran ${person.registrationNo} is already assigned to Valayam ${assignedPersonToValayam.get(person.id)}.`;
          break;
        }
        resolved.push(person);
      }
      if (!message && !filled.length) message = `Valayam ${box.valayamNumber} is empty. Fill it or remove the box before printing.`;
      const totalThookams = resolved.reduce((sum, person) => sum + Math.max(1, Math.min(3, Number(person.thookamCount || 1))), 0);
      if (!message && totalThookams !== 3) message = `Valayam ${box.valayamNumber} must total exactly 3 Thookams; the registered entries currently total ${totalThookams}.`;
      const error = $(`[data-box-error="${CSS.escape(box.id)}"]`, form);
      if (message) {
        error.textContent = message;
        error.hidden = false;
        if (!firstInvalid) firstInvalid = form;
      } else {
        error.hidden = true;
        resolved.forEach((person) => assignedPersonToValayam.set(person.id, box.valayamNumber));
        updates.push({ box, entries: entries.map((entry, index) => {
          const person = entry.registrationNo ? findVazhiByReg(entry.registrationNo) : null;
          const oldEntry = box.entries[index] || {};
          const keepNarukideel = person && person.id === oldEntry.vazhipadukaranId;
          return { vazhipadukaranId: person?.id || null, registrationNo: person?.registrationNo || '', quantity: person ? quantityLabel(person.thookamCount || 1) : entry.quantity, muri: person?.muri || '', drawNumber: keepNarukideel ? oldEntry.drawNumber : null, narukideelEntryKey: keepNarukideel ? oldEntry.narukideelEntryKey : '' };
        }) });
      }
    }
    if (firstInvalid) {
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    let changed = false;
    updates.forEach(({ box, entries }) => {
      const muri = [...new Set(entries.map((entry) => entry.muri).filter(Boolean))].sort((a, b) => MURI_CYCLE.indexOf(a) - MURI_CYCLE.indexOf(b)).join(' / ');
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
      $('#thookamCountSelect')?.addEventListener('change', () => {
        const count = Math.max(1, Math.min(3, Number($('#thookamCountSelect').value || 1)));
        const checked = Number($('input[name="kuttiyeEduthThookam"]:checked', vazhiForm)?.value || 0);
        $('#kuttiyeOptions').innerHTML = renderKuttiyeOptions(count, checked <= count ? checked : 0);
        $$('input[name="kuttiyeEduthThookam"]', vazhiForm).forEach((checkbox) => checkbox.addEventListener('change', () => {
          if (checkbox.checked) $$('input[name="kuttiyeEduthThookam"]', vazhiForm).forEach((other) => { if (other !== checkbox) other.checked = false; });
        }));
      });
      $$('input[name="kuttiyeEduthThookam"]', vazhiForm).forEach((checkbox) => checkbox.addEventListener('change', () => {
        if (checkbox.checked) $$('input[name="kuttiyeEduthThookam"]', vazhiForm).forEach((other) => { if (other !== checkbox) other.checked = false; });
      }));
      $('#addManualThookButton')?.addEventListener('click', () => {
        const list = $('#manualThookList');
        const index = $$('.manual-row', list).length;
        list.insertAdjacentHTML('beforeend', renderManualThookRow({ name: '', address: '' }, index));
      });
    }
    const narukideelForm = $('#narukideelForm');
    if (narukideelForm) narukideelForm.addEventListener('submit', (event) => { event.preventDefault(); saveNarukideelForm(); });
    $('#narukideelMuriSelect')?.addEventListener('change', (event) => { activeNarukideelMuri = event.target.value; renderApp(); });
    $('#aiSourceMuriSelect')?.addEventListener('change', (event) => { aiSourceMuri = event.target.value; aiProposal = null; renderApp(); });
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
    const muri = String(values.get('muri') || '').trim();
    const thookamCount = Math.max(1, Math.min(3, Number(values.get('thookamCount') || 1)));
    const kuttiyeEduthThookam = Number($('input[name="kuttiyeEduthThookam"]:checked', form)?.value || 0);
    const kuttiyeEduth = kuttiyeEduthThookam > 0;
    const thookakaranIds = $$('input[name="thookakaranIds"]:checked', form).map((input) => input.value);
    const manualNames = $$('input[name="manualThookName"]', form);
    const manualAddresses = $$('input[name="manualThookAddress"]', form);
    const manualThookakarans = manualNames.map((input, index) => ({ name: input.value.trim(), address: manualAddresses[index]?.value.trim() || '' })).filter((entry) => entry.name);
    let error = '';
    if (!registrationNo || !name || !address || !muri) error = 'Registration number, name, address and Muri are required.';
    if (kuttiyeEduthThookam > thookamCount) error = 'Choose Kuttiye Eduth only for one of the available Thookams.';
    const duplicate = db.vazhipadukarans.find((person) => sameReg(person.registrationNo, registrationNo) && person.id !== editingVazhipadukaranId);
    if (!error && duplicate) error = `Registration number “${registrationNo}” is already used by ${duplicate.name}.`;
    if (!error && editingVazhipadukaranId) {
      const existingRecord = getVazhipadukaran(editingVazhipadukaranId);
      if (existingRecord && (existingRecord.muri !== muri || Number(existingRecord.thookamCount || 1) !== thookamCount)) {
        const hasNarukideelReference = db.narukideel.results.some((result) => result.entries.some((entry) => entry.vazhipadukaranId === existingRecord.id || sameReg(entry.registrationNo, existingRecord.registrationNo)));
        const hasChartReference = db.chart.boxes.some((box) => box.entries.some((entry) => entry.vazhipadukaranId === existingRecord.id || (sameReg(entry.registrationNo, existingRecord.registrationNo) && Boolean(entry.narukideelEntryKey))));
        if (hasNarukideelReference || hasChartReference) {
          error = 'Muri or Thookam count cannot be changed while this record has Narukideel results or chart allocations. Clear its draw result and remove its chart allocation first, then edit this record.';
        }
      }
    }
    const invalidAddressWithoutName = manualNames.some((input, index) => !input.value.trim() && manualAddresses[index]?.value.trim());
    if (!error && invalidAddressWithoutName) error = 'A manual Thookakaran address has been entered without a name. Add the name or clear that address field.';
    if (error) { formMessage(form, '#vazhiFormMessage', error); return; }
    const record = { registrationNo, name, address, muri, thookamCount, kuttiyeEduthThookam, kuttiyeEduth, thookakaranIds, manualThookakarans };
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
    aiProposal = null;
    setDirty(true);
    renderApp();
  }

  function updateEntryPreview(input) {
    const form = input.closest('form');
    const index = Number(input.dataset.resolveEntry);
    const preview = $(`[data-preview-box="${CSS.escape(input.dataset.boxId)}"][data-preview-entry="${index}"]`, form);
    if (!preview) return;
    const registrationNo = input.value.trim();
    const quantityInput = form.elements[`entryQuantity${index}`];
    if (!registrationNo) {
      if (quantityInput) quantityInput.value = DEFAULT_QUANTITY;
      preview.className = 'entry-resolution muted';
      preview.textContent = 'Enter an existing Vazhipadukaran registration number.';
      return;
    }
    const person = findVazhiByReg(registrationNo);
    if (!person) {
      if (quantityInput) quantityInput.value = DEFAULT_QUANTITY;
      preview.className = 'entry-resolution warning';
      preview.innerHTML = '<strong>No matching Vazhipadukaran.</strong> Register this person first, or check the registration number.';
      return;
    }
    if (quantityInput) quantityInput.value = quantityLabel(person.thookamCount || 1);
    const thooks = personThookakarans(person);
    preview.className = 'entry-resolution';
    preview.innerHTML = `<strong>${esc(person.name)}</strong>${person.address ? ` · ${esc(person.address)}` : ''}<br><span class="cell-secondary">Thookakaran(s): ${esc(thooks.map((x) => x.name).join(', ') || 'Not yet assigned')}</span>`;
  }

  function saveValayamForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const box = db.chart.boxes.find((entry) => entry.id === form.dataset.boxId);
    if (!box) return;
    const entries = [0, 1, 2].map((index) => ({
      registrationNo: String(form.elements[`entryRegistrationNo${index}`].value || '').trim(),
      quantity: String(form.elements[`entryQuantity${index}`].value || '').trim() || DEFAULT_QUANTITY
    }));
    const filledEntries = entries.filter((entry) => entry.registrationNo);
    const errorTarget = $(`[data-box-error="${CSS.escape(box.id)}"]`, form);
    let error = '';
    const resolved = [];
    for (const entry of filledEntries) {
      const person = findVazhiByReg(entry.registrationNo);
      if (!person) { error = `No Vazhipadukaran was found with registration number “${entry.registrationNo}”. Register the person first or correct the number.`; break; }
      if (resolved.some((item) => item.id === person.id)) { error = `Vazhipadukaran ${person.registrationNo} is listed more than once in Valayam ${box.valayamNumber}. Use the person's registered Thookam count in one entry.`; break; }
      const existingBox = db.chart.boxes.find((otherBox) => otherBox.id !== box.id && (otherBox.entries || []).some((otherEntry) => otherEntry.vazhipadukaranId === person.id || (otherEntry.registrationNo && sameReg(otherEntry.registrationNo, person.registrationNo))));
      if (existingBox) { error = `Vazhipadukaran ${person.registrationNo} is already assigned to Valayam ${existingBox.valayamNumber}. A person can only be used once in the chart.`; break; }
      resolved.push(person);
    }
    if (!error && !filledEntries.length) error = `Valayam ${box.valayamNumber} is empty. Enter the people for this Valayam or remove the box.`;
    const totalThookams = resolved.reduce((sum, person) => sum + Math.max(1, Math.min(3, Number(person.thookamCount || 1))), 0);
    if (!error && totalThookams !== 3) error = `Valayam ${box.valayamNumber} must total exactly 3 Thookams. The registered entries currently total ${totalThookams}.`;
    if (error) { errorTarget.textContent = error; errorTarget.hidden = false; return; }
    box.entries = entries.map((entry, index) => {
      const person = entry.registrationNo ? findVazhiByReg(entry.registrationNo) : null;
      const oldEntry = box.entries[index] || {};
      const keepNarukideel = person && person.id === oldEntry.vazhipadukaranId;
      return {
        vazhipadukaranId: person?.id || null,
        registrationNo: person?.registrationNo || '',
        quantity: person ? quantityLabel(person.thookamCount || 1) : entry.quantity,
        muri: person?.muri || '',
        drawNumber: keepNarukideel ? oldEntry.drawNumber : null,
        narukideelEntryKey: keepNarukideel ? oldEntry.narukideelEntryKey : ''
      };
    });
    box.muri = [...new Set(box.entries.map((entry) => entry.muri).filter(Boolean))].sort((a, b) => MURI_CYCLE.indexOf(a) - MURI_CYCLE.indexOf(b)).join(' / ');
    aiProposal = null;
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
    aiProposal = null;
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
    aiProposal = null;
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
    const inNarukideel = db.narukideel.results.some((result) => result.entries.some((entry) => entry.vazhipadukaranId === id));
    if (references.length || inNarukideel) {
      showToast(`Cannot delete ${person.name} yet; remove this record from confirmed chart entries and Narukideel results first.`);
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
          const sharedCells = entryIndex === 0 ? `<td class="valayam-number-cell" rowspan="3">${esc(box.valayamNumber)}</td><td class="muri-cell" rowspan="3">${esc(getBoxMuriSummary(box))}</td>` : '';
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
