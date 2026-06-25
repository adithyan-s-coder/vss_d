// Textile DC Management System - App Logic

const STORAGE_KEY = 'textile_received_entries';
const INW_COUNTER_KEY = 'textile_inw_counter';
const DELIVERY_STORAGE_KEY = 'textile_deliveries';
const DELIVERY_DC_COUNTER_KEY = 'textile_delivery_dc_counter';
const INVOICE_STORAGE_KEY = 'textile_invoices';
const INVOICE_COUNTER_KEY = 'textile_invoice_counter';
const PARTY_STORAGE_KEY = 'vss_parties';
const DYEING_STORAGE_KEY = 'vss_dyeing_units';
const SETTINGS_STORAGE_KEY = 'vss_company_settings';
const ATT_STAFF_KEY = 'compacting_staff';
const ATT_DATA_KEY = 'compacting_attendance';

const API_BASE = '/api';

// --- MongoDB Sync Helpers ---
async function syncToMongoDB(collection, data) {
  if (!collection || !data || !data.id) return;
  try {
    const response = await fetch(`${API_BASE}/${collection}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(await response.text());
    console.log(`Synced ${data.id} to ${collection} in MongoDB`);
  } catch (error) {
    console.error(`Error syncing ${collection} to MongoDB:`, error);
  }
}

async function deleteFromMongoDB(collection, id) {
  if (!collection || !id) return;
  try {
    const response = await fetch(`${API_BASE}/${collection}/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error(await response.text());
    console.log(`Deleted ${id} from ${collection} in MongoDB`);
  } catch (error) {
    console.error(`Error deleting from ${collection} in MongoDB:`, error);
  }
}

async function syncCountersToMongoDB() {
  const counters = {
    id: 'all_counters',
    inw: parseInt(localStorage.getItem(INW_COUNTER_KEY) || '16184', 10),
    del: parseInt(localStorage.getItem(DELIVERY_DC_COUNTER_KEY) || '101', 10),
    inv: parseInt(localStorage.getItem(INVOICE_COUNTER_KEY) || '501', 10)
  };
  await syncToMongoDB('counters', counters);
}

async function loadFromMongoDB(collection, storageKey) {
  try {
    const response = await fetch(`${API_BASE}/${collection}`);
    if (!response.ok) throw new Error(await response.text());
    
    const remoteData = await response.json();
    if (!remoteData || remoteData.length === 0) return JSON.parse(localStorage.getItem(storageKey) || (storageKey === ATT_DATA_KEY ? '{}' : '[]'));

    // Case 1: Attendance Data
    if (storageKey === ATT_DATA_KEY) {
      const attendanceObj = {};
      remoteData.forEach(item => {
        if (item.id && item.records) attendanceObj[item.id] = item.records;
      });
      localStorage.setItem(storageKey, JSON.stringify(attendanceObj));
      return attendanceObj;
    }

    // Case 2: Company Settings
    if (storageKey === SETTINGS_STORAGE_KEY) {
      const settings = remoteData.find(d => d.id === 'app_settings') || remoteData[0];
      if (settings) {
        localStorage.setItem(storageKey, JSON.stringify(settings));
        return settings;
      }
    }

    // Case 3: Counters
    if (storageKey === 'all_counters') {
      const cnt = remoteData.find(d => d.id === 'all_counters') || remoteData[0];
      if (cnt) {
        if (cnt.inw) localStorage.setItem(INW_COUNTER_KEY, String(cnt.inw));
        if (cnt.del) localStorage.setItem(DELIVERY_DC_COUNTER_KEY, String(cnt.del));
        if (cnt.inv) localStorage.setItem(INVOICE_COUNTER_KEY, String(cnt.inv));
        return cnt;
      }
    }

    // Case 4: Standard Lists
    localStorage.setItem(storageKey, JSON.stringify(remoteData));
    console.log(`Loaded ${remoteData.length} items from MongoDB for ${storageKey}`);
    return remoteData;
  } catch (error) {
    console.error(`Error loading ${collection} from MongoDB:`, error);
    return JSON.parse(localStorage.getItem(storageKey) || (storageKey === ATT_DATA_KEY ? '{}' : '[]'));
  }
}

async function syncAllToMongoDB() {
  const btn = document.getElementById('btnSyncFirebase'); // Keeping original ID for UI compatibility
  if (btn) { btn.textContent = 'Syncing...'; btn.disabled = true; }
  
  try {
    const syncTasks = [
      { key: STORAGE_KEY, col: 'received', isObj: false },
      { key: DELIVERY_STORAGE_KEY, col: 'delivery', isObj: false },
      { key: PARTY_STORAGE_KEY, col: 'party_master', isObj: false },
      { key: DYEING_STORAGE_KEY, col: 'dyeing_master', isObj: false },
      { key: ATT_STAFF_KEY, col: 'staff', isObj: false },
      { key: INVOICE_STORAGE_KEY, col: 'invoices', isObj: false }
    ];

    for (const task of syncTasks) {
      const items = JSON.parse(localStorage.getItem(task.key) || '[]');
      for (const item of items) await syncToMongoDB(task.col, item);
    }

    // Attendance (Object with dates)
    const allAtt = JSON.parse(localStorage.getItem(ATT_DATA_KEY) || '{}');
    for (const dateStr in allAtt) {
      await syncToMongoDB('attendance', { id: dateStr, records: allAtt[dateStr] });
    }

    // Settings
    const settings = getCompanySettings();
    if (settings) {
      settings.id = 'app_settings';
      await syncToMongoDB('settings', settings);
    }

    // Counters
    await syncCountersToMongoDB();
    
    alert('Synchronization complete! All data uploaded to MongoDB.');
  } catch (error) {
    console.error("Sync Error:", error);
    alert('Sync failed. Check console.');
  } finally {
    if (btn) { btn.textContent = 'Sync All to MongoDB'; btn.disabled = false; }
  }
}

window.syncAllToFirebase = syncAllToMongoDB; // Maintain legacy name for onclick

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSidebarCollapse();
  updatePageDate();

  // Load all data from MongoDB then initialize/render modules
  Promise.all([
    loadFromMongoDB('received', STORAGE_KEY),
    loadFromMongoDB('delivery', DELIVERY_STORAGE_KEY),
    loadFromMongoDB('invoices', INVOICE_STORAGE_KEY),
    loadFromMongoDB('party_master', PARTY_STORAGE_KEY),
    loadFromMongoDB('dyeing_master', DYEING_STORAGE_KEY),
    loadFromMongoDB('staff', ATT_STAFF_KEY),
    loadFromMongoDB('attendance', ATT_DATA_KEY),
    loadFromMongoDB('settings', SETTINGS_STORAGE_KEY),
    loadFromMongoDB('counters', 'all_counters')
  ]).then(() => {
    initReceivedCloth();
    initInwardEntry();
    initDelivery();
    initInvoice();
    initPartyMaster();
    initDyeingMaster();
    initCompanySettings();
    initAttendanceSystem();
    updatePartyDropdowns();
    setupEnterKeyNavigation();
    updateDashboardMetrics();
    console.log("All modules initialized with MongoDB data");
  });
});


function preparePrint(containerId) {
  ['receivedChallanPrint', 'deliveryChallanPrint', 'invoicePrint'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active-print');
  });
  const target = document.getElementById(containerId);
  if (target) target.classList.add('active-print');
}

// Page titles for header
const pageTitles = {
  dashboard: 'Dashboard',
  received: 'Received Cloth',
  delivery: 'Delivery',
  invoices: 'Invoices',
  'party-master': 'Party Master',
  'dyeing-master': 'Dyeing Master',
  'company-settings': 'Company Settings'
};

function initNavigation() {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (el.tagName === 'A') e.preventDefault();
      const page = el.dataset.page;
      const showForm = el.dataset.showForm === 'true';
      if (page) {
        navigateTo(page, showForm);
      }
    });
  });
}

function navigateTo(pageId, showForm = false) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageId);
  });

  const pageTitleEl = document.getElementById('pageTitle');
  if (pageTitleEl && pageTitles[pageId]) {
    pageTitleEl.textContent = pageTitles[pageId];
  }

  if (pageId === 'received') {
    if (showForm) {
      showInwardForm();
    } else {
      showReceivedList();
    }
  }

  if (pageId === 'delivery') {
    if (showForm) {
      showDeliveryForm();
    } else {
      showDeliveryList();
    }
  }

  if (pageId === 'invoices') {
    if (showForm) {
      showInvoiceForm();
    } else {
      showInvoiceList();
    }
  }

  if (pageId === 'party-master') {
    if (showForm) {
      showPartyForm();
    } else {
      showPartyList();
    }
  }

  if (pageId === 'dyeing-master') {
    if (showForm) {
      showDyeingForm();
    } else {
      showDyeingList();
    }
  }

  if (pageId === 'company-settings') {
    // nothing special needed, just show the div
  }

  if (pageId === 'attendance') {
    initAttendanceSystem();
  }

  if (pageId === 'dashboard') {
    updateDashboardMetrics();
  }
}

function initSidebarCollapse() {
  const sidebar = document.getElementById('sidebar');
  const collapseBtn = document.getElementById('collapseBtn');
  if (sidebar && collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      const icon = collapseBtn.querySelector('svg');
      const label = collapseBtn.querySelector('.collapse-label');
      if (sidebar.classList.contains('collapsed')) {
        if (icon) icon.innerHTML = '<polyline points="15 18 9 12 15 6"/>';
        if (label) label.textContent = 'Expand';
      } else {
        if (icon) icon.innerHTML = '<polyline points="9 18 15 12 9 6"/>';
        if (label) label.textContent = 'Collapse';
      }
    });
  }
}

function updatePageDate() {
  const el = document.getElementById('pageDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// --- Storage & Dashboard ---
function getEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function getNextInwNo() {
  let n = parseInt(localStorage.getItem(INW_COUNTER_KEY) || '16184', 10);
  localStorage.setItem(INW_COUNTER_KEY, String(n + 1));
  return n;
}

function updateDashboardMetrics() {
  const entries = getEntries();
  const deliveries = getDeliveries();
  const today = new Date().toDateString();
  const totalReceived = entries.length;
  const totalDelivered = deliveries.length;
  const pending = entries.filter(e => (e.status || 'Pending') === 'Pending').length;
  const todayReceived = entries.filter(e => e.date && new Date(e.date).toDateString() === today).length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('dashTotalReceived', totalReceived);
  set('dashTotalDelivered', totalDelivered);
  set('dashPending', pending);
  set('dashTodayReceived', todayReceived);

  const recentEl = document.getElementById('recentReceivedList');
  if (recentEl) {
    const recent = entries.slice(-5).reverse();
    recentEl.innerHTML = recent.length ? recent.map(e => `
      <div class="recent-item">
        <div class="recent-item-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
        </div>
        <div class="recent-item-info">
          <span class="recent-qty">${e.ourWt || '0'} Kg</span>
          <span class="recent-party">${e.party || '--'}</span>
        </div>
        <span class="badge badge-pending">${e.status || 'Pending'}</span>
        <span class="recent-date">${e.date ? new Date(e.date).toLocaleDateString('en-GB') : '--'}</span>
      </div>
    `).join('') : '<p class="empty-state">No received entries yet</p>';
  }

  const recentDelEl = document.getElementById('recentDeliveriesList');
  if (recentDelEl) {
    const recentDel = deliveries.slice(-5).reverse();
    recentDelEl.innerHTML = recentDel.length ? recentDel.map(d => `
      <div class="recent-item">
        <div class="recent-item-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
        </div>
        <div class="recent-item-info">
          <span class="recent-qty">DC ${d.dcNo}</span>
          <span class="recent-party">${d.partyName || '--'}</span>
        </div>
        <span class="badge badge-pending">Delivered</span>
        <span class="recent-date">${d.date ? new Date(d.date).toLocaleDateString('en-GB') : '--'}</span>
      </div>
    `).join('') : '<p class="empty-state">No deliveries yet</p>';
  }
}

// --- Received Cloth List ---
function initReceivedCloth() {
  const btnNew = document.getElementById('btnNewInward');
  const btnBack = document.getElementById('btnBackToList');
  const searchInput = document.getElementById('receivedSearch');

  if (btnNew) btnNew.addEventListener('click', () => showInwardForm(true));
  if (btnBack) btnBack.addEventListener('click', () => { document.querySelectorAll('.form-actions .btn-action').forEach(b => b.disabled = false); showReceivedList(); });
  if (searchInput) searchInput.addEventListener('input', renderReceivedTable);

  loadFromFirestore(receivedCol, STORAGE_KEY).then(() => {
    renderReceivedTable();
    updateDashboardMetrics();
  });
}

function showInwardForm(reset = true) {
  const listView = document.getElementById('receivedListView');
  const formView = document.getElementById('inwardFormView');
  if (listView) listView.style.display = 'none';
  if (formView) formView.style.display = 'block';
  if (reset) resetInwardForm();
  document.querySelectorAll('.form-actions .btn-action').forEach(b => b.disabled = false);
}

function showReceivedList() {
  const listView = document.getElementById('receivedListView');
  const formView = document.getElementById('inwardFormView');
  if (listView) listView.style.display = 'block';
  if (formView) formView.style.display = 'none';
  renderReceivedTable();
  updateDashboardMetrics();
}

function renderReceivedTable() {
  const tbody = document.getElementById('receivedTableBody');
  const search = (document.getElementById('receivedSearch')?.value || '').toLowerCase();
  if (!tbody) return;

  const entries = getEntries().filter(e => {
    if (!search) return true;
    const s = `${e.inwNo} ${e.party} ${e.dyeing} ${e.fabric || ''}`.toLowerCase();
    return s.includes(search);
  });

  tbody.innerHTML = entries.length ? entries.map(e => `
    <tr data-id="${e.id}">
      <td>${e.inwNo}</td>
      <td>${e.dcNo || '--'}</td>
      <td>${e.party}</td>
      <td>${e.partyDcNo || '--'}</td>
      <td>${e.dyeing}</td>
      <td>${e.dyeingDcNo || '--'}</td>
      <td>${e.ourWt} Kg</td>
      <td><span class="badge-status ${(e.status || 'Pending').toLowerCase()}">${e.status || 'Pending'}</span></td>
      <td class="action-icons">
        <button type="button" title="View" onclick="viewEntry('${e.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
        <button type="button" title="Edit" onclick="editEntry('${e.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button type="button" title="Print" onclick="printEntry('${e.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/></svg></button>
        <button type="button" title="Delete" onclick="deleteEntry('${e.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="9" style="text-align:center;color:var(--text-secondary);padding:24px">No received entries yet. Click "New Inward Entry" to add.</td></tr>';
}

function viewEntry(id) {
  const entries = getEntries();
  const e = entries.find(x => x.id === id);
  if (!e) return;
  showInwardForm(false);
  populateForm(e);
  document.querySelectorAll('.form-actions .btn-action').forEach(b => { if (!b.id || !['btnPrint', 'btnBackToList', 'btnExit'].includes(b.id)) b.disabled = true; });
}

function editEntry(id) {
  const entries = getEntries();
  const e = entries.find(x => x.id === id);
  if (!e) return;
  showInwardForm(false);
  populateForm(e);
  document.getElementById('inwNo').dataset.editId = id;
}

function printEntry(id) {
  const entries = getEntries();
  const e = entries.find(x => x.id === id);
  if (!e) return;
  preparePrint('receivedChallanPrint');
  populatePrintFromEntry(e);
  window.print();
}

function deleteEntry(id) {
  if (!confirm('Are you sure you want to delete this received entry?')) return;
  const entries = getEntries().filter(x => x.id !== id);
  saveEntries(entries);
  deleteFromMongoDB('received', id); // Delete from MongoDB
  updateDashboardMetrics();
  renderReceivedTable();
  showReceivedList();
}



function populateForm(e) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  set('inwDate', e.date);
  set('inwNo', e.inwNo);
  set('partyName', e.partyValue || '');
  set('typeOfProcess', e.process || 'COMPACTING');
  set('dyeingName', e.dyeingValue || '');
  set('dyDcNo', e.dyeingDcNo);
  set('search_partyName', e.party || '');
  set('search_dyeingName', e.dyeing || '');
  set('lotNo', e.lotNo);
  set('partyDcNo', e.partyDcNo);
  set('partyOrder', e.partyOrder);
  set('remarks', e.remarks);
  const tbody = document.getElementById('itemGridBody');
  if (tbody && e.items) {
    tbody.innerHTML = '';
    e.items.forEach(it => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${tbody.children.length + 1}</td><td>${it.colour || ''}</td><td>${it.fabric || ''}</td><td>${it.dia || ''}</td><td>${it.roll || ''}</td><td>${it.dyDcWt || ''}</td><td>${it.receivedWt || ''}</td><td><button type="button" class="btn-delete-row">×</button></td>`;
      tr.querySelector('.btn-delete-row').addEventListener('click', () => { tr.remove(); renumberRows(); updateTotals(); });
      tbody.appendChild(tr);
    });
  }
  updateTotals();
}

function populatePrintFromEntry(e) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v || '--'; };
  set('printPartyName', e.party);
  set('printDyeingName', e.dyeing);
  set('printDate', e.date ? new Date(e.date).toLocaleDateString('en-GB') : '--');
  set('printDcNo', e.inwNo);
  set('printInwNo', e.inwNo);
  set('printDyDcNo', e.dyeingDcNo);
  set('printPartyDcNo', e.partyDcNo);
  set('printOrderNo', e.partyOrder);
  set('printProcess', e.process || 'COMPACTING');
  set('printTotalRoll', e.totalRoll || '0');
  set('printTotalReceivedWt', e.ourWt || '0');
  set('printReceivedWt', e.ourWt || '0');
  set('printDyDcWt', e.totalDyDcWt || '0');
  const printBody = document.getElementById('printGridBody');
  const lotNo = e.lotNo || '--';
  if (printBody) {
    let rowsHtml = '';
    const items = e.items || [];
    const maxRows = 6;
    
    for (let i = 0; i < maxRows; i++) {
        if (i < items.length) {
            const it = items[i];
            rowsHtml += `<tr><td>${lotNo}</td><td>${it.fabric || ''}</td><td>${it.colour || ''}</td><td>${it.dia || ''}</td><td>${it.roll || ''}</td><td>${it.receivedWt || ''}</td></tr>`;
        } else {
            rowsHtml += `<tr class="empty-row"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>`;
        }
    }
    printBody.innerHTML = rowsHtml;
  }
}

// --- Inward Entry Form ---
function initInwardEntry() {
  const btnAddRow = document.getElementById('btnAddRow');
  const btnPrint = document.getElementById('btnPrint');
  const btnSave = document.getElementById('btnSave');

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'n' && document.getElementById('inwardFormView')?.style.display !== 'none') {
      e.preventDefault();
      addRowFromInputs();
    }
  });

  updateTotals();
}

function resetInwardForm() {
  const inwNoEl = document.getElementById('inwNo');
  if (inwNoEl) delete inwNoEl.dataset.editId;
  document.querySelectorAll('.form-actions .btn-action').forEach(b => b.disabled = false);
  const inwDate = document.getElementById('inwDate');
  if (inwDate) inwDate.valueAsDate = new Date();
  if (inwNoEl) inwNoEl.value = getNextInwNo();

  // Clear all text and hidden inputs
  ['partyName', 'search_partyName', 'dyeingName', 'search_dyeingName', 'dyDcNo', 'lotNo', 'partyDcNo', 'partyOrder', 'remarks'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('typeOfProcess').value = 'COMPACTING';
  const tbody = document.getElementById('itemGridBody');
  if (tbody) tbody.innerHTML = '';
  clearItemInputs();
  updateTotals();
  const d = new Date();
  const ed = document.getElementById('entryDate');
  if (ed) ed.textContent = d.toLocaleDateString('en-GB') + ' - ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function collectFormData() {
  const rows = [];
  document.querySelectorAll('#itemGridBody tr').forEach(tr => {
    const c = tr.querySelectorAll('td');
    if (c.length >= 7) rows.push({ colour: c[1].textContent, fabric: c[2].textContent, dia: c[3].textContent, roll: c[4].textContent, dyDcWt: c[5].textContent, receivedWt: c[6].textContent });
  });
  return rows;
}

let isSavingInward = false;
function saveInwardEntry() {
  if (isSavingInward) return;
  isSavingInward = true;

  try {
    const rows = collectFormData();
    if (!rows.length) { alert('Add at least one item.'); return; }

    const totalRoll = document.getElementById('totalRoll')?.value || '0';
    const totalDyDcWt = document.getElementById('totalDyDcWt')?.value || '0';
    const totalReceivedWt = document.getElementById('totalReceivedWt')?.value || '0';
    const entry = {
      id: document.getElementById('inwNo').dataset.editId || 'id_' + Date.now(),
      inwNo: document.getElementById('inwNo').value,
      date: document.getElementById('inwDate').value,
      partyValue: document.getElementById('partyName')?.value,
      party: document.getElementById('search_partyName') ? document.getElementById('search_partyName').value : '--',
      partyDcNo: document.getElementById('partyDcNo')?.value,
      dyeingValue: document.getElementById('dyeingName')?.value,
      dyeing: document.getElementById('search_dyeingName') ? document.getElementById('search_dyeingName').value : '--',
      dyeingDcNo: document.getElementById('dyDcNo')?.value,
      lotNo: document.getElementById('lotNo')?.value,
      partyOrder: document.getElementById('partyOrder')?.value,
      process: document.getElementById('typeOfProcess')?.value || 'COMPACTING',
      remarks: document.getElementById('remarks')?.value,
      items: rows,
      totalRoll, totalDyDcWt, ourWt: totalReceivedWt,
      status: 'Pending',
      dcNo: document.getElementById('inwNo').value
    };

    const entries = getEntries();
    const editId = document.getElementById('inwNo').dataset.editId;
    let updated;
    if (editId) {
      updated = entries.map(e => e.id === editId ? entry : e);
    } else {
      updated = [...entries, entry];
    }
    saveEntries(updated);
    updateDashboardMetrics();
    syncToMongoDB('received', entry); // Sync to MongoDB
    syncCountersToMongoDB(); // Sync updated counters
    showReceivedList();
  } finally {
    setTimeout(() => { isSavingInward = false; }, 500);
  }
}

function addRowFromInputs() {
  const colour = document.getElementById('itemColour')?.value?.trim() || '';
  const fabric = document.getElementById('itemFabric')?.value?.trim() || '';
  const dia = document.getElementById('itemDia')?.value || '0';
  const roll = document.getElementById('itemRoll')?.value || '0';
  const dyDcWt = document.getElementById('itemDyDcWt')?.value || '0';
  const receivedWt = document.getElementById('itemReceivedWt')?.value || '0';

  const tbody = document.getElementById('itemGridBody');
  if (!tbody) return;

  const modifyingRow = tbody.querySelector('tr.modifying');
  if (modifyingRow) {
    modifyingRow.cells[1].textContent = colour;
    modifyingRow.cells[2].textContent = fabric;
    modifyingRow.cells[3].textContent = dia;
    modifyingRow.cells[4].textContent = roll;
    modifyingRow.cells[5].textContent = dyDcWt;
    modifyingRow.cells[6].textContent = receivedWt;
    modifyingRow.classList.remove('modifying');
    clearItemInputs();
    updateTotals();
    return;
  }

  if (!colour && !fabric && !roll && !receivedWt) return;

  const sno = tbody.querySelectorAll('tr').length + 1;
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${sno}</td><td>${colour}</td><td>${fabric}</td><td>${dia}</td><td>${roll}</td><td>${dyDcWt}</td><td>${receivedWt}</td><td><button type="button" class="btn-delete-row" title="Delete">×</button></td>`;
  tr.querySelector('.btn-delete-row').addEventListener('click', () => { tr.remove(); renumberRows(); updateTotals(); });
  tr.addEventListener('dblclick', () => {
    tbody.querySelectorAll('tr').forEach(r => r.classList.remove('modifying'));
    document.getElementById('itemColour').value = tr.cells[1].textContent;
    document.getElementById('itemFabric').value = tr.cells[2].textContent;
    document.getElementById('itemDia').value = tr.cells[3].textContent;
    document.getElementById('itemRoll').value = tr.cells[4].textContent;
    document.getElementById('itemDyDcWt').value = tr.cells[5].textContent;
    document.getElementById('itemReceivedWt').value = tr.cells[6].textContent;
    tr.classList.add('modifying');
  });
  tbody.appendChild(tr);
  updateTotals();
  clearItemInputs();
}

function clearItemInputs() {
  ['itemColour', 'itemFabric', 'itemDia', 'itemRoll', 'itemDyDcWt', 'itemReceivedWt'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = id === 'itemDia' ? '0' : '';
  });
}

function renumberRows() {
  const tbody = document.getElementById('itemGridBody');
  if (!tbody) return;
  tbody.querySelectorAll('tr').forEach((tr, i) => { tr.querySelector('td:first-child').textContent = i + 1; });
}

function updateTotals() {
  const tbody = document.getElementById('itemGridBody');
  const totalRoll = document.getElementById('totalRoll');
  const totalDyDcWt = document.getElementById('totalDyDcWt');
  const totalReceivedWt = document.getElementById('totalReceivedWt');
  if (!tbody || !totalRoll) return;
  let r = 0, d = 0, w = 0;
  tbody.querySelectorAll('tr').forEach(tr => {
    const c = tr.querySelectorAll('td');
    if (c.length >= 7) { r += parseFloat(c[4]?.textContent || 0) || 0; d += parseFloat(c[5]?.textContent || 0) || 0; w += parseFloat(c[6]?.textContent || 0) || 0; }
  });
  totalRoll.value = r.toFixed(0);
  if (totalDyDcWt) totalDyDcWt.value = d.toFixed(3);
  if (totalReceivedWt) totalReceivedWt.value = w.toFixed(3);
}

function printReceivedChallan() {
  preparePrint('receivedChallanPrint');
  const rows = collectFormData();
  const partyInput = document.getElementById('search_partyName');
  const dyeingInput = document.getElementById('search_dyeingName');
  document.getElementById('printPartyName').textContent = partyInput ? partyInput.value : '--';
  document.getElementById('printDyeingName').textContent = dyeingInput ? dyeingInput.value : '--';
  document.getElementById('printDate').textContent = document.getElementById('inwDate')?.value ? new Date(document.getElementById('inwDate').value).toLocaleDateString('en-GB') : '--';
  document.getElementById('printDcNo').textContent = document.getElementById('inwNo')?.value || '--';
  document.getElementById('printInwNo').textContent = document.getElementById('inwNo')?.value || '--';
  document.getElementById('printDyDcNo').textContent = document.getElementById('dyDcNo')?.value || '--';
  document.getElementById('printPartyDcNo').textContent = document.getElementById('partyDcNo')?.value || '--';
  document.getElementById('printOrderNo').textContent = document.getElementById('partyOrder')?.value || '--';
  document.getElementById('printProcess').textContent = document.getElementById('typeOfProcess')?.value || 'COMPACTING';
  document.getElementById('printTotalRoll').textContent = document.getElementById('totalRoll')?.value || '0';
  document.getElementById('printTotalReceivedWt').textContent = document.getElementById('totalReceivedWt')?.value || '0';
  document.getElementById('printReceivedWt').textContent = document.getElementById('totalReceivedWt')?.value || '0';
  document.getElementById('printDyDcWt').textContent = document.getElementById('totalDyDcWt')?.value || '0';
  const printBody = document.getElementById('printGridBody');
  const lotNo = document.getElementById('lotNo')?.value || '--';
  if (printBody) {
    let rowsHtml = '';
    const items = rows || [];
    const maxRows = 6;
    
    for (let i = 0; i < maxRows; i++) {
        if (i < items.length) {
            const r = items[i];
            rowsHtml += `<tr><td>${lotNo}</td><td>${r.fabric || ''}</td><td>${r.colour || ''}</td><td>${r.dia || ''}</td><td>${r.roll || ''}</td><td>${r.receivedWt || ''}</td></tr>`;
        } else {
            rowsHtml += `<tr class="empty-row"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>`;
        }
    }
    printBody.innerHTML = rowsHtml;
  }
  window.print();
}

// --- Delivery Functions ---
function getDeliveries() {
  try {
    return JSON.parse(localStorage.getItem(DELIVERY_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveDeliveries(deliveries) {
  localStorage.setItem(DELIVERY_STORAGE_KEY, JSON.stringify(deliveries));
}

function getNextDeliveryDcNo() {
  let n = parseInt(localStorage.getItem(DELIVERY_DC_COUNTER_KEY) || '1', 10);
  localStorage.setItem(DELIVERY_DC_COUNTER_KEY, String(n + 1));
  return n;
}

function initDelivery() {
  const btnNew = document.getElementById('btnNewDelivery');
  const btnBack = document.getElementById('btnDelBackToList');
  const searchInput = document.getElementById('deliverySearch');
  const btnSave = document.getElementById('btnDelSave');
  const btnPrint = document.getElementById('btnDelPrint');
  const inwNoInput = document.getElementById('delInwNo');

  if (btnNew) btnNew.addEventListener('click', () => showDeliveryForm(true));
  if (btnBack) btnBack.addEventListener('click', showDeliveryList);
  if (searchInput) searchInput.addEventListener('input', renderDeliveryTable);
  if (btnSave) btnSave.addEventListener('click', saveDelivery);
  if (btnPrint) printBtnAction(btnPrint);
  if (inwNoInput) {
    inwNoInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        fetchInwardDetailsForDelivery();
      }
    });
    inwNoInput.addEventListener('blur', fetchInwardDetailsForDelivery);
  }

  loadFromMongoDB('delivery', DELIVERY_STORAGE_KEY).then(() => {
    renderDeliveryTable();
  });
}

function printBtnAction(btnPrint) {
  btnPrint.addEventListener('click', printDeliveryChallan);
}

function addDeliveryRowFromInputs() {
  const colour = document.getElementById('delItemColour')?.value || '';
  const dia = document.getElementById('delItemDia')?.value || '';
  const fabric = document.getElementById('delItemFabric')?.value || '';
  const process = document.getElementById('delItemProcess')?.value || '';
  const roll = document.getElementById('delItemRoll')?.value || '0';
  const wt = document.getElementById('delItemWt')?.value || '0';
  const pOrder = document.getElementById('delItemPOrder')?.value || '';
  const pLot = document.getElementById('delItemPLot')?.value || '';
  const inwNoInput = document.getElementById('delInwNo')?.value || '';

  if (!colour && !fabric) {
    alert('Please enter at least Colour or Fabric');
    return;
  }

  const tbody = document.getElementById('delItemGridBody');
  if (!tbody) return;

  const sno = tbody.querySelectorAll('tr').length + 1;
  const tr = document.createElement('tr');

  tr.innerHTML = `
    <td>${sno}</td>
    <td>${inwNoInput}</td>
    <td>${colour}</td>
    <td>${dia}</td>
    <td>${fabric}</td>
    <td>${process}</td>
    <td><input type="number" class="grid-input del-roll" value="${roll}" min="0" step="1" onchange="updateDeliveryTotals()"></td>
    <td><input type="number" class="grid-input del-wt" value="${wt}" min="0" step="0.001" onchange="updateDeliveryTotals()"></td>
    <td>${pOrder}</td>
    <td>${pLot}</td>
    <td><button type="button" class="btn-delete-row" title="Delete">×</button></td>
  `;

  tr.querySelector('.btn-delete-row').addEventListener('click', () => {
    tr.remove();
    renumberDeliveryRows();
    updateDeliveryTotals();
  });

  tbody.appendChild(tr);

  // Clear inputs
  ['delItemColour', 'delItemDia', 'delItemFabric', 'delItemProcess', 'delItemRoll', 'delItemWt', 'delItemPOrder', 'delItemPLot'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  updateDeliveryTotals();
}

function renumberDeliveryRows() {
  const tbody = document.getElementById('delItemGridBody');
  if (!tbody) return;
  tbody.querySelectorAll('tr').forEach((tr, i) => { tr.querySelector('td:first-child').textContent = i + 1; });
}

function updateDeliveryTotals() {
  const tbody = document.getElementById('delItemGridBody');
  const totalRoll = document.getElementById('delTotalRoll');
  const totalWt = document.getElementById('delTotalDelWt');
  if (!tbody || !totalRoll || !totalWt) return;

  let r = 0, w = 0;
  tbody.querySelectorAll('tr').forEach(tr => {
    const rollInput = tr.querySelector('.del-roll');
    const wtInput = tr.querySelector('.del-wt');
    if (rollInput) r += parseFloat(rollInput.value || 0) || 0;
    if (wtInput) w += parseFloat(wtInput.value || 0) || 0;
  });

  totalRoll.value = r.toFixed(0);
  totalWt.value = w.toFixed(3);
}

function fetchInwardDetailsForDelivery() {
  const inwNoInput = document.getElementById('delInwNo');

  const inwNo = inwNoInput.value.trim();
  const entries = getEntries();
  const matchedEntry = entries.find(e => String(e.inwNo) === String(inwNo));

  if (!matchedEntry) {
    alert(`No received entry found for Inward No: ${inwNo}`);
    return;
  }

  // Pre-fill party
  const partySel = document.getElementById('delPartyName');
  const searchParty = document.getElementById('search_delPartyName');
  if (partySel) partySel.value = matchedEntry.partyValue || matchedEntry.party || '';
  if (searchParty) searchParty.value = matchedEntry.party || '';

  // Extract common details for grid from matched received entry header
  const entryProcess = matchedEntry.process || 'COMPACTING';
  const entryLotNo = matchedEntry.lotNo || '';
  const entryOrderNo = matchedEntry.partyOrder || '';
  const inwId = matchedEntry.inwNo;

  const tbody = document.getElementById('delItemGridBody');
  if (!tbody) return;

  // Append new rows based on received items
  if (matchedEntry.items && matchedEntry.items.length > 0) {
    matchedEntry.items.forEach(it => {
      const sno = tbody.querySelectorAll('tr').length + 1;
      const tr = document.createElement('tr');
      // Format: S.No, Inw No, Colour, Dia, Fabric, Process, Del Roll, Del Wt, P Order, P Lot, [x]

      tr.innerHTML = `
        <td>${sno}</td>
        <td>${inwId}</td>
        <td>${it.colour || ''}</td>
        <td>${it.dia || ''}</td>
        <td>${it.fabric || ''}</td>
        <td>${entryProcess}</td>
        <td><input type="number" class="grid-input del-roll" value="${it.roll || 0}" min="0" step="1" onchange="updateDeliveryTotals()"></td>
        <td><input type="number" class="grid-input del-wt" value="${it.receivedWt || it.dyDcWt || 0}" min="0" step="0.001" onchange="updateDeliveryTotals()"></td>
        <td>${entryOrderNo}</td>
        <td>${entryLotNo}</td>
        <td><button type="button" class="btn-delete-row" title="Delete">×</button></td>
      `;
      tr.querySelector('.btn-delete-row').addEventListener('click', () => { tr.remove(); renumberDeliveryRows(); updateDeliveryTotals(); });
      tbody.appendChild(tr);
    });
  }

  updateDeliveryTotals();
  inwNoInput.value = ''; // clear for next entry scan
}

function showDeliveryList() {
  const listView = document.getElementById('deliveryListView');
  const formView = document.getElementById('deliveryFormView');
  if (listView) listView.style.display = 'block';
  if (formView) formView.style.display = 'none';
  renderDeliveryTable();
  updateDashboardMetrics();
}

function showDeliveryForm(reset = true) {
  const listView = document.getElementById('deliveryListView');
  const formView = document.getElementById('deliveryFormView');
  if (listView) listView.style.display = 'none';
  if (formView) formView.style.display = 'block';
  if (reset) resetDeliveryForm();
}

function resetDeliveryForm() {
  const delDate = document.getElementById('delDate');
  const delDcNo = document.getElementById('delDcNo');

  // Try to use a central new DC No if required, else use auto increment
  if (delDate) delDate.valueAsDate = new Date();
  if (delDcNo) delDcNo.value = getNextDeliveryDcNo();

  const inwNoInput = document.getElementById('delInwNo');
  if (inwNoInput) inwNoInput.value = '';

  ['delPartyName', 'delSendTo', 'delVehicleNo', 'delRemarks'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = el.tagName === 'SELECT' ? '' : '';
  });

  document.getElementById('search_delPartyName').value = '';

  const tbody = document.getElementById('delItemGridBody');
  if (tbody) tbody.innerHTML = '';
  updateDeliveryTotals();
}

function renderDeliveryTable() {
  const tbody = document.getElementById('deliveryTableBody');
  const search = (document.getElementById('deliverySearch')?.value || '').toLowerCase();
  if (!tbody) return;

  const deliveries = getDeliveries().filter(d => {
    if (!search) return true;
    const s = `${d.dcNo} ${d.partyName} ${d.date || ''}`.toLowerCase();
    return s.includes(search);
  });

  tbody.innerHTML = deliveries.length ? deliveries.map(d => `
    <tr data-id="${d.id}">
      <td>${d.dcNo}</td>
      <td>${d.date ? new Date(d.date).toLocaleDateString('en-GB') : '--'}</td>
      <td>${d.partyName || '--'}</td>
      <td>${d.totalRoll || '0'}</td>
      <td>${d.totalDelWt || '0'} Kg</td>
      <td><span class="badge-status delivered">Delivered</span></td>
      <td class="action-icons">
        <button type="button" title="View" onclick="viewDelivery('${d.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
        <button type="button" title="Edit" onclick="editDelivery('${d.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button type="button" title="Print" onclick="printDeliveryById('${d.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/></svg></button>
        <button type="button" title="Delete" onclick="deleteDelivery('${d.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);padding:24px">No deliveries yet. Click "New Delivery" to add.</td></tr>';
}

function viewDelivery(id) {
  const deliveries = getDeliveries();
  const d = deliveries.find(x => x.id === id);
  if (!d) return;
  showDeliveryForm(false);
  populateDeliveryForm(d);
  document.querySelectorAll('#deliveryFormView .form-actions .btn-action').forEach(b => { if (!b.id || !['btnDelPrint', 'btnDelBackToList'].includes(b.id)) b.disabled = true; });
}

function editDelivery(id) {
  const deliveries = getDeliveries();
  const d = deliveries.find(x => x.id === id);
  if (!d) return;
  showDeliveryForm(false);
  populateDeliveryForm(d);
  document.getElementById('delDcNo').dataset.editId = id;
}

function deleteDelivery(id) {
  if (!confirm('Are you sure you want to delete this delivery entry?')) return;
  const deliveries = getDeliveries().filter(x => x.id !== id);
  saveDeliveries(deliveries);
  deleteFromMongoDB('delivery', id); // Delete from MongoDB
  updateDashboardMetrics();
  renderDeliveryTable();
  showDeliveryList();
}


function populateDeliveryForm(d) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  set('delDate', d.date);
  set('delDcNo', d.dcNo);
  set('delPartyName', d.partyValue || '');
  set('delSendTo', d.sendTo);
  set('delVehicleNo', d.vehicleNo);
  set('delRemarks', d.remarks);
  const searchParty = document.getElementById('search_delPartyName');
  if (searchParty) searchParty.value = d.partyName || '';

  const tbody = document.getElementById('delItemGridBody');
  if (tbody && d.items) {
    tbody.innerHTML = '';
    d.items.forEach(it => {
      const tr = document.createElement('tr');
      // format: S.No, Inw No, Colour, Dia, Fabric, Process, Del Roll, Del Wt, P Order, P Lot
      tr.innerHTML = `
        <td>${tbody.children.length + 1}</td>
        <td>${it.inwNo || ''}</td>
        <td>${it.colour || ''}</td>
        <td>${it.dia || ''}</td>
        <td>${it.fabric || ''}</td>
        <td>${it.process || ''}</td>
        <td><input type="number" class="grid-input del-roll" value="${it.roll || 0}" min="0" step="1" onchange="updateDeliveryTotals()"></td>
        <td><input type="number" class="grid-input del-wt" value="${it.delWt || 0}" min="0" step="0.001" onchange="updateDeliveryTotals()"></td>
        <td>${it.pOrder || ''}</td>
        <td>${it.pLot || ''}</td>
        <td><button type="button" class="btn-delete-row">×</button></td>
      `;
      tr.querySelector('.btn-delete-row').addEventListener('click', () => { tr.remove(); renumberDeliveryRows(); updateDeliveryTotals(); });
      tbody.appendChild(tr);
    });
  }
  updateDeliveryTotals();
}



function collectDeliveryData() {
  const rows = [];
  document.querySelectorAll('#delItemGridBody tr').forEach(tr => {
    const c = tr.querySelectorAll('td');
    if (c.length >= 10) {
      rows.push({
        inwNo: c[1].textContent.trim(),
        colour: c[2].textContent.trim(),
        dia: c[3].textContent.trim(),
        fabric: c[4].textContent.trim(),
        process: c[5].textContent.trim(),
        roll: tr.querySelector('.del-roll')?.value || '0',
        delWt: tr.querySelector('.del-wt')?.value || '0',
        pOrder: c[8].textContent.trim(),
        pLot: c[9].textContent.trim()
      });
    }
  });
  return rows;
}

function saveDelivery() {
  const rows = collectDeliveryData();
  if (!rows.length) {
    alert('Please add at least one item row before saving.');
    return;
  }

  const partyInput = document.getElementById('search_delPartyName');
  const partyText = partyInput ? partyInput.value : '--';
  const totalRoll = document.getElementById('delTotalRoll')?.value || '0';
  const totalDelWt = document.getElementById('delTotalDelWt')?.value || '0';

  const delivery = {
    id: document.getElementById('delDcNo').dataset.editId || 'del_' + Date.now(),
    dcNo: document.getElementById('delDcNo').value,
    date: document.getElementById('delDate').value,
    partyValue: document.getElementById('delPartyName').value,
    partyName: document.getElementById('search_delPartyName') ? document.getElementById('search_delPartyName').value : '--',
    sendTo: document.getElementById('delSendTo')?.value,
    vehicleNo: document.getElementById('delVehicleNo')?.value,
    remarks: document.getElementById('delRemarks')?.value,
    items: rows,
    totalRoll,
    totalDelWt
  };

  const deliveries = getDeliveries();
  const editId = document.getElementById('delDcNo').dataset.editId;
  let updated;
  if (editId) {
    updated = deliveries.map(d => d.id === editId ? delivery : d);
  } else {
    updated = [...deliveries, delivery];
  }

  saveDeliveries(updated);
  updateDashboardMetrics();
  syncToMongoDB('delivery', delivery); // Sync to MongoDB
  syncCountersToMongoDB(); // Sync updated counters
  showDeliveryList();
}

function printDeliveryChallan() {
  preparePrint('deliveryChallanPrint');
  const rows = collectDeliveryData();
  if (!rows.length) { alert('Add at least one item before printing.'); return; }

  applyCompanySettingsToPrint('Del');

  const partySel = document.getElementById('search_delPartyName');
  document.getElementById('printDelPartyName').textContent = partySel ? partySel.value : '--';
  document.getElementById('printDelDate').textContent = document.getElementById('delDate')?.value ? new Date(document.getElementById('delDate').value).toLocaleDateString('en-GB') : '--';
  document.getElementById('printDelDcNo').textContent = document.getElementById('delDcNo')?.value || '--';
  document.getElementById('printDelVehicleNo').textContent = document.getElementById('delVehicleNo')?.value || '--';
  document.getElementById('printDelTotalRoll').textContent = document.getElementById('delTotalRoll')?.value || '0';
  document.getElementById('printDelTotalWt').textContent = parseFloat(document.getElementById('delTotalDelWt')?.value || '0').toFixed(3);

  // Use the first item's details for metadata exactly like printDeliveryById
  const firstItem = rows[0] || {};
  document.getElementById('printDelOurInwNo').textContent = firstItem.inwNo || '--';
  document.getElementById('printDelProcess').textContent = firstItem.process || 'COMPACTING';
  document.getElementById('printDelOrderNo').textContent = firstItem.pOrder || '--';
  document.getElementById('printDelLotNo').textContent = firstItem.pLot || '--';

  // Try to find the matching received entry for dyed weight and original received weight
  const receivedEntries = getEntries();
  const matchedEntry = receivedEntries.find(e => String(e.inwNo) === String(firstItem.inwNo));
  if (matchedEntry) {
    document.getElementById('printDelDyDcWt').textContent = parseFloat(matchedEntry.totalDyDcWt || 0).toFixed(3);
    document.getElementById('printDelRecdDcNo2').textContent = matchedEntry.dyeingDcNo || '--';
    document.getElementById('printDelPartyDcNo').textContent = matchedEntry.partyDcNo || '--';
    
    // Consistent Dyeing Name
    const dInfo = getDyeingInfoByName(matchedEntry.dyeing);
    document.getElementById('printDelDyeingName').textContent = dInfo ? dInfo.name : (matchedEntry.dyeing || '--');
    
    document.getElementById('printDelReceivedWt').textContent = parseFloat(matchedEntry.ourWt || 0).toFixed(3);
    
    // Set Delivery Party Meta
    const partyName = document.getElementById('printDelPartyName').textContent;
    const pInfo = getPartyInfoByName(partyName);
    const delPAddress = document.getElementById('printDelPartyAddress');
    const delPGstLine = document.getElementById('printDelPartyGstinLine');
    const delPGst = document.getElementById('printDelPartyGst');

    if (pInfo) {
      if (delPAddress) delPAddress.textContent = shortenAddress(pInfo.address);
      if (delPGst && delPGstLine) {
        if (pInfo.gstin) {
          delPGst.textContent = pInfo.gstin;
          delPGstLine.style.display = 'inline';
        } else {
          delPGstLine.style.display = 'none';
        }
      }
    } else {
      if (delPAddress) delPAddress.textContent = '';
      if (delPGstLine) delPGstLine.style.display = 'none';
    }
  } else {
    document.getElementById('printDelDyDcWt').textContent = '0.000';
    document.getElementById('printDelRecdDcNo2').textContent = '--';
    document.getElementById('printDelPartyDcNo').textContent = '--';
    document.getElementById('printDelDyeingName').textContent = '--';
    document.getElementById('printDelReceivedWt').textContent = '0.000';
  }

  // Set Delivery Party Meta unconditionally
  let partyNameContent = document.getElementById('printDelPartyName').textContent;
  let pInfoObj = getPartyInfoByName(partyNameContent);
  let dPAddress = document.getElementById('printDelPartyAddress');
  let dPGstLine = document.getElementById('printDelPartyGstinLine');
  let dPGst = document.getElementById('printDelPartyGst');

  if (pInfoObj) {
    if (dPAddress) dPAddress.textContent = pInfoObj.address || '';
    if (dPGst && dPGstLine) {
      if (pInfoObj.gstin) {
        dPGst.textContent = pInfoObj.gstin;
        dPGstLine.style.display = 'inline';
      } else {
        dPGstLine.style.display = 'none';
      }
    }
  } else {
    if (dPAddress) dPAddress.textContent = '';
    if (dPGstLine) dPGstLine.style.display = 'none';
  }

  const printBody = document.getElementById('printDelGridBody');
  if (printBody) {
    let rowsHtml = '';
    const items = rows || [];
    const maxRows = 6;
    for (let i = 0; i < maxRows; i++) {
        if (i < items.length) {
            const r = items[i];
            rowsHtml += `<tr>
        <td>${r.pLot || '--'}</td>
        <td style="text-align: left;">${r.fabric || '--'}</td>
        <td>998821</td>
        <td>${r.colour || '--'}</td>
        <td>${r.dia || '--'}</td>
        <td>${r.roll || '0'}</td>
        <td>${parseFloat(r.delWt || '0').toFixed(3)}</td>
      </tr>`;
        } else {
            rowsHtml += `<tr class="empty-row"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
        }
    }
    printBody.innerHTML = rowsHtml;
  }
  setTimeout(() => window.print(), 100);
}

function printDeliveryById(id) {
  const deliveries = getDeliveries();
  const d = deliveries.find(x => x.id === id);
  if (!d) return;

  preparePrint('deliveryChallanPrint');
  applyCompanySettingsToPrint('Del');

  document.getElementById('printDelPartyName').textContent = d.partyName || '--';
  document.getElementById('printDelDate').textContent = d.date ? new Date(d.date).toLocaleDateString('en-GB') : '--';
  document.getElementById('printDelDcNo').textContent = d.dcNo || '--';
  document.getElementById('printDelVehicleNo').textContent = d.vehicleNo || '--';
  document.getElementById('printDelTotalRoll').textContent = d.totalRoll || '0';
  document.getElementById('printDelTotalWt').textContent = parseFloat(d.totalDelWt || '0').toFixed(3);

  const firstItem = (d.items && d.items[0]) ? d.items[0] : {};
  document.getElementById('printDelOurInwNo').textContent = firstItem.inwNo || '--';
  document.getElementById('printDelProcess').textContent = firstItem.process || 'COMPACTING';
  document.getElementById('printDelOrderNo').textContent = firstItem.pOrder || '--';
  document.getElementById('printDelLotNo').textContent = firstItem.pLot || '--';

  const receivedEntries = getEntries();
  const matchedEntry = receivedEntries.find(e => String(e.inwNo) === String(firstItem.inwNo));
  if (matchedEntry) {
    document.getElementById('printDelDyDcWt').textContent = parseFloat(matchedEntry.totalDyDcWt || 0).toFixed(3);
    document.getElementById('printDelRecdDcNo2').textContent = matchedEntry.dyeingDcNo || '--';
    document.getElementById('printDelPartyDcNo').textContent = matchedEntry.partyDcNo || '--';
    const dInfo = getDyeingInfoByName(matchedEntry.dyeing);
    document.getElementById('printDelDyeingName').textContent = dInfo ? dInfo.name : (matchedEntry.dyeing || '--');
    document.getElementById('printDelReceivedWt').textContent = parseFloat(matchedEntry.ourWt || 0).toFixed(3);
  } else {
    document.getElementById('printDelDyDcWt').textContent = '0.000';
    document.getElementById('printDelRecdDcNo2').textContent = '--';
    document.getElementById('printDelPartyDcNo').textContent = '--';
    document.getElementById('printDelDyeingName').textContent = '--';
    document.getElementById('printDelReceivedWt').textContent = '0.000';
  }

  let pInfoObj = getPartyInfoByName(d.partyName || '');
  let dPAddress = document.getElementById('printDelPartyAddress');
  let dPGstLine = document.getElementById('printDelPartyGstinLine');
  let dPGst = document.getElementById('printDelPartyGst');

  if (pInfoObj) {
    if (dPAddress) dPAddress.textContent = pInfoObj.address || '';
    if (dPGst && dPGstLine) {
      if (pInfoObj.gstin) {
        dPGst.textContent = pInfoObj.gstin;
        dPGstLine.style.display = 'inline';
      } else {
        dPGstLine.style.display = 'none';
      }
    }
  } else {
    if (dPAddress) dPAddress.textContent = '';
    if (dPGstLine) dPGstLine.style.display = 'none';
  }

  const printBody = document.getElementById('printDelGridBody');
  if (printBody) {
    let rowsHtml = '';
    const items = d.items || [];
    const maxRows = 6;
    for (let i = 0; i < maxRows; i++) {
        if (i < items.length) {
            const r = items[i];
            rowsHtml += `<tr style="height: 24px;">
        <td>${r.pLot || '--'}</td>
        <td style="text-align: left;">${r.fabric || '--'}</td>
        <td>998821</td>
        <td>${r.colour || '--'}</td>
        <td>${r.dia || '--'}</td>
        <td>${r.roll || '0'}</td>
        <td>${parseFloat(r.delWt || '0').toFixed(3)}</td>
      </tr>`;
        } else {
            rowsHtml += `<tr class="empty-row" style="height: 24px;"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
        }
    }
    printBody.innerHTML = rowsHtml;
  }
  setTimeout(() => window.print(), 100);
}

// --- Invoice Functions ---
function getInvoices() {
  try {
    return JSON.parse(localStorage.getItem(INVOICE_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveInvoices(invoices) {
  localStorage.setItem(INVOICE_STORAGE_KEY, JSON.stringify(invoices));
}

function getNextInvoiceNo() {
  let n = parseInt(localStorage.getItem(INVOICE_COUNTER_KEY) || '501', 10);
  localStorage.setItem(INVOICE_COUNTER_KEY, String(n + 1));
  return n;
}

function initInvoice() {
  const btnNew = document.getElementById('btnNewInvoice');
  const btnBack = document.getElementById('btnInvBackToList');
  const searchInput = document.getElementById('invoiceSearch');
  const btnSave = document.getElementById('btnInvSave');
  const btnPrint = document.getElementById('btnInvPrint');
  const btnAddRow = document.getElementById('btnInvAddRow');
  const gstPercent = document.getElementById('invGstPercent');
  const invInwNo = document.getElementById('invInwNo');
  const partySel = document.getElementById('invPartyName');

  if (btnNew) btnNew.addEventListener('click', () => showInvoiceForm(true));
  if (btnBack) btnBack.addEventListener('click', showInvoiceList);
  if (searchInput) searchInput.addEventListener('input', renderInvoiceTable);
  if (btnSave) btnSave.addEventListener('click', saveInvoice);
  if (btnPrint) btnPrint.addEventListener('click', printInvoice);
  if (btnAddRow) btnAddRow.addEventListener('click', addInvoiceRow);
  if (gstPercent) gstPercent.addEventListener('input', updateInvoiceTotals);

  if (invInwNo) {
    invInwNo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const inwNoVal = invInwNo.value.trim();
        if (inwNoVal) {
          lookupAndAddDcToInvoice(inwNoVal);
        }
      }
    });
  }

  if (partySel) {
    partySel.addEventListener('change', updateInvInwList);
  }

  loadFromMongoDB('invoices', INVOICE_STORAGE_KEY).then(() => {
    renderInvoiceTable();
  });
}

function updateInvInwList() {
  const partySel = document.getElementById('invPartyName');
  const partyValue = partySel?.value;
  const partyName = document.getElementById('search_invPartyName')?.value;
  const datalist = document.getElementById('invInwList');
  if (!datalist) return;

  datalist.innerHTML = '';
  if (!partyValue && !partyName) return;

  const entries = getEntries();
  const partyEntries = entries.filter(e => 
    (partyValue && e.partyValue === partyValue) || 
    (partyName && e.party === partyName)
  );

  const inwardNos = [...new Set(partyEntries.map(e => e.inwNo).filter(inw => inw))];
  
  inwardNos.forEach(inw => {
    const opt = document.createElement('option');
    opt.value = inw;
    datalist.appendChild(opt);
  });
}

function lookupAndAddDcToInvoice(inwNo) {
  const tbody = document.getElementById('invItemGridBody');
  if (tbody && tbody.querySelectorAll('tr').length >= 9) {
    alert('Maximum 9 rows allowed per invoice.');
    return;
  }

  const deliveries = getDeliveries();
  const dc = deliveries.find(d => 
    (d.items && d.items.some(it => String(it.inwNo) === String(inwNo))) || 
    String(d.dcNo) === String(inwNo)
  );
  
  if (!dc) {
    alert('No Delivery Challan found matching: ' + inwNo);
    return;
  }

  const item = (dc.items && dc.items.find(it => String(it.inwNo) === String(inwNo))) || (dc.items && dc.items[0]) || {};
  
  const entries = getEntries();
  const matchedEntry = entries.find(e => String(e.inwNo) === String(item.inwNo));

  const fields = {
    invItemDesc: (item.fabric || '') + (item.process ? ' - ' + item.process : ''),
    invItemColour: item.colour || '',
    invItemDia: item.dia || '',
    invItemQty: item.delWt || item.weight || dc.totalDelWt || '0',
    invItemPartyDcNo: matchedEntry?.partyDcNo || '',
    invItemPartyOrder: matchedEntry?.partyOrder || '',
    invItemJobNo: item.inwNo || '',
    invItemDcDate: dc.date ? `${dc.dcNo} ${new Date(dc.date).toLocaleDateString('en-GB')}` : dc.dcNo || ''
  };

  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });

  const invDcNo = document.getElementById('invDcNo');
  if (invDcNo && !invDcNo.value) invDcNo.value = dc.dcNo;

  const invInwNoField = document.getElementById('invInwNo');
  if (invInwNoField) {
    invInwNoField.style.backgroundColor = '#dcfce7';
    setTimeout(() => { 
       invInwNoField.style.backgroundColor = ''; 
       invInwNoField.value = ''; 
       const rateEl = document.getElementById('invItemRate');
      if (rateEl) {
        rateEl.focus();
        rateEl.select();
      }
    }, 500);
  }
}

function showInvoiceList() {
  const listView = document.getElementById('invoiceListView');
  const formView = document.getElementById('invoiceFormView');
  if (listView) listView.style.display = 'block';
  if (formView) formView.style.display = 'none';
  renderInvoiceTable();
}

function showInvoiceForm(reset = true) {
  const listView = document.getElementById('invoiceListView');
  const formView = document.getElementById('invoiceFormView');
  if (listView) listView.style.display = 'none';
  if (formView) formView.style.display = 'block';
  if (reset) resetInvoiceForm();
}

function resetInvoiceForm() {
  const invDate = document.getElementById('invDate');
  const invNo = document.getElementById('invNo');
  if (invDate) invDate.valueAsDate = new Date();
  if (invNo) invNo.value = getNextInvoiceNo();
  ['invPartyName', 'invDcNo', 'invOrderNo', 'invNarration'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = el.tagName === 'SELECT' ? '' : '';
  });
  const tbody = document.getElementById('invItemGridBody');
  if (tbody) tbody.innerHTML = '';
  clearInvoiceInputs();
  updateInvoiceTotals();
}

function renderInvoiceTable() {
  const tbody = document.getElementById('invoiceTableBody');
  const search = (document.getElementById('invoiceSearch')?.value || '').toLowerCase();
  if (!tbody) return;

  const invoices = getInvoices().filter(i => {
    if (!search) return true;
    const s = `${i.invNo} ${i.partyName} ${i.dcNo || ''}`.toLowerCase();
    return s.includes(search);
  });

  tbody.innerHTML = invoices.length ? invoices.map(i => `
    <tr data-id="${i.id}">
      <td>${i.invNo}</td>
      <td>${i.date ? new Date(i.date).toLocaleDateString('en-GB') : '--'}</td>
      <td>${i.partyName || '--'}</td>
      <td>${i.dcNo || '--'}</td>
      <td>₹${i.totalAmount || '0.00'}</td>
      <td><span class="badge-status delivered">Paid</span></td>
      <td class="action-icons">
        <button type="button" title="View" onclick="viewInvoice('${i.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
        <button type="button" title="Edit" onclick="editInvoice('${i.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button type="button" title="Print" onclick="printInvoiceById('${i.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/></svg></button>
        <button type="button" title="Delete" onclick="deleteInvoice('${i.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);padding:24px">No invoices yet. Click "New Invoice" to add.</td></tr>';
}

function viewInvoice(id) {
  const invoices = getInvoices();
  const i = invoices.find(x => x.id === id);
  if (!i) return;
  showInvoiceForm(false);
  populateInvoiceForm(i);
  document.querySelectorAll('#invoiceFormView .form-actions .btn-action').forEach(b => { if (!b.id || !['btnInvPrint', 'btnInvBackToList'].includes(b.id)) b.disabled = true; });
}

function editInvoice(id) {
  const invoices = getInvoices();
  const i = invoices.find(x => x.id === id);
  if (!i) return;
  showInvoiceForm(false);
  populateInvoiceForm(i);
  document.getElementById('invNo').dataset.editId = id;
}

function deleteInvoice(id) {
  if (!confirm('Are you sure you want to delete this invoice?')) return;
  const invoices = getInvoices().filter(x => x.id !== id);
  saveInvoices(invoices);
  deleteFromMongoDB('invoices', id); // Delete from MongoDB
  renderInvoiceTable();
}

function populateInvoiceForm(i) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  set('invDate', i.date);
  set('invNo', i.invNo);
  set('invPartyName', i.partyValue || '');
  set('search_invPartyName', i.partyName || '');
  set('invDcNo', i.dcNo);
  set('invOrderNo', i.orderNo);
  set('invNarration', i.narration);
  const tbody = document.getElementById('invItemGridBody');
  if (tbody && i.items) {
    tbody.innerHTML = '';
    i.items.forEach(it => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${tbody.children.length + 1}</td><td>${it.desc || ''}</td><td>${it.qty || ''}</td><td>${it.rate || ''}</td><td>${it.amount || ''}</td><td><button type="button" class="btn-delete-row">×</button></td>`;
      tr.querySelector('.btn-delete-row').addEventListener('click', () => { tr.remove(); renumberInvoiceRows(); updateInvoiceTotals(); });
      tbody.appendChild(tr);
    });
  }
  updateInvoiceTotals();
}

function addInvoiceRow() {
  const desc = document.getElementById('invItemDesc')?.value?.trim() || '';
  const colour = document.getElementById('invItemColour')?.value?.trim() || '';
  const dia = document.getElementById('invItemDia')?.value || '';
  const qty = document.getElementById('invItemQty')?.value || '0';
  const rate = document.getElementById('invItemRate')?.value || '0';

  const tbody = document.getElementById('invItemGridBody');
  if (!tbody) return;

  const modifyingRow = tbody.querySelector('tr.modifying');
  if (modifyingRow) {
    modifyingRow.cells[1].textContent = desc;
    modifyingRow.cells[2].textContent = colour;
    modifyingRow.cells[3].textContent = dia;
    modifyingRow.cells[4].textContent = qty;
    modifyingRow.cells[5].textContent = rate;
    modifyingRow.cells[6].textContent = (parseFloat(qty) * parseFloat(rate)).toFixed(2);
    modifyingRow.classList.remove('modifying');
    clearInvoiceInputs();
    updateInvoiceTotals();
    return;
  }

  if (!desc && !qty && !rate) return;

  if (tbody.querySelectorAll('tr').length >= 9) {
    alert('Maximum 9 rows allowed per invoice.');
    return;
  }

  const sno = tbody.querySelectorAll('tr').length + 1;
  const amount = (parseFloat(qty) * parseFloat(rate)).toFixed(2);
  
  // Metadata for advanced print layout
  const partyDcNo = document.getElementById('invItemPartyDcNo')?.value || '';
  const partyOrder = document.getElementById('invItemPartyOrder')?.value || '';
  const jobNo = document.getElementById('invItemJobNo')?.value || '';
  const dcDate = document.getElementById('invItemDcDate')?.value || '';

  const tr = document.createElement('tr');
  tr.dataset.partyDcNo = partyDcNo;
  tr.dataset.partyOrder = partyOrder;
  tr.dataset.jobNo = jobNo;
  tr.dataset.dcDate = dcDate;
  
  tr.innerHTML = `<td>${sno}</td><td>${desc}</td><td>${colour}</td><td>${dia}</td><td>${qty}</td><td>${rate}</td><td>${amount}</td><td><button type="button" class="btn-delete-row" title="Delete">×</button></td>`;
  tr.querySelector('.btn-delete-row').addEventListener('click', () => { tr.remove(); renumberInvoiceRows(); updateInvoiceTotals(); });
  tr.addEventListener('dblclick', () => {
    tbody.querySelectorAll('tr').forEach(r => r.classList.remove('modifying'));
    document.getElementById('invItemDesc').value = tr.cells[1].textContent;
    document.getElementById('invItemColour').value = tr.cells[2].textContent;
    document.getElementById('invItemDia').value = tr.cells[3].textContent;
    document.getElementById('invItemQty').value = tr.cells[4].textContent;
    document.getElementById('invItemRate').value = tr.cells[5].textContent;
    tr.classList.add('modifying');
  });
  tbody.appendChild(tr);
  updateInvoiceTotals();
  clearInvoiceInputs();
}

function clearInvoiceInputs() {
  ['invItemDesc', 'invItemColour', 'invItemDia', 'invItemQty', 'invItemRate', 'invItemPartyDcNo', 'invItemPartyOrder', 'invItemJobNo', 'invItemDcDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function renumberInvoiceRows() {
  const tbody = document.getElementById('invItemGridBody');
  if (!tbody) return;
  tbody.querySelectorAll('tr').forEach((tr, i) => { tr.querySelector('td:first-child').textContent = i + 1; });
}

function updateInvoiceTotals() {
  const tbody = document.getElementById('invItemGridBody');
  const subTotal = document.getElementById('invSubTotal');
  const gstPercent = document.getElementById('invGstPercent');
  const gstAmount = document.getElementById('invGstAmount');
  const totalAmount = document.getElementById('invTotalAmount');
  if (!tbody || !subTotal) return;
  let sub = 0;
  tbody.querySelectorAll('tr').forEach(tr => {
    const c = tr.querySelectorAll('td');
    if (c.length >= 7) sub += parseFloat(c[6]?.textContent || 0) || 0;
  });
  subTotal.value = sub.toFixed(2);
  const gst = parseFloat(gstPercent?.value || 0);
  const gstAmt = (sub * gst / 100).toFixed(2);
  if (gstAmount) gstAmount.value = gstAmt;
  if (totalAmount) totalAmount.value = (sub + parseFloat(gstAmt)).toFixed(2);
}

function collectInvoiceData() {
  const rows = [];
  document.querySelectorAll('#invItemGridBody tr').forEach(tr => {
    const c = tr.querySelectorAll('td');
    if (c.length >= 7) {
      rows.push({
        desc: c[1].textContent,
        colour: c[2].textContent,
        dia: c[3].textContent,
        qty: c[4].textContent,
        rate: c[5].textContent,
        amount: c[6].textContent,
        partyDcNo: tr.dataset.partyDcNo || '',
        partyOrder: tr.dataset.partyOrder || '',
        jobNo: tr.dataset.jobNo || '',
        dcDate: tr.dataset.dcDate || ''
      });
    }
  });
  return rows;
}

function saveInvoice() {
  const rows = collectInvoiceData();
  if (!rows.length) { alert('Add at least one item.'); return; }

  const partyInput = document.getElementById('search_invPartyName');
  const partySel = document.getElementById('invPartyName');
  const partyText = partyInput ? partyInput.value : '';
  const subTotal = document.getElementById('invSubTotal')?.value || '0';
  const gstAmount = document.getElementById('invGstAmount')?.value || '0';
  const totalAmount = document.getElementById('invTotalAmount')?.value || '0';

  const invoice = {
    id: 'inv_' + Date.now(),
    invNo: document.getElementById('invNo').value,
    date: document.getElementById('invDate').value,
    partyName: partyText || '--',
    partyValue: partySel?.value,
    dcNo: document.getElementById('invDcNo')?.value,
    orderNo: document.getElementById('invOrderNo')?.value,
    narration: document.getElementById('invNarration')?.value,
    items: rows,
    subTotal,
    gstAmount,
    totalAmount
  };

  const invoices = getInvoices();
  invoices.push(invoice);
  saveInvoices(invoices);
  syncToMongoDB('invoices', invoice); // Sync to MongoDB
  syncCountersToMongoDB(); // Sync updated counters
  showInvoiceList();
}

function printInvoice() {
  preparePrint('invoicePrint');
  const rows = collectInvoiceData();
  if (!rows.length) { alert('Add at least one item before printing.'); return; }
  
  applyCompanySettingsToPrint('Inv');

  const partyInput = document.getElementById('search_invPartyName');
  const pInfo = getPartyInfoByName(partyInput?.value);
  
  // Header Details
  const dateVal = document.getElementById('invDate')?.value;
  document.getElementById('printInvPartyName').textContent = partyInput && partyInput.value ? partyInput.value : '--';
  document.getElementById('printInvPartyAddress').innerHTML = pInfo ? (pInfo.address || '--').replace(/\n/g, '<br>') : '--';
  document.getElementById('printInvPartyGstin').textContent = pInfo && pInfo.gstin ? pInfo.gstin : '--';
  document.getElementById('printInvPartyState').textContent = 'Tamil Nadu';
  document.getElementById('printInvPartyStateCode').textContent = '33';
  document.getElementById('printInvDate').textContent = dateVal ? new Date(dateVal).toLocaleDateString('en-GB') : '--';
  document.getElementById('printInvNo').textContent = document.getElementById('invNo')?.value || '--';

  // Calculations
  const subTotal = parseFloat(document.getElementById('invSubTotal')?.value || 0);
  const gstPercent = parseFloat(document.getElementById('invGstPercent')?.value || 0);
  const totalGst = subTotal * (gstPercent / 100);
  const cgst = totalGst / 2;
  const sgst = totalGst / 2;
  const grandTotalRaw = subTotal + totalGst;
  const grandTotal = Math.round(grandTotalRaw);
  const roundOff = (grandTotal - grandTotalRaw).toFixed(2);

  document.getElementById('printInvSubTotal').textContent = subTotal.toFixed(2);
  document.getElementById('printInvCgst').textContent = cgst.toFixed(2);
  document.getElementById('printInvSgst').textContent = sgst.toFixed(2);
  document.getElementById('printInvIgst').textContent = '0.00';
  document.getElementById('printInvTotalTax').textContent = totalGst.toFixed(2);
  document.getElementById('printInvRoundOff').textContent = roundOff;
  document.getElementById('printInvGrandTotal').textContent = grandTotal.toFixed(2);
  
  document.getElementById('printTaxWords').textContent = convertNumberToWords(totalGst.toFixed(2));
  document.getElementById('printInvWords').textContent = convertNumberToWords(grandTotal.toFixed(2));

  const printBody = document.getElementById('printInvGridBody');
  if (printBody) {
    let totalWt = 0;
    let html = rows.map((r, idx) => {
        const wt = parseFloat(r.qty || 0);
        totalWt += wt;
        return `
      <tr>
        <td>${idx + 1}</td>
        <td>${r.partyDcNo || '0'}</td>
        <td>${r.partyOrder || '0'}</td>
        <td>${r.jobNo || '--'}</td>
        <td>${r.dcDate || '--'}</td>
        <td style="text-align: left;">${r.desc || ''}</td>
        <td>${r.colour || ''}</td>
        <td>${wt.toFixed(3)}</td>
        <td>${parseFloat(r.rate || 0).toFixed(2)}</td>
        <td>${parseFloat(r.amount || 0).toFixed(2)}</td>
      </tr>
    `; }).join('');

    // Pad to 9 rows
    for (let k = rows.length; k < 9; k++) {
      html += `<tr><td>${k + 1}</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`;
    }
    printBody.innerHTML = html;
    document.getElementById('printInvTotalWeight').textContent = totalWt.toFixed(3);
  }
  setTimeout(() => window.print(), 100);
}

function printInvoiceById(id) {
  preparePrint('invoicePrint');
  const invoices = getInvoices();
  const i = invoices.find(x => x.id === id);
  if (!i) return;

  applyCompanySettingsToPrint('Inv');
  const pInfo = getPartyInfoByName(i.partyName);

  document.getElementById('printInvPartyName').textContent = i.partyName || '--';
  document.getElementById('printInvPartyAddress').innerHTML = pInfo ? (pInfo.address || '--').replace(/\n/g, '<br>') : '--';
  document.getElementById('printInvPartyGstin').textContent = pInfo && pInfo.gstin ? pInfo.gstin : '--';
  document.getElementById('printInvPartyState').textContent = 'Tamil Nadu';
  document.getElementById('printInvPartyStateCode').textContent = '33';
  document.getElementById('printInvDate').textContent = i.date ? new Date(i.date).toLocaleDateString('en-GB') : '--';
  document.getElementById('printInvNo').textContent = i.invNo || '--';

  // Calculations
  const subTotal = parseFloat(i.subTotal || 0);
  const totalAmount = parseFloat(i.totalAmount || 0);
  const totalGst = parseFloat(i.gstAmount || 0);
  const cgst = totalGst / 2;
  const sgst = totalGst / 2;
  const grandTotal = Math.round(totalAmount);
  const roundOff = (grandTotal - totalAmount).toFixed(2);

  document.getElementById('printInvSubTotal').textContent = subTotal.toFixed(2);
  document.getElementById('printInvCgst').textContent = cgst.toFixed(2);
  document.getElementById('printInvSgst').textContent = sgst.toFixed(2);
  document.getElementById('printInvIgst').textContent = '0.00';
  document.getElementById('printInvTotalTax').textContent = totalGst.toFixed(2);
  document.getElementById('printInvRoundOff').textContent = roundOff;
  document.getElementById('printInvGrandTotal').textContent = grandTotal.toFixed(2);
  
  document.getElementById('printTaxWords').textContent = convertNumberToWords(totalGst.toFixed(2));
  document.getElementById('printInvWords').textContent = convertNumberToWords(grandTotal.toFixed(2));

  const printBody = document.getElementById('printInvGridBody');
  if (printBody && i.items) {
    let totalWt = 0;
    let html = i.items.map((it, idx) => {
        const wt = parseFloat(it.qty || 0);
        totalWt += wt;
        return `
      <tr>
        <td>${idx + 1}</td>
        <td>${it.partyDcNo || '0'}</td>
        <td>${it.partyOrder || '0'}</td>
        <td>${it.jobNo || '--'}</td>
        <td>${it.dcDate || '--'}</td>
        <td style="text-align: left;">${it.desc || ''}</td>
        <td>${it.colour || ''}</td>
        <td>${wt.toFixed(3)}</td>
        <td>${parseFloat(it.rate || 0).toFixed(2)}</td>
        <td>${parseFloat(it.amount || 0).toFixed(2)}</td>
      </tr>
    `; }).join('');

    // Pad to 9 rows
    for (let k = i.items.length; k < 9; k++) {
      html += `<tr><td>${k + 1}</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`;
    }
    printBody.innerHTML = html;
    document.getElementById('printInvTotalWeight').textContent = totalWt.toFixed(3);
  }
  setTimeout(() => window.print(), 100);
}

// --- Party Master Functions ---

function getPartyInfoByName(name) {
  if (!name || name === '--') return null;
  const parties = getParties();
  return parties.find(p => p.name === name) || null;
}

function shortenAddress(addr) {
  if (!addr) return '';
  // Remove "Contact Person" parts if they exist
  let s = addr.split(/Contact Person:/i)[0].trim();
  // Truncate at "Tirupur" if found
  const tirupurIdx = s.toLowerCase().indexOf('tirupur');
  if (tirupurIdx !== -1) {
    s = s.substring(0, tirupurIdx + 7);
  }
  // Remove trailing commas/dots
  return s.replace(/[,\s.]+$/, '');
}

function getDyeingInfoByName(name) {
  if (!name || name === '--') return null;
  const units = getDyeingUnits();
  return units.find(u => u.name === name) || null;
}

function getParties() {
  try {
    return JSON.parse(localStorage.getItem(PARTY_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveParties(parties) {
  localStorage.setItem(PARTY_STORAGE_KEY, JSON.stringify(parties));
}

function onPartyNameChange() {
  const val = document.getElementById('partyFormName').value.trim().toLowerCase();
  const matched = getParties().find(p => (p.name || '').trim().toLowerCase() === val);
  if (matched) {
    document.getElementById('partyEditId').value = matched.id;
    document.getElementById('partyFormPhone').value = matched.phone || '';
    document.getElementById('partyFormGstin').value = matched.gstin || '';
    document.getElementById('partyFormAddress').value = matched.address || '';
    document.getElementById('partyFormTitle').textContent = 'EDIT PARTY';
  } else {
    document.getElementById('partyEditId').value = '';
    document.getElementById('partyFormTitle').textContent = 'ADD NEW PARTY';
  }
}

function initPartyMaster() {
  const btnNew = document.getElementById('btnNewParty');
  const btnCancel = document.getElementById('btnPartyCancel');
  const btnSave = document.getElementById('btnPartySave');
  const searchInput = document.getElementById('partySearch');
  const partyFormName = document.getElementById('partyFormName');

  if (btnNew) btnNew.addEventListener('click', () => showPartyForm(true));
  if (btnCancel) btnCancel.addEventListener('click', showPartyList);
  if (btnSave) btnSave.addEventListener('click', saveParty);
  if (searchInput) searchInput.addEventListener('input', renderPartyTable);
  if (partyFormName) partyFormName.addEventListener('input', onPartyNameChange);

  // Seed initial parties if missing
  const newParties = [
    { name: 'M/s. A.R.S.KNIT FAPRICS', address: 'SHANTHI THEATEREBACKSIDE, PN ROAD, Tirupur., Contact Person: 5/1/20 MGRNAGAR STREET', phone: '8248518428' },
    { name: 'M/s. A.S GODOWN', address: 'Tirupur.', phone: '' },
    { name: 'M/s. A.S.TEX', address: 'NO:14 A ,MURUGANATHAPURAM,, 3TH STREET,, KONGU MANI ROAD,, Tirupur.', phone: '9092137699.' },
    { name: 'M/s. AADHITHYA FABRICS', address: 'SV COLONY EXTEN, Tirupur., Contact Person: SECOND FLOOR 39-3/26 6HSTREE', phone: '00' },
    { name: 'M/s. Aadiya Appareal', address: 'NO/245 G AMBATGAR NAGAR, NEAR JAINAGAR, AATHUPALAYAM, Tirupur.', phone: '9894899238' },
    { name: 'M/s. AAF ENTERPRISE', address: '(Manufacturer/Exporter of Textile, Shed No:28,Mahia Estate,, Sivagangai Main Road,varichur Post,, Madurai - 625020(TN)', phone: '9786422999' },
    { name: 'M/s. ABIRAMI EXPORTS', address: 'NO.5.C.H.B.BUNK COMPOUND, POOLUVAPATTI, 15.VELAMPALAYAM, Tirupur.', phone: '' },
    { name: 'M/s. AGHARAM CLOTHS', address: '20/310SV COLONY MAIN ROAD, NAVALAR NAGAR, Tirupur., Contact Person: PRASANTH', phone: '8870452292' },
    { name: 'M/s. ANIKHA GARMENTS', address: 'D.NO.7/2A,LUCKY NAGAR 1st STREET,, PITCHAM PALAYAM PUDUR(PO),, KUNNATHUR 638103', phone: '9787938139' },
    { name: 'M/s. ANNAI GARMENTS', address: 'PITCHAM PALAYAM, Tirupur.', phone: '' },
    { name: 'M/s. APARNA EXPORTS', address: '33/A GANNDHI ROAD, ANUPARPALAYAM, PUDUR, Tirupur.', phone: '' },
    { name: 'M/s. ARMSTRONG KNITINGMILLS', address: '61CSAMINATHAPURAM, ANUPARPALAYAM/PO, Tirupur.', phone: '' },
    { name: 'M/s. ARROW EXPORTS', address: 'NO 8 1166A, MUMOORTHYNAGAR, Tirupur., Contact Person: /', phone: '' },
    { name: 'M/s. ASIAN KNIT LINE', address: '0Tirupur.', phone: '' },
    { name: 'M/s. AVR CLOTHS', address: '7/1 4/1, ELANGO NAGAR, SANTHITHEATRE BACK SIDE, Tirupur.', phone: '9843398889' },
    { name: 'M/s. AVR CLOTHS', address: 'ELANGO NAGAR, 3RDCROSS STREET, SHANTHITHEATRE BACKSIDE, Tirupur., Contact Person: 7/1 4/1', phone: '984339889' },
    { name: 'M/s. BEST APPAREALS', address: 'A UNIT OF BEST CORPARATION PVT LTD, 89/2 PADHMAVATHI PURAM, AVINASHI ROAD, Tirupur., Contact Person: A UNIT OF', phone: '9360241477' },
    { name: 'M/s. BLEND AND COTTON', address: 'S.F NO435, SAMINATHAPURAM, ANUPARPALAYAM, Tirupur.', phone: '' },
    { name: 'M/s. BLOSAM KNITS', address: 'S.F NO 272 VELUSAMY COBOUND, RAKIYAPALAYAM POST, AVINASHI, Tirupur.', phone: '' },
    { name: 'M/s. BODYLAND GARMENTS PVTLTD', address: 'SF NO.335.VARATHOTAM, THILAGAR NAGR, 15 VELAMPALAYAM, Tirupur., Contact Person: 04212255337', phone: '' },
    { name: 'M/s. CANTY GARMENTS', address: '34 /SAMINATHAPURAM/2STREET, ANTHRABANK/ ROAD, ANUPARPALAYAM PUDUR, Tirupur.641652', phone: '9894633661' },
    { name: 'M/s. CHIPPY EXPORTS', address: 'NO178 1.A.K.G NAGAR, SREENAGAR WEST, PITCHAMPALAYAM, Tirupur.', phone: '9894045533' },
    { name: 'M/s. CIVIC IMPEX', address: 'Tirupur.', phone: '' },
    { name: 'M/s. CLASSIC COLOURS', address: 'NO-2A,CHANDRAPURAM MANI ROAD,, CHANDRAPURAM,, Tirupur.641604', phone: '' },
    { name: 'M/s. CORAL KNIT WEAR', address: 'MARUTHACHALAPURAM, 1ST SCHOOL STREET, KUMARANANTHAPURAM, Tirupur.', phone: '8925264112' },
    { name: 'M/s. D.R.FABS', address: 'PITCHAMPALAM., Tirupur., Contact Person: 41,SENBAGA NAGAR', phone: '' },
    { name: 'M/s. DOLLAR APPAREALS', address: '13 /60 ADI ROAD, KUMARANATHAPURAM, Tirupur.', phone: '' },
    { name: 'M/s. ESWARAN EXPORTS', address: 'ANAI PUDUR, THIRUMURUGAN POONDI PO, AVINASHI TK, Tirupur.', phone: '' },
    { name: 'M/s. FACCTUM WEARS', address: '12 , KPP GARDEN,, KONGU MAIN ROAD, Tirupur.641607', phone: '044' },
    { name: 'M/s. FACCTWOMEN CLOTHING PVT LTD', address: 'REGD OFFICE 12-KPP GARDEN, KONGU MAIN ROAD, 641602, Tirupur.', phone: '' },
    { name: 'M/s. G.MAC APPAREALS', address: 'VELAMPALAYAM ROAD, Tirupur.', phone: '9025850229' },
    { name: 'M/s. G.S.GARMENTS', address: 'Tirupur.', phone: '' },
    { name: 'M/s. G.V.VENTURES', address: 'MAHAVISNU NAGAR, ANGARIPALAYAM ROAD, Tirupur., Contact Person: S.F.NO/436', phone: '' },
    { name: 'M/s. GANGO GARMENTS', address: 'COLLEGE ROAD, Tirupur., Contact Person: NO-10,VASATHAM NAGAR,', phone: '' },
    { name: 'M/s. GLORY TEXTILES', address: 'Tirupur.', phone: '' },
    { name: 'M/s. GREEN APPAREALS', address: '3/110.A.T COLONY ROAD, TIRU NAGAR MUTTIYANGINARU, PERUMANALLUR, Tirupur.', phone: '9976554444' },
    { name: 'M/s. HARI OM FASHION', address: '394/2 T.N.K STREET, DURAISAMY NAGAR, THIRUMURUGAN POONDI, Tirupur.', phone: '' },
    { name: 'M/s. HARI ZONE GARMENTS', address: 'COLLEGE ROAD, Tirupur.', phone: '4546' },
    { name: 'M/s. HEMA PRIYA', address: 'S.V.COLONY NORTH, Tirupur., Contact Person: JOTHI NAGAR 1ST STREET', phone: '7867963566' },
    { name: 'M/s. Highlook garments', address: 'No 1/650,Neruparachal,, Pooluvapatti po,, Tirupur-641602', phone: 'Highlookgarments@gma' },
    { name: 'M/s. IMAGE GARMENTS', address: 'Tirupur.', phone: '' },
    { name: 'M/s. INDIAN CLOTHS', address: 'S.F .NO.8.JOTHI NAGAR, 1ST STREET OPP60FEET ROAD, P.N.ROAD, Tirupur.', phone: '9715577044.944376022' },
    { name: 'M/s. ISWARYATEXTILES', address: 'Tirupur., Contact Person: THALAVAIPURAM', phone: '9486830831' },
    { name: 'M/s. J.V.OVERSERS EXPORTS', address: 'D.NO.7/2A,Lucky Nayar 1st Street,, Pitchampalayam Pudhur(Post),, Tirupur.641603, Contact Person: "THEERTH TOWER"', phone: '0421-2478283.' },
    { name: 'M/s. JAI KNITING', address: 'SHANTHITHEATRE, BACK SIDE, Tirupur.', phone: '' },
    { name: 'M/s. JAYAM GARMENTS', address: 'NO-18-LIG MUNICIPAL COLONY, COLEGE ROAD, Tirupur., Contact Person: KARTHIK SIR', phone: '9659850500' },
    { name: 'M/s. JAYAM KNITWEAR', address: 'NO 120 NEAR INCOMETAX OFFICE, P.N.ROAD, Tirupur.', phone: '' },
    { name: 'M/s. JAYASAKTHI KNIT WEAR', address: 'AVINASI, SAVUR ROAD, Tirupur.', phone: '' },
    { name: 'M/s. JAYAVARMA TEXTILES PVT LTD', address: 'KUNNATHUR, GOPIE MAIN ROAD, AVINASHI TALUKA, Tirupur., Contact Person: SF NO 175 KURICHI PUDUR', phone: '99' },
    { name: 'M/s. JOSUVA EXPORT', address: 'NO.490/77 (3),SRI GURUVAYURAPPAN NA, BOYAMPALAYAM(SOUTH),, P.N.ROAD,, Tirupur.641602', phone: '9003700397' },
    { name: 'M/s. K.K.FABRICS', address: 'WEST MARIYAMMAN KOVIL STREET, PN ROAD, TIRUPUR, Tirupur., Contact Person: NO.12/148 ELANGO NAGAR', phone: '9942323165' },
    { name: 'M/s. K.K.L.INCORP', address: 'Tirupur.', phone: '' },
    { name: 'M/s. K.S.M FASHION', address: '8 VADIVELNAGAR, MARIAMMANKOVILBACKSIDE, SAMUNDIPURAM, Tirupur., Contact Person: 8', phone: '9790058085' },
    { name: 'M/s. KAY YES TEX', address: 'NO 16/2, M GR R NAGAR, PN ROAD, Tirupur.', phone: '8870808081' },
    { name: 'M/s. KK FABS', address: 'NO 5 4TH STREEET, TNK PURAM, ELANGO NAGAR, Tirupur.', phone: '' },
    { name: 'M/s. KNIT FAIR IINC', address: '4TH CROSS STREET, P.N.ROAD, Tirupur., Contact Person: 3/4,ELANGO NAGER', phone: '' },
    { name: 'M/s. KORES APPAREL', address: 'Tirupur.', phone: '' },
    { name: 'M/s. LOOCUST INCORP', address: 'Tirupur.', phone: '' },
    { name: 'M/s. M K GODOWN', address: 'Tirupur.', phone: '' },
    { name: 'M/s. M/S KADSRESOURCES GARMENTS', address: '513RD FLORIST, SCHOOL STREET MARUTHACHALAPU, KUMARANANTHAPURAM, Tirupur.', phone: '' },
    { name: 'M/s. MAESTRO FASHIONS', address: 'SATHAPPA COMPOUND, HARVEY ROAD, NEWNO.26OID NO.33, Tirupur.', phone: '0421 2230501' },
    { name: 'M/s. MAF APPAREALS', address: 'KARUMARAMPALAYAM, Tirupur.', phone: '' },
    { name: 'M/s. MAF KNITS', address: 'ANGERIPALAYAM, [NEAR MERIDIYAN BUIDING], Tirupur.', phone: '04214333087' },
    { name: 'M/s. MANIVEL GARMENTS', address: '16/17,JOTHI NAGAR,1st STREET, S.V.COLONY MANI ROAD,, P.N.ROAD,, Tirupur.641602', phone: '9994504546' },
    { name: 'M/s. MASS KNIT GARMENTS', address: 'S.F.321/1: SAMINATHAPURAM, 2nd,STREET,ANNUPARPALAYAM, PUDUR, Tirupur.641_652', phone: '0000' },
    { name: 'M/s. MENEKA HOSIERS', address: '49,LAKSHMI NAGAR,, MALLAI STREET,, Tirupur.', phone: '' },
    { name: 'M/s. MIDAS GARMENT', address: '20.28, GANDHI ROAD,, AVINASI MANI ROAD,, ANUPPARPALAYAM(PO),, Tirupur.641652', phone: '' },
    { name: 'M/s. MURUGAN GARMENTS', address: 'D.No.15(3) S.N.V.S.Lay-Out ,, 1st Street ,, KONGU MAIN ROAD,, Tirupur.641607', phone: '' },
    { name: 'M/s. N.N.ROLL GODOWN', address: 'P.N.ROAD,, Tirupur.641602, Contact Person: NO:75, KANNAGI NAGER,2ND STEE', phone: '9843260811.' },
    { name: 'M/s. NANDHIKA KNITING MILLS', address: 'POEMPALAYAM, MUMOORTHI NAGAR, Tirupur.', phone: '' },
    { name: 'M/s. NBS CLOTHING', address: 'Santhi Theatre Back Side,, P.N.Road,, Tirupur-641602, Tirupur., Contact Person: 10/66,Elango Nager,3rd Street', phone: '9843355045' },
    { name: 'M/s. NECTAR APPARELS', address: 'K.CHETTIPALAYAM,DHARAPURAM ROAD,, Tirupur., Contact Person: 23-B VADIVEL RICE MILLCOPOUND', phone: '' },
    { name: 'M/s. NEW LINE EXPORTS', address: 'ANUPARPALAYAM, Tirupur.52', phone: '43543434' },
    { name: 'M/s. NEW MAN EXPORTS', address: '270, MANGALAM ROAD,, OPP. EB OFFICE, PERIYANDIA PALAYAM, TIRUPUR 641 687', phone: '8807097712' },
    { name: 'M/s. NOBLE COLLECTION', address: 'D.NO.6/55, ANNAPOORNALAYOUT, GANTHINAGAR POST, Tirupur.', phone: '9486471324' },
    { name: 'M/s. OM VEERA KNITS', address: '3/689,GANAPATHI NAGAR,, KARUNAI ILLAM ROAD,, S.PERIYAPALAYAM,, Tirupur.641607', phone: '' },
    { name: 'M/s. OMEGA ENTERPRISES', address: 'NO:500 ARUL COMPLEX,, 2nd FLOOR,, P.N.ROAD,, Tirupur.641602', phone: '' },
    { name: 'M/s. P.K.A.FABRICS', address: 'T.S.R.LAYOUT MAIN ROAD,, NO:6/80-83, S.V.COLONY,, Tirupur.', phone: '' },
    { name: 'M/s. PARKAVI CLATHING', address: '60/1/40, NESAVALAR COLONY 2ND STREE, P.N.ROAD,, Tirupur.641602', phone: '9500551809' },
    { name: 'M/s. PARVEEN TEXTILE MILLS', address: 'Tirupur.', phone: '' },
    { name: 'M/s. PIGEONKNITGARMENTS', address: 'S.F.NO.236 HB BUNK, SIRUPOOLUVAPATTI, 15 VELAMPALAYAM, Tirupur.', phone: '' },
    { name: 'M/s. PKA FABRIC', address: 'Tirupur.', phone: '' },
    { name: 'M/s. PKP TEX UNIT 1', address: 'PN ROAD, 60 FEET ROAD, KUMAR NAGAR, Tirupur.', phone: '' },
    { name: 'M/s. POLYFIB CREATION', address: 'NO.5/687 VIGNESH NAGAR, TIRUPUR ROAD, KAIKATTIPUDUR, AVINASHI', phone: '' },
    { name: 'M/s. POPPYS APPARELS', address: 'JEEVA COLONY,, GANDHI NAGAR,, Tirupur.641603, Contact Person: 22/1,ANGERIPALAYAM ROAD,', phone: '0421-4979495' },
    { name: 'M/s. PRESEEKA EXPORTERS', address: 'Tirupur.', phone: '978825550' },
    { name: 'M/s. PSG APPARELS', address: '155,MGR NAGER,THIRUMURUGAN PONDI,, Tirupur.641652', phone: '9894567771' },
    { name: 'M/s. RAVI GODOWN', address: 'Tirupur.', phone: '' },
    { name: 'M/s. RHAMKUMAR IMPEX', address: 'AMMAPALAYAM, Tirupur.', phone: '' },
    { name: 'M/s. S.M.S TEX', address: '1/401 B1,Thottathupalayam, Neruparachal,, pooluvapatti po, Tirupur.2', phone: '' },
    { name: 'M/s. S.N.TEX', address: 'S.F.NO:461, V.S.G.GARDEN,, LAKSHMI THEATRE MANI ROAD,, Tirupur.641603', phone: '' },
    { name: 'M/s. S.V.R.GARMENTS', address: 'OLD NO28NEW NO22, RAJININAGAR2ND STREET, COTTONMILL ROAD, Tirupur.', phone: '' },
    { name: 'M/s. SANTOSH TEXTILE MILL', address: 'PAPPANAICKAN PALAYAM,, Tirupur.641607, Contact Person: 9/22,KATTABOMMAN NAGER,', phone: '' },
    { name: 'M/s. SAPL INDUSTRIES PVT.LTD..', address: 'NO.10/382 K.P.P.GARDEN, KONGU MAIN ROAD, OPP GANAPATHY CHETTIYAR MILL, Tirupur.641 607', phone: '' },
    { name: 'M/s. SASI GODOWN', address: 'Tirupur.', phone: '' },
    { name: 'M/s. SATHYA GARMENTS', address: 'SOWDESHWARI KOVIL STREET, PULLIYAMPATTI, 636459, Tirupur.', phone: '' },
    { name: 'M/s. SHA TRADERS', address: 'Tirupur.', phone: '' },
    { name: 'M/s. SHALINI APPAREALS', address: 'SNVS COMPOUND, KONDAPPA GOUNDAR LAYOUT, KONGUMAINROAD, Tirupur.', phone: '7904369172' },
    { name: 'M/s. SHANA KNITWEAR', address: 'Tirupur.', phone: '' },
    { name: 'M/s. SKETCHLINE APPARELS PVT LTD', address: 'OFF NH 544,, PERUMANALLUR., Tirupur.641666, Contact Person: 99/1,99/2 VALASUPALAYAM PIRIV', phone: '8754723213' },
    { name: 'M/s. SPA FASHIONS', address: '6/2 STATE BANK COLONY,, KONGU NAGAR,, Tirupur.641607', phone: '' },
    { name: 'M/s. SPICE ISLANDS APPAREALS LTD', address: '287/VANNAKADU, KUTHAM PALAYAM., THIRUMURUGANPOONDI, Tirupur.', phone: '' },
    { name: 'M/s. SRE ADHAV TEX', address: 'NO.5(1)/14-A,S.N.V.S.Layout, 1st Street ,, KONGU MAIN ROAD ,, Tirupur.641607', phone: '9894799135' },
    { name: 'M/s. SRI DHARSHINI GARMENTS PRIVATELTD', address: '536/6A,MERKALA THOTTOM(North),, BALAJI NAGAR,POYAMPALAYAM,, POOLUVAPATTI (POST),, Tirupur.641602', phone: '9790017668' },
    { name: 'M/s. SRI KARUPPASAMY TRADING', address: '542-A SIVAKUMAR COMPOUND,, NACHAMMAL COLONY 3RD STREET,, ANDIPALAYAM,MANGALAM ROAD,, Tirupur.641687', phone: '9944461929' },
    { name: 'M/s. sri kuppana garments', address: 'Tirupur.', phone: '' },
    { name: 'M/s. SRI MAHALAKHMI TEXTILES', address: 'Tirupur.', phone: '' },
    { name: 'M/s. SRI NANDHIKA EXPORTS', address: 'M.G.R.NAGER, 7TH STREET . P.N.ROAD, Tirupur., Contact Person: BEHIND SHANTHI THEATER', phone: '94422 38088' },
    { name: 'M/s. SRI RAM COMPACTING', address: 'Tirupur.', phone: '' },
    { name: 'M/s. SRI SAI EXPORTS', address: 'JEEVA COLONY EXTN,, GANDHI NAGAR (PO), Tirupur., Contact Person: 22/1,ANGERIPALAYAM ROAD,', phone: '8608375333' },
    { name: 'M/s. SRI SRI CLOTHING', address: 'KANDAMPALAYAM ROAD,, AVINASHI-641654, Tirupur., Contact Person: S.F.NO:290/8,SEMBIYA NALLUR,', phone: '9842270340' },
    { name: 'M/s. SRI SRI TEX', address: 'SRINIVASAPURAM STREET, AVINASHI, 167 A, Tirupur.', phone: '' },
    { name: 'M/s. SRI SUKRA FABS', address: '23,ELANGO NAGER,3RD CROSS STREET,, NEAR BALA VINAYAGA TEMPLE, P.N.ROAD,, Tirupur.641602', phone: '' },
    { name: 'M/s. SRI VARI GARMENTS', address: 'Tirupur.', phone: '' },
    { name: 'M/s. SRINIVASA GARMENTS', address: 'SHED NO:48,TEKIC NAGAR,, SIDCO, MUTHALIPALAYAM,, Tirupur.', phone: '' },
    { name: 'M/s. SRITIGA COMPACTING', address: 'Tirupur.', phone: '' },
    { name: 'M/s. STAARLIGHT EXPORTERS', address: 'VIGNESWARA NAGAR, POOLUVAPATTI RINGROAD, P-N-ROAD, Tirupur., Contact Person: 175/2A2', phone: '9443700526' },
    { name: 'M/s. STERLING APPAREALS', address: '14/21B TEACHERCOLONY, 2ND STREET, ANGERIPALAYAM ROAD, Tirupur.', phone: '' },
    { name: 'M/s. SUBA VIGNESH FABRICS', address: '16/41,NETHIYAMMAL NAGER,1ST STREET,, 60 FAT ROAD, P.N.ROAD,, Tirupur.641602', phone: '9442248255' },
    { name: 'M/s. SUBASINI COMPACTING', address: 'PN ROAD, Tirupur., Contact Person: COTTONMILLL COMPAND', phone: '' },
    { name: 'M/s. T.M.APPARELS', address: 'FIRST FLOOR,47-2/32A,RAJAJI NAGER,, NEAR PAPATHI AMMAN KOVIL ,, COTTON MILL ROAD,, Tirupur.641602', phone: '9894240588' },
    { name: 'M/s. T.T.FASHIONS', address: 'Tirupur.', phone: '' },
    { name: 'M/s. TEAM CLOTHING', address: 'AVINASHI GOUNDAMPALAYAM,, ANGERIPALAYAM(POST),, TIRUPUR-641603, Tirupur., Contact Person: NO.8/193C(1)-A', phone: '' },
    { name: 'M/s. TEX INDIA GARMENTS', address: 'PERIYA KARUNAI PALAYAM,, MANGALAM ROAD ,, AVINASHI-641654, Tirupur., Contact Person: DOOR NO:2/505(6).F.NO:158 PAL', phone: '' },
    { name: 'M/s. TEXIN INDIA', address: '1/1., PETHICHETIPURAM, EAST STREET, Tirupur.', phone: '' },
    { name: 'M/s. udayam steam', address: 'Tirupur.', phone: '' },
    { name: 'M/s. V .J.FASHION', address: 'COLLAGE ROAD,, Tirupur-641602, Contact Person: 25/2 PATAL COLONY,2nd STREET,', phone: '' },
    { name: 'M/s. VARSHIGA WASHING', address: 'NO.1/489.GANABATHI NAGAR, ABIRAMI THEATER BACK SIDE, POYAMPALAYAM.POOLUVAPATTI [PO], Tirupur.641 602', phone: '' },
    { name: 'M/s. VASTHRAA APPARELS', address: 'Manufacturer And Exporter of knitte, & Woven Garments ,, 2/1,Muthuswamy Gounder Street,, Alandurai,Combatore-641101 Ind', phone: '' },
    { name: 'M/s. VEDHANAYAGI TRADERS', address: 'THIRUMALAI NAGAR, Tirupur.', phone: '' },
    { name: 'M/s. VETRIVELTEX', address: 'Tirupur., Contact Person: AMMAPALAYAM', phone: '' },
    { name: 'M/s. VGK KNIT FINISHERS', address: 'ANGERIPALAYAM,, Tirupur., Contact Person: 8/134, AVINASHI KOUNDANPALAYA', phone: '' },
    { name: 'M/s. VISWA COLLAR', address: 'Tirupur.', phone: '' },
    { name: 'M/s. YOUNGTRENDZ', address: 'CHERAN NAGAR, SENTHIL COMPLEX, RAKKIYAPALAYAM, Tirupur., Contact Person: NO-627 KANGEAYAM ROAD', phone: '' },
    { name: 'M/s. ZEBA KNIT WEAR', address: '43.PROCESS SERVER STREET., B.S.SUNDAR ROAD, Tirupur.641601, Contact Person: /', phone: '0000' },
    { name: 'M/s. ZENITH INTERNATIONAL', address: '6TH STREET,, E.S.I.HOSPITAL BACK SIDE,, KONGU MANI ROAD,, Tirupur., Contact Person: NO:33,T.S.R.LAY-OUT,', phone: '' }
  ];

  let currentParties = getParties();
  let added = false;
  newParties.forEach((np, idx) => {
    if (!currentParties.some(p => p.name === np.name)) {
      currentParties.push({
        id: 'pty_seed_' + Date.now() + '_' + idx,
        name: np.name,
        phone: np.phone,
        gstin: '',
        address: np.address
      });
      added = true;
    }
  });

  if (added) {
    saveParties(currentParties);
    // Optional: bulk sync currentParties to Firestore if needed
    Promise.all(currentParties.map(p => syncToMongoDB('party_master', p))).then(() => {
      loadFromMongoDB('party_master', PARTY_STORAGE_KEY).then(() => {
        renderPartyTable();
        updatePartyDropdowns();
      });
    });
  } else {
    loadFromMongoDB('party_master', PARTY_STORAGE_KEY).then(() => {
      renderPartyTable();
      updatePartyDropdowns();
    });
  }
}

function showPartyList() {
  const listView = document.getElementById('partyListView');
  const formView = document.getElementById('partyFormView');
  if (listView) listView.style.display = 'block';
  if (formView) formView.style.display = 'none';
  renderPartyTable();
}

function showPartyForm(reset = true) {
  const listView = document.getElementById('partyListView');
  const formView = document.getElementById('partyFormView');
  if (listView) listView.style.display = 'none';
  if (formView) formView.style.display = 'block';

  if (reset) {
    document.getElementById('partyEditId').value = '';
    document.getElementById('partyFormName').value = '';
    document.getElementById('partyFormPhone').value = '';
    document.getElementById('partyFormGstin').value = '';
    document.getElementById('partyFormAddress').value = '';
    document.getElementById('partyFormTitle').textContent = 'ADD NEW PARTY';
  }
}

function renderPartyTable() {
  const tbody = document.getElementById('partyTableBody');
  const search = (document.getElementById('partySearch')?.value || '').toLowerCase();
  if (!tbody) return;

  const parties = getParties().filter(p => {
    if (!search) return true;
    const s = `${p.name} ${p.address} ${p.phone}`.toLowerCase();
    return s.includes(search);
  });

  tbody.innerHTML = parties.length ? parties.map(p => `
    <tr>
      <td style="font-weight: 500;">${p.date || '--'}</td>
      <td style="font-weight: 500;">${p.name}</td>
      <td style="color: var(--text-secondary);">${p.address || '--'}</td>
      <td style="color: var(--text-secondary);">${p.phone || '--'}</td>
      <td class="action-icons" style="justify-content: flex-end;">
        <button type="button" title="Edit" onclick="editParty('${p.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button type="button" title="Delete" onclick="deleteParty('${p.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #ef4444;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);padding:24px">No parties found. Click "Add Party" to create one.</td></tr>';
}

function saveParty() {
  const name = document.getElementById('partyFormName').value.trim();
  const phone = document.getElementById('partyFormPhone').value.trim();
  const gstin = document.getElementById('partyFormGstin').value.trim();
  const address = document.getElementById('partyFormAddress').value.trim();
  const editId = document.getElementById('partyEditId').value;

  if (!name) {
    alert('Party Name is required.');
    return;
  }

  const party = {
    id: editId || 'pty_' + Date.now(),
    date: new Date().toISOString().split('T')[0],
    name,
    phone,
    gstin,
    address
  };

  const parties = getParties();
  let updated;
  if (editId) {
    updated = parties.map(p => p.id === editId ? party : p);
  } else {
    updated = [...parties, party];
  }

  saveParties(updated);
  syncToMongoDB('party_master', party); // Sync to MongoDB
  showPartyList();
  updatePartyDropdowns();
}

function editParty(id) {
  const parties = getParties();
  const p = parties.find(x => x.id === id);
  if (!p) return;

  showPartyForm(false);
  document.getElementById('partyEditId').value = p.id;
  document.getElementById('partyFormName').value = p.name;
  document.getElementById('partyFormPhone').value = p.phone || '';
  document.getElementById('partyFormGstin').value = p.gstin || '';
  document.getElementById('partyFormAddress').value = p.address || '';
  document.getElementById('partyFormTitle').textContent = 'EDIT PARTY';
}

function deleteParty(id) {
  if (!confirm('Are you sure you want to delete this party?')) return;
  const parties = getParties().filter(x => x.id !== id);
  saveParties(parties);
  deleteFromMongoDB('party_master', id); // Delete from MongoDB
  renderPartyTable();
  updatePartyDropdowns();
}

// --- Custom Searchable Dropdown Helper ---
function setupCustomDropdown(wrapperId, searchId, hiddenId, optionsContainerId, items) {
  const wrapper = document.getElementById(wrapperId);
  const searchEl = document.getElementById(searchId);
  const hiddenEl = document.getElementById(hiddenId);
  const optionsEl = document.getElementById(optionsContainerId);
  if (!wrapper || !searchEl || !hiddenEl || !optionsEl) return;
  if (wrapper._dropdownReady) { wrapper._refreshDropdown(items || []); return; }

  const selectEl = wrapper.querySelector('.custom-select');
  let allItems = items || [];

  function openDrop() { if (selectEl) selectEl.classList.add('open'); }
  function closeDrop() { if (selectEl) selectEl.classList.remove('open'); }

  function renderOptions(filter) {
    const q = (filter || '').toLowerCase();
    const filtered = allItems.filter(i => i.label.toLowerCase().includes(q));
    optionsEl.innerHTML = filtered.length
      ? filtered.map(i => `<div class="custom-option" data-value="${i.value}" data-label="${i.label}">${i.label}</div>`).join('')
      : '<div class="custom-option" style="color:var(--text-secondary);cursor:default;">No results</div>';
    optionsEl.querySelectorAll('.custom-option[data-value]').forEach(opt => {
      opt.addEventListener('mousedown', e => {
        e.preventDefault();
        searchEl.value = opt.dataset.label;
        hiddenEl.value = opt.dataset.value;
        closeDrop();
      });
    });
  }

  searchEl.addEventListener('focus', () => { renderOptions(searchEl.value); openDrop(); });
  searchEl.addEventListener('input', () => { renderOptions(searchEl.value); openDrop(); hiddenEl.value = ''; });
  searchEl.addEventListener('blur', () => { setTimeout(closeDrop, 200); });

  wrapper._dropdownReady = true;
  wrapper._dropdownItems = allItems;
  wrapper._refreshDropdown = function (newItems) { allItems = newItems; wrapper._dropdownItems = newItems; };
}

function updatePartyDropdowns() {
  const parties = getParties();
  const items = parties.map(p => ({ value: p.id, label: p.name }));

  // Populate datalist for auto-fill in Add Party form
  const datalist = document.getElementById('partyNamesList');
  if (datalist) {
    datalist.innerHTML = parties.map(p => `<option value="${p.name}">`).join('');
  }

  // Setup or refresh all party dropdowns
  ['partyName', 'delPartyName', 'invPartyName'].forEach(hiddenId => {
    const wrapperId = 'wrapper_' + hiddenId;
    const searchId = 'search_' + hiddenId;
    const optionsId = 'options_' + hiddenId;
    const wrapper = document.getElementById(wrapperId);
    if (wrapper && wrapper._refreshDropdown) {
      wrapper._refreshDropdown(items);
    } else {
      setupCustomDropdown(wrapperId, searchId, hiddenId, optionsId, items);
    }
  });
}

// --- Dyeing Master Functions ---

function getDyeingUnits() {
  try {
    return JSON.parse(localStorage.getItem(DYEING_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveDyeingUnits(units) {
  localStorage.setItem(DYEING_STORAGE_KEY, JSON.stringify(units));
}

function initDyeingMaster() {
  const btnNew = document.getElementById('btnNewDyeing');
  const btnCancel = document.getElementById('btnDyeingCancel');
  const btnSave = document.getElementById('btnDyeingSave');
  const searchInput = document.getElementById('dyeingSearch');

  if (btnNew) btnNew.addEventListener('click', () => showDyeingForm(true));
  if (btnCancel) btnCancel.addEventListener('click', showDyeingList);
  if (btnSave) btnSave.addEventListener('click', saveDyeingUnit);
  if (searchInput) searchInput.addEventListener('input', renderDyeingTable);

  loadFromMongoDB('dyeing_master', DYEING_STORAGE_KEY).then(() => {
    renderDyeingTable();
    updateDyeingDropdowns();
  });
}

function showDyeingList() {
  const listView = document.getElementById('dyeingListView');
  const formView = document.getElementById('dyeingFormView');
  if (listView) listView.style.display = 'block';
  if (formView) formView.style.display = 'none';
  renderDyeingTable();
}

function showDyeingForm(reset = true) {
  const listView = document.getElementById('dyeingListView');
  const formView = document.getElementById('dyeingFormView');
  if (listView) listView.style.display = 'none';
  if (formView) formView.style.display = 'block';

  if (reset) {
    document.getElementById('dyeingEditId').value = '';
    document.getElementById('dyeingFormName').value = '';
    document.getElementById('dyeingFormPhone').value = '';
    document.getElementById('dyeingFormAddress').value = '';
    document.getElementById('dyeingFormTitle').textContent = 'ADD NEW DYEING UNIT';
  }
}

function renderDyeingTable() {
  const tbody = document.getElementById('dyeingTableBody');
  const search = (document.getElementById('dyeingSearch')?.value || '').toLowerCase();
  if (!tbody) return;

  const units = getDyeingUnits().filter(p => {
    if (!search) return true;
    const s = `${p.name} ${p.address} ${p.phone}`.toLowerCase();
    return s.includes(search);
  });

  tbody.innerHTML = units.length ? units.map(p => `
    <tr>
      <td style="font-weight: 500;">${p.name}</td>
      <td style="color: var(--text-secondary);">${p.address || '--'}</td>
      <td style="color: var(--text-secondary);">${p.phone || '--'}</td>
      <td class="action-icons" style="justify-content: flex-end;">
        <button type="button" title="Edit" onclick="editDyeingUnit('${p.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button type="button" title="Delete" onclick="deleteDyeingUnit('${p.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #ef4444;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);padding:24px">No dyeing units found. Click "Add Dyeing" to create one.</td></tr>';
}

function saveDyeingUnit() {
  const name = document.getElementById('dyeingFormName').value.trim();
  const phone = document.getElementById('dyeingFormPhone').value.trim();
  const address = document.getElementById('dyeingFormAddress').value.trim();
  const editId = document.getElementById('dyeingEditId').value;

  if (!name) {
    alert('Unit Name is required.');
    return;
  }

  const unit = {
    id: editId || 'dy_' + Date.now(),
    name,
    phone,
    address
  };

  const units = getDyeingUnits();
  let updated;
  if (editId) {
    updated = units.map(p => p.id === editId ? unit : p);
  } else {
    updated = [...units, unit];
  }

  saveDyeingUnits(updated);
  syncToMongoDB('dyeing_master', unit); // Sync to MongoDB
  showDyeingList();
  updateDyeingDropdowns();
}

function editDyeingUnit(id) {
  const units = getDyeingUnits();
  const p = units.find(x => x.id === id);
  if (!p) return;

  showDyeingForm(false);
  document.getElementById('dyeingEditId').value = p.id;
  document.getElementById('dyeingFormName').value = p.name;
  document.getElementById('dyeingFormPhone').value = p.phone || '';
  document.getElementById('dyeingFormAddress').value = p.address || '';
  document.getElementById('dyeingFormTitle').textContent = 'EDIT DYEING UNIT';
}

function deleteDyeingUnit(id) {
  if (!confirm('Are you sure you want to delete this dyeing unit?')) return;
  const units = getDyeingUnits().filter(x => x.id !== id);
  saveDyeingUnits(units);
  deleteFromMongoDB('dyeing_master', id); // Delete from MongoDB
  renderDyeingTable();
  updateDyeingDropdowns();
}

function updateDyeingDropdowns() {
  const units = getDyeingUnits();
  const items = units.map(p => ({ value: p.id, label: p.name }));

  const wrapperId = 'wrapper_dyeingName';
  const wrapper = document.getElementById(wrapperId);
  if (wrapper && wrapper._refreshDropdown) {
    wrapper._refreshDropdown(items);
  } else {
    setupCustomDropdown(wrapperId, 'search_dyeingName', 'dyeingName', 'options_dyeingName', items);
  }
}

// --- Company Settings Functions ---

const defaultSettings = {
  name: 'VSS DC MANAGEMENT',
  tagline: 'Finishing & Processing Unit',
  address: 'Tirupur, Tamil Nadu',
  phone: '9876543210',
  email: 'info@vssdc.com',
  gst: '33XXXXX1234X1Z5'
};

function getCompanySettings() {
  try {
    const data = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
    return data || defaultSettings;
  } catch {
    return defaultSettings;
  }
}

function initCompanySettings() {
  const s = getCompanySettings();
  const els = {
    name: document.getElementById('settingCompanyName'),
    tagline: document.getElementById('settingTagline'),
    address: document.getElementById('settingAddress'),
    phone: document.getElementById('settingPhone'),
    email: document.getElementById('settingEmail'),
    gst: document.getElementById('settingGst')
  };

  if (els.name) els.name.value = s.name || '';
  if (els.tagline) els.tagline.value = s.tagline || '';
  if (els.address) els.address.value = s.address || '';
  if (els.phone) els.phone.value = s.phone || '';
  if (els.email) els.email.value = s.email || '';
  if (els.gst) els.gst.value = s.gst || '';

  const btnSave = document.getElementById('btnSettingSave');
  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const newSettings = {
        id: 'app_settings',
        name: els.name.value?.trim() || '',
        tagline: els.tagline.value?.trim() || '',
        address: els.address.value?.trim() || '',
        phone: els.phone.value?.trim() || '',
        email: els.email.value?.trim() || '',
        gst: els.gst.value?.trim() || ''
      };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
      await syncToMongoDB('settings', newSettings);
      alert('Company Settings Saved and Synchronized Successfully!');
    });
  }

  // Load latest settings from Firestore
  loadFromMongoDB('settings', SETTINGS_STORAGE_KEY).then(remote => {
    if (remote && remote.length > 0) {
      const s = remote.find(x => x.id === 'app_settings') || remote[0];
      if (els.name) els.name.value = s.name || '';
      if (els.tagline) els.tagline.value = s.tagline || '';
      if (els.address) els.address.value = s.address || '';
      if (els.phone) els.phone.value = s.phone || '';
      if (els.email) els.email.value = s.email || '';
      if (els.gst) els.gst.value = s.gst || '';
    }
  });
}

function applyCompanySettingsToPrint(type = '') {
  const s = getCompanySettings();
  if (type === 'Inv') {
    const nameEl = document.getElementById('printInvCompany');
    const taglineEl = document.getElementById('printInvTagline');
    const addrEl = document.getElementById('printInvAddress');
    const gstEl = document.getElementById('printCompanyGst');
    const stateEl = document.getElementById('printCompanyState');
    const codeEl = document.getElementById('printCompanyStateCode');

    if (nameEl) nameEl.textContent = s.name.toUpperCase();
    if (taglineEl) taglineEl.textContent = s.tagline ? `( ${s.tagline} )` : '';
    if (addrEl) addrEl.innerHTML = `${s.address}<br>MOBILE: ${s.phone}`;
    if (gstEl) gstEl.textContent = s.gst;
    if (stateEl) stateEl.textContent = 'TAMIL NADU';
    if (codeEl) codeEl.textContent = '33';
    return;
  }
    
  const nameEl = document.getElementById(`print${type}Company`);
  const addrEl = document.getElementById(`print${type}Address`);
  if (nameEl) nameEl.textContent = s.name.toUpperCase();
  if (addrEl) {
    const parts = [s.tagline, s.address, `Ph: ${s.phone}`, s.email].filter(Boolean);
    addrEl.innerHTML = parts.join('<br>') + `<br>No: ${s.gst}`;
  }
}

// --- Global Enter Key Navigation ---
function setupEnterKeyNavigation() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
        // Prevent default form submission or page reload on enter
        e.preventDefault();

        // Get all focusable input elements in the current active form view
        const activeView = target.closest('.inward-form') || target.closest('.inward-form-view');
        if (!activeView) return;

        // Select all inputs, selects, and textareas that are not hidden, disabled, or readonly
        const focusables = Array.from(activeView.querySelectorAll('input:not([type="hidden"]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]):not([readonly]), button.btn-add-row, button.btn-action'));

        const index = focusables.indexOf(target);
        if (index > -1 && index < focusables.length - 1) {
          focusables[index + 1].focus();

          // if it's an input text type, we can optionally select the text for easy overwriting
          if (focusables[index + 1].tagName === 'INPUT') {
            focusables[index + 1].select();
          }
        }
      }
    }
  });
}


// --- Compacting Attendance System ---

function initAttendanceSystem() {
  const dateInput = document.getElementById('attDateSelector');
  const today = new Date().toISOString().split('T')[0];

  if (!dateInput.value) {
    dateInput.value = today;
  }

  setInterval(updateLiveClock, 1000);
  updateLiveClock();

  Promise.all([
    loadFromMongoDB('staff', ATT_STAFF_KEY),
    loadFromMongoDB('attendance', ATT_DATA_KEY)
  ]).then(() => {
    renderAttendanceTable(dateInput.value);
  });

  document.getElementById('attBtnAddStaff').addEventListener('click', addStaff);
  document.getElementById('attBtnViewReport').addEventListener('click', showReport);
  document.getElementById('attBtnCloseReport').addEventListener('click', () => {
    document.getElementById('attReportModal').classList.remove('active');
  });

  dateInput.addEventListener('change', (e) => {
    renderAttendanceTable(e.target.value);
  });
}

function updateLiveClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const timeEl = document.getElementById('attLiveTime');
  const dateEl = document.getElementById('attLiveDate');

  if (timeEl) timeEl.textContent = timeStr;
  if (dateEl) dateEl.textContent = dateStr;
}

function getStaff() {
  try { return JSON.parse(localStorage.getItem(ATT_STAFF_KEY) || '[]'); }
  catch { return []; }
}

function getAttData() {
  try { return JSON.parse(localStorage.getItem(ATT_DATA_KEY) || '{}'); }
  catch { return {}; }
}

function saveAttData(data) {
  localStorage.setItem(ATT_DATA_KEY, JSON.stringify(data));
}

function addStaff() {
  const nameInput = document.getElementById('attStaffName');
  const salaryInput = document.getElementById('attStaffSalary');

  const name = nameInput.value.trim();
  const salary = parseInt(salaryInput.value, 10);

  if (!name || isNaN(salary) || salary <= 0) {
    alert('Please enter a valid worker name and daily salary.');
    return;
  }

  const staff = getStaff();
  if (staff.some(s => s.name.toLowerCase() === name.toLowerCase())) {
    alert('Worker already exists.');
    return;
  }

  const newStaff = { id: Date.now().toString(), name, salary };
  staff.push(newStaff);
  localStorage.setItem(ATT_STAFF_KEY, JSON.stringify(staff));

  syncToMongoDB('staff', newStaff); // Sync worker to MongoDB

  nameInput.value = '';
  salaryInput.value = '';

  const currentDate = document.getElementById('attDateSelector').value;
  renderAttendanceTable(currentDate);
}

function deleteStaff(id) {
  if (!confirm('Remove this worker? Their past data will remain in reports but they will be removed from future attendance lists.')) return;

  let staff = getStaff();
  staff = staff.filter(s => s.id !== id);
  localStorage.setItem(ATT_STAFF_KEY, JSON.stringify(staff));
  
  deleteFromMongoDB('staff', id); // Delete from MongoDB

  const currentDate = document.getElementById('attDateSelector').value;
  renderAttendanceTable(currentDate);
}

function renderAttendanceTable(dateStr) {
  const tbody = document.getElementById('attTableBody');
  if (!tbody) return;

  const staff = getStaff();
  let allData = getAttData();

  if (!allData[dateStr]) {
    allData[dateStr] = {};
  }
  const dayData = allData[dateStr];

  tbody.innerHTML = '';

  if (staff.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="6" style="text-align: center; color: #6b7280; padding: 20px;">No workers added yet.</td>';
    tbody.appendChild(tr);
    return;
  }

  staff.forEach(worker => {
    const wData = dayData[worker.id] || { morning: false, evening: false, advance: 0 };

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 500;">${worker.name}</td>
      <td>₹${worker.salary}</td>
      <td><input type="checkbox" class="att-mrng-chk" data-wid="${worker.id}" ${wData.morning ? 'checked' : ''}></td>
      <td><input type="checkbox" class="att-evng-chk" data-wid="${worker.id}" ${wData.evening ? 'checked' : ''}></td>
      <td><input type="number" class="att-adv-inp" data-wid="${worker.id}" value="${wData.advance || ''}" min="0" placeholder="0"></td>
      <td style="text-align: center;">
        <button class="att-delete-btn" title="Remove Worker" data-wid="${worker.id}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Attach auto-save listeners
  tbody.querySelectorAll('.att-mrng-chk, .att-evng-chk, .att-adv-inp').forEach(el => {
    el.addEventListener('change', () => autoSaveAttendance(dateStr));
  });

  tbody.querySelectorAll('.att-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const wid = e.currentTarget.getAttribute('data-wid');
      deleteStaff(wid);
    });
  });
}

function autoSaveAttendance(dateStr) {
  const staff = getStaff();
  const allData = getAttData();

  if (!allData[dateStr]) {
    allData[dateStr] = {};
  }

  staff.forEach(worker => {
    const mrngEl = document.querySelector(`.att-mrng-chk[data-wid="${worker.id}"]`);
    const evngEl = document.querySelector(`.att-evng-chk[data-wid="${worker.id}"]`);
    const advEl = document.querySelector(`.att-adv-inp[data-wid="${worker.id}"]`);

    if (mrngEl && evngEl && advEl) {
      const advVal = parseInt(advEl.value, 10);
      allData[dateStr][worker.id] = {
        morning: mrngEl.checked,
        evening: evngEl.checked,
        advance: isNaN(advVal) ? 0 : advVal
      };
    }
  });

  saveAttData(allData);
  
  // Sync this specific date's data to MongoDB
  syncToMongoDB('attendance', { id: dateStr, records: allData[dateStr] });
}

function showReport() {
  const staff = getStaff();
  const allData = getAttData();
  const reportBody = document.getElementById('attReportBody');

  let html = '';

  staff.forEach(worker => {
    let totalFull = 0;
    let totalHalf = 0;
    let totalAdvance = 0;
    let totalEarned = 0;

    let advancedDaysHTML = '';

    Object.keys(allData).sort().forEach(dateStr => {
      const dayDataForWorker = allData[dateStr][worker.id];
      if (!dayDataForWorker) return;

      const isMorning = dayDataForWorker.morning;
      const isEvening = dayDataForWorker.evening;
      const advance = dayDataForWorker.advance || 0;

      let workType = 'Absent';
      let earnedToday = 0;

      if (isMorning && isEvening) {
        workType = 'Full Day';
        totalFull++;
        earnedToday = worker.salary;
      } else if (isMorning || isEvening) {
        workType = 'Half Day';
        totalHalf++;
        earnedToday = worker.salary / 2;
      }

      totalAdvance += advance;
      totalEarned += earnedToday;

      if (advance > 0 && workType !== 'Absent') {
        const displayDate = new Date(dateStr).toLocaleDateString('en-GB');
        advancedDaysHTML += `
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 8px 0; font-size: 0.9rem;">${displayDate}</td>
            <td style="padding: 8px 0; font-size: 0.9rem;">${workType}</td>
            <td style="padding: 8px 0; font-size: 0.9rem; font-weight: 500; color: #ef4444;">₹${advance}</td>
          </tr>
        `;
      }
    });

    const balance = totalEarned - totalAdvance;
    const balanceColor = balance >= 0 ? '#10b981' : '#ef4444';

    html += `
      <div class="worker-report-card">
        <div class="worker-report-name">${worker.name}</div>
        <div class="worker-report-stats">
          <div class="stat-box"><div class="stat-value">${totalFull}</div><div class="stat-label">Full Days</div></div>
          <div class="stat-box"><div class="stat-value">${totalHalf}</div><div class="stat-label">Half Days</div></div>
          <div class="stat-box"><div class="stat-value" style="color: #3b82f6;">₹${totalEarned}</div><div class="stat-label">Total Earned</div></div>
          <div class="stat-box"><div class="stat-value" style="color: #ef4444;">₹${totalAdvance}</div><div class="stat-label">Total Adv.</div></div>
        </div>
        <div style="font-weight: bold; margin-bottom: 10px; color: ${balanceColor};">
          Balance To Pay: ₹${balance}
        </div>
        ${advancedDaysHTML ? `
          <div style="font-size: 0.85rem; font-weight: bold; color: #6b7280; text-transform: uppercase;">Advance History</div>
          <table style="width: 100%; border-collapse: collapse; text-align: left; margin-bottom: 10px;">
            ${advancedDaysHTML}
          </table>
        ` : `<div style="font-size: 0.85rem; color: #6b7280; font-style: italic;">No advances on working days.</div>`}
      </div>
    `;
  });

  if (html === '') {
    html = '<p>No staff to generate report for.</p>';
  }

  reportBody.innerHTML = html;
  document.getElementById('attReportModal').classList.add('active');
}
// --- Password Modal Functions ---
function closePasswordModal() {
  const modal = document.getElementById('passwordModal');
  if (modal) modal.classList.remove('active');
  // Redirect back or stay on current page? Usually stay.
  // window.location.hash = '#page-dashboard'; // Optional redirect
}

function verifyPartyPassword() {
  const input = document.getElementById('partyPasswordInput');
  const error = document.getElementById('passwordError');
  if (input && input.value === 'admin12') { // Based on login.html hint
    const modal = document.getElementById('passwordModal');
    if (modal) modal.classList.remove('active');
    if (error) error.style.display = 'none';
    input.value = '';
  } else {
    if (error) error.style.display = 'block';
  }
}

function convertNumberToWords(amount) {
    if (amount == 0) return 'Zero Only';
    var words = new Array();
    words[0] = '';
    words[1] = 'One';
    words[2] = 'Two';
    words[3] = 'Three';
    words[4] = 'Four';
    words[5] = 'Five';
    words[6] = 'Six';
    words[7] = 'Seven';
    words[8] = 'Eight';
    words[9] = 'Nine';
    words[10] = 'Ten';
    words[11] = 'Eleven';
    words[12] = 'Twelve';
    words[13] = 'Thirteen';
    words[14] = 'Fourteen';
    words[15] = 'Fifteen';
    words[16] = 'Sixteen';
    words[17] = 'Seventeen';
    words[18] = 'Eighteen';
    words[19] = 'Nineteen';
    words[20] = 'Twenty';
    words[30] = 'Thirty';
    words[40] = 'Forty';
    words[50] = 'Fifty';
    words[60] = 'Sixty';
    words[70] = 'Seventy';
    words[80] = 'Eighty';
    words[90] = 'Ninety';

    amount = amount.toString();
    var atemp = amount.split('.');
    var number = atemp[0].split(',').join('');
    var n_after_dot = atemp[1] ? atemp[1] : '00';
    var n_length = number.length;
    var words_string = '';
    if (n_length <= 9) {
        var n_array = new Array(0, 0, 0, 0, 0, 0, 0, 0, 0);
        var received_n_array = new Array();
        for (var i = 0; i < n_length; i++) {
            received_n_array[i] = number.substr(i, 1);
        }
        for (var i = 9 - n_length, j = 0; i < 9; i++, j++) {
            n_array[i] = received_n_array[j];
        }
        for (var i = 0, j = 1; i < 9; i++, j++) {
            if (i == 0 || i == 2 || i == 4 || i == 7) {
                if (n_array[i] == 1) {
                    n_array[j] = 10 + parseInt(n_array[j]);
                    n_array[i] = 0;
                }
            }
        }
        var val = '';
        for (var i = 0; i < 9; i++) {
            if (i == 0 || i == 2 || i == 4 || i == 7) {
                val = n_array[i] * 10;
            } else {
                val = n_array[i];
            }
            if (val != 0) {
                words_string += words[val] + ' ';
            }
            if ((i == 1 && val != 0) || (i == 0 && val != 0 && n_array[i + 1] == 0)) {
                words_string += 'Crores ';
            }
            if ((i == 3 && val != 0) || (i == 2 && val != 0 && n_array[i + 1] == 0)) {
                words_string += 'Lakhs ';
            }
            if ((i == 5 && val != 0) || (i == 4 && val != 0 && n_array[i + 1] == 0)) {
                words_string += 'Thousand ';
            }
            if (i == 6 && val != 0 && (n_array[i + 1] != 0 && n_array[i + 2] != 0)) {
                words_string += 'Hundred and ';
            } else if (i == 6 && val != 0) {
                words_string += 'Hundred ';
            }
        }
        words_string = words_string.split('  ').join(' ');
    }

    let paise_string = '';
    if (parseInt(n_after_dot) > 0) {
        if (n_after_dot.length == 1) n_after_dot += '0';
        if (n_after_dot.length > 2) n_after_dot = n_after_dot.substring(0, 2);

        var p_num = parseInt(n_after_dot);
        if (p_num > 0) {
            paise_string = ' and Paise ';
            if (p_num < 20) {
                paise_string += words[p_num];
            } else {
                paise_string += words[Math.floor(p_num / 10) * 10] + ' ' + (words[p_num % 10] || '');
            }
        }
    }

    return words_string.trim() + paise_string + ' Only';
}

// Global Exposures for index.html onclick handlers
window.addRowFromInputs = addRowFromInputs;
window.saveInwardEntry = saveInwardEntry;
window.collectFormData = collectFormData;
window.printReceivedChallan = printReceivedChallan;
window.showReceivedList = showReceivedList;
window.navigateTo = navigateTo;
window.navigate = navigateTo; // Alias
window.addDeliveryRowFromInputs = addDeliveryRowFromInputs;
window.saveDelivery = saveDelivery;
window.syncAllToFirebase = syncAllToFirebase;
window.closePasswordModal = closePasswordModal;
window.verifyPartyPassword = verifyPartyPassword;
window.editEntry = editEntry;
window.deleteEntry = deleteEntry;
window.viewEntry = viewEntry;
window.printEntry = printEntry;
window.editDelivery = editDelivery;
window.deleteDelivery = deleteDelivery;
window.viewDelivery = viewDelivery;
window.editInvoice = editInvoice;
window.deleteInvoice = deleteInvoice;
window.viewInvoice = viewInvoice;
window.editParty = editParty;
window.deleteParty = deleteParty;
window.editDyeingUnit = editDyeingUnit;
window.deleteDyeingUnit = deleteDyeingUnit;

// User dropdown and logout logic
document.addEventListener('DOMContentLoaded', () => {
    const userAvatar = document.getElementById('userAvatar');
    const userDropdown = document.getElementById('userDropdown');
    const btnLogout = document.getElementById('btnLogout');

    if (userAvatar && userDropdown && btnLogout) {
        userAvatar.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!userDropdown.contains(e.target) && e.target !== userAvatar) {
                userDropdown.classList.remove('show');
            }
        });

        btnLogout.addEventListener('click', () => {
            localStorage.removeItem('vss_logged_in');
            window.location.href = 'login.html';
        });
    }
});

window.showPartyForm = showPartyForm;
window.saveParty = saveParty;
window.showPartyList = showPartyList;

window.onPartyNameChange = onPartyNameChange;

window.showDeliveryForm = showDeliveryForm;
window.saveDelivery = saveDelivery;
window.showDeliveryList = showDeliveryList;

window.printDeliveryChallan = printDeliveryChallan;

window.showInvoiceForm = showInvoiceForm;
window.saveInvoice = saveInvoice;
window.showInvoiceList = showInvoiceList;
window.printInvoice = printInvoice;
