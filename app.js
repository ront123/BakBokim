// app.js – Bakbokim WhatsApp Order Sender
// Follows AGENTS.md: clean, modular, well-commented, no external build step.

// ══════════════════════════════════════════════
// CONSTANTS & STORAGE
// ══════════════════════════════════════════════
const STORAGE_SETTINGS = 'bakbokim_settings_v5'; // bump version = force template reset
const STORAGE_SENT     = 'bakbokim_sent_v2';
const STORAGE_THEME    = 'bakbokim_theme';

const DEFAULT_TEMPLATE = `Hello {{name}} 👋
This is {{senderName}} from *Bakbokim Project* in {{city}}. Just letting you know that your order {{orderNum}} is ready for collection!

*Order Summary:*
{{items}}

You can grab a pickup slot at this link:
📅 {{calendarLink}}
Don't worry about being precise; it's mostly so I can block out the time for you.

🏠 *Pickup Address:* _{{address}}, {{city}}_

---
שלום {{name}} 👋
{{senderName}} מ-*פרויקט בקבוקים* ב{{city}} כאן. ההזמנה שלך מספר {{orderNum}} מוכנה לאיסוף!

*פירוט ההזמנה:*
{{items}}

ניתן לקבוע מועד איסוף בקישור:
📅 {{calendarLink}}
אל דאגה אם צריך לשנות את הזמן או השעה, ניתן לעשות זאת שוב ביומן.

🏠 *כתובת לאיסוף:* _{{address}}, {{city}}_`;

const DEFAULT_SETTINGS = {
  senderName:    'רון',
  projectName:   'Bakbokim Project',
  city:          'נתניה',
  pickupAddress: 'סמילנסקי 79',
  calendarLink:  'https://calendar.app.google/npZiCDk8WMTdNdY6',
  template:      DEFAULT_TEMPLATE,
};

// ══════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════
let settings   = loadSettings();
let sentStatus = loadSent();    // { [uniqueKey]: { sentAt, count } }
let headers    = [];
let rows       = [];            // Array of row-objects keyed by header
let activeFilter = 'all';
let activeRowLabelFilter = 'all';
let previewIdx   = null;        // Which row is being previewed

// ══════════════════════════════════════════════
// STORAGE HELPERS
// ══════════════════════════════════════════════
function loadSettings() {
  try {
    // Try loading v3 first (current version)
    const v3 = JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || 'null');
    if (v3) return { ...DEFAULT_SETTINGS, ...v3 };

    // Migrate from v3 or v2: keep personal details but reset template
    const prev = JSON.parse(localStorage.getItem('bakbokim_settings_v4') || localStorage.getItem('bakbokim_settings_v3') || localStorage.getItem('bakbokim_settings_v2') || 'null');
    if (prev) {
      const migrated = {
        ...DEFAULT_SETTINGS,
        senderName:    prev.senderName    || DEFAULT_SETTINGS.senderName,
        projectName:   prev.projectName   || DEFAULT_SETTINGS.projectName,
        city:          prev.city          || DEFAULT_SETTINGS.city,
        pickupAddress: prev.pickupAddress || DEFAULT_SETTINGS.pickupAddress,
        calendarLink:  prev.calendarLink  || DEFAULT_SETTINGS.calendarLink,
        template:      DEFAULT_TEMPLATE,  // always reset to latest template
      };
      // Save migrated settings to v4 so migration runs only once
      localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(migrated));
      return migrated;
    }

    return { ...DEFAULT_SETTINGS };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings() {
  settings.senderName    = document.getElementById('senderName').value.trim();
  settings.projectName   = document.getElementById('projectName').value.trim();
  settings.city          = document.getElementById('city').value.trim();
  settings.pickupAddress = document.getElementById('pickupAddress').value.trim();
  settings.calendarLink  = document.getElementById('calendarLink').value.trim();
  settings.template      = document.getElementById('messageTemplate').value;
  localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings));
  showToast();
}
function loadSent() {
  try { return JSON.parse(localStorage.getItem(STORAGE_SENT) || '{}'); }
  catch { return {}; }
}
function saveSent() {
  localStorage.setItem(STORAGE_SENT, JSON.stringify(sentStatus));
}

// Unique key per order (phone + order number) so status persists across re-uploads
function sentKey(row) {
  const phone = cleanPhone(String(row['Billing Phone'] ?? row['Phone'] ?? row[headers[3]] ?? ''));
  const order = String(row['Name'] ?? row[headers[1]] ?? '');
  return `${phone}_${order}`;
}

// ══════════════════════════════════════════════
// PHONE FORMATTING
// ══════════════════════════════════════════════
function cleanPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  // Strip leading 0 if present, take last 9, prefix with 972
  return '972' + digits.replace(/^0/, '').slice(-9);
}

// ══════════════════════════════════════════════
// MESSAGE BUILDING
// ══════════════════════════════════════════════
function buildMessage(row) {
  // Build the items section: exclude known non-item columns
  const excludeCols = ['תוויות שורה', 'Name', 'Shipping Name', 'Customer Name', 'Billing Phone', 'Phone', 'Email', 'סכום כולל'];
  const itemLines = [];
  
  for (let h of headers) {
    if (excludeCols.includes(h)) continue;
    
    const val = row[h];
    // Include the column if it has a value and isn't "0"
    if (val !== undefined && val !== null && val !== '' && val !== 0 && val !== '0') {
      itemLines.push(`${h}: ${val}`);
    }
  }

  const customerName = row['Shipping Name'] ?? row['Customer Name'] ?? row[headers[2]] ?? '';
  const orderNum = row['Name'] ?? row[headers[1]] ?? '';

  return settings.template
    .replace(/{{name}}/g,         customerName)
    .replace(/{{orderNum}}/g,     orderNum)
    .replace(/{{senderName}}/g,   settings.senderName)
    .replace(/{{projectName}}/g,  settings.projectName)
    .replace(/{{city}}/g,         settings.city)
    .replace(/{{items}}/g,        itemLines.join('\n'))
    .replace(/{{calendarLink}}/g, settings.calendarLink)
    .replace(/{{address}}/g,      settings.pickupAddress);
}

function buildWhatsAppUrl(row) {
  const phone   = cleanPhone(String(row['Billing Phone'] ?? row['Phone'] ?? row[headers[3]] ?? ''));
  const message = buildMessage(row);
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

// ══════════════════════════════════════════════
// FILE UPLOAD & PARSING
// ══════════════════════════════════════════════
const fileInput  = document.getElementById('fileInput');
const uploadZone = document.getElementById('uploadZone');

fileInput.addEventListener('change', e => {
  handleFile(e.target.files[0]);
  e.target.value = ''; // Reset value so same file can be re-uploaded
});

// Drag & drop support
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragging'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragging'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const wb   = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (!data || data.length < 2) {
        alert('הקובץ ריק או חסרות כותרות. ודא שהשורה הראשונה מכילה כותרות עמודות.');
        return;
      }

      headers = data[0].map((h, i) => h?.toString().trim() || `עמודה_${i + 1}`);
      rows    = data.slice(1)
        .filter(r => r.some(c => c !== ''))   // skip blank rows
        .map(r => {
          const obj = {};
          headers.forEach((h, i) => { obj[h] = r[i] ?? ''; });
          
          // Fix missing leading zero for any phone column
          headers.forEach(h => {
            const lowerH = h.toLowerCase();
            if (lowerH.includes('phone') || lowerH.includes('mobile') || lowerH.includes('cell') || lowerH.includes('טלפון') || lowerH.includes('נייד')) {
              if (obj[h]) {
                const digits = String(obj[h]).replace(/\D/g, '');
                if (digits.startsWith('972')) {
                  let rest = digits.slice(3);
                  obj[h] = rest.startsWith('0') ? rest : '0' + rest; // Convert 972... to 05...
                } else if (digits.length === 9 && !digits.startsWith('0')) {
                  obj[h] = '0' + digits; // Missing 0 for mobile
                } else if (digits.length === 8 && /^[23489]/.test(digits)) {
                  obj[h] = '0' + digits; // Missing 0 for landline
                }
              }
            }
          });
          
          return obj;
        });

      // Populate row label filter
      const labelFilterWrapper = document.getElementById('rowLabelFilterWrapper');
      const labelFilter = document.getElementById('rowLabelFilter');
      if (labelFilterWrapper && labelFilter) {
        const labelCol = headers.find(h => h === 'תוויות שורה' || h === 'Row Labels');
        if (labelCol) {
          const uniqueLabels = [...new Set(rows.map(r => r[labelCol]).filter(Boolean))];
          labelFilter.innerHTML = '<option value="all">כל התוויות</option>';
          uniqueLabels.forEach(label => {
            const opt = document.createElement('option');
            opt.value = label;
            opt.textContent = label;
            labelFilter.appendChild(opt);
          });
          labelFilterWrapper.style.display = uniqueLabels.length > 0 ? 'inline-block' : 'none';
        } else {
          labelFilterWrapper.style.display = 'none';
        }
      }

      uploadZone.classList.add('has-data');
      document.getElementById('clearDataBtn').style.display = '';
      document.getElementById('statsBar').style.display = 'flex';
      document.getElementById('tableWrapper').style.display = '';

      renderTable();
      updateStats();
    } catch (err) {
      console.error(err);
      alert('שגיאה בקריאת הקובץ. ודא שהוא קובץ אקסל תקין.');
    }
  };
  reader.readAsArrayBuffer(file);
}

// ══════════════════════════════════════════════
// TABLE RENDERING
// ══════════════════════════════════════════════
function renderTable() {
  const thead = document.getElementById('tableHead');
  const tbody = document.getElementById('tableBody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  // ── Header row ──
  const hr = document.createElement('tr');

  // Select-all checkbox
  const thChk = document.createElement('th');
  const selectAll = document.createElement('input');
  selectAll.type = 'checkbox';
  selectAll.id   = 'selectAll';
  selectAll.addEventListener('change', toggleSelectAll);
  thChk.appendChild(selectAll);
  hr.appendChild(thChk);

  // Data headers
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    hr.appendChild(th);
  });

  // Action headers
  ['סטטוס', 'פעולות'].forEach(label => {
    const th = document.createElement('th');
    th.textContent = label;
    hr.appendChild(th);
  });
  thead.appendChild(hr);

  // ── Body rows ──
  rows.forEach((row, idx) => {
    const tr = document.createElement('tr');
    const key  = sentKey(row);
    const sent = !!sentStatus[key];

    // Apply filter
    if (activeFilter === 'sent'   && !sent) tr.classList.add('row-hidden');
    if (activeFilter === 'unsent' &&  sent) tr.classList.add('row-hidden');

    const labelCol = headers.find(h => h === 'תוויות שורה' || h === 'Row Labels');
    if (labelCol && activeRowLabelFilter !== 'all' && row[labelCol] !== activeRowLabelFilter) {
      tr.classList.add('row-hidden');
    }

    // Checkbox cell
    const tdChk = document.createElement('td');
    const chk   = document.createElement('input');
    chk.type = 'checkbox';
    chk.dataset.idx = idx;
    chk.className = 'row-checkbox';
    chk.addEventListener('change', updateBulkBtn);
    tdChk.appendChild(chk);
    tr.appendChild(tdChk);

    // Data cells
    headers.forEach(h => {
      const td = document.createElement('td');
      td.textContent = row[h] ?? '';
      tr.appendChild(td);
    });

    // Status badge cell
    const tdStatus = document.createElement('td');
    const badge = document.createElement('span');
    if (sent) {
      badge.className = 'badge badge-sent';
      badge.innerHTML = '✓ נשלח';
      const info = sentStatus[key];
      if (info.count > 1) badge.innerHTML += ` (${info.count})`;
    } else {
      badge.className = 'badge badge-pending';
      badge.innerHTML = '⏳ ממתין';
    }
    tdStatus.appendChild(badge);
    tr.appendChild(tdStatus);

    // Action buttons cell – icon-only buttons with tooltips
    const tdAct = document.createElement('td');
    tdAct.className = 'action-cell';

    const btnPreview = document.createElement('button');
    btnPreview.className = 'btn-icon';
    btnPreview.title = 'תצוגה מקדימה';
    btnPreview.innerHTML = `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    btnPreview.addEventListener('click', () => openPreviewModal(idx));

    const btnSend = document.createElement('button');
    btnSend.className = sent ? 'btn-icon' : 'btn-icon btn-icon--green';
    btnSend.title = sent ? 'שלח שוב' : 'שלח ב-WhatsApp';
    btnSend.innerHTML = `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
    btnSend.addEventListener('click', () => sendRow(idx));

    tdAct.appendChild(btnPreview);
    tdAct.appendChild(btnSend);
    tr.appendChild(tdAct);
    tbody.appendChild(tr);
  });

  updateBulkBtn();
}

// ══════════════════════════════════════════════
// STATS
// ══════════════════════════════════════════════
function updateStats() {
  const total   = rows.length;
  const sent    = rows.filter(r => sentStatus[sentKey(r)]).length;
  const pending = total - sent;

  document.getElementById('statTotal').textContent   = total;
  document.getElementById('statSent').textContent    = sent;
  document.getElementById('statPending').textContent = pending;
}

// ══════════════════════════════════════════════
// FILTER
// ══════════════════════════════════════════════
function setFilter(filter) {
  activeFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderTable();
}

function setRowLabelFilter(val) {
  activeRowLabelFilter = val;
  renderTable();
}

// ══════════════════════════════════════════════
// SELECTION & BULK
// ══════════════════════════════════════════════
function toggleSelectAll() {
  const checked = document.getElementById('selectAll').checked;
  document.querySelectorAll('.row-checkbox').forEach(cb => {
    // Only toggle visible rows
    if (!cb.closest('tr').classList.contains('row-hidden')) cb.checked = checked;
  });
  updateBulkBtn();
}

function updateBulkBtn() {
  const anyChecked = [...document.querySelectorAll('.row-checkbox')].some(cb => cb.checked);
  document.getElementById('bulkSendBtn').disabled = !anyChecked;
}

// ══════════════════════════════════════════════
// BULK SEND QUEUE (Popup blocker safe)
// ══════════════════════════════════════════════
let queueList = [];
let currentQueueStep = 0;

function sendBulk() {
  const checked = [...document.querySelectorAll('.row-checkbox')].filter(cb => cb.checked);
  if (!checked.length) return;
  
  queueList = checked.map(cb => Number(cb.dataset.idx));
  currentQueueStep = 0;
  
  document.getElementById('queueModal').classList.add('open');
  processQueueStep();
}

function processQueueStep() {
  if (currentQueueStep >= queueList.length) {
    // Done
    closeQueueModal();
    return;
  }
  
  const idx = queueList[currentQueueStep];
  const row = rows[idx];
  
  // Update progress
  document.getElementById('queueProgress').textContent = `הודעה ${currentQueueStep + 1} מתוך ${queueList.length}`;
  
  // Build preview
  const customerName = row['Shipping Name'] || row['Customer Name'] || 'לקוח';
  const initial = customerName.charAt(0);
  const phone = row['Billing Phone'] || row['Phone'] || 'אין מספר';
  
  document.getElementById('queueRecipient').innerHTML = `
    <div class="queue-avatar">${initial}</div>
    <div>
      <div class="queue-name">${customerName}</div>
      <div class="queue-phone">${phone}</div>
    </div>
  `;
  
  document.getElementById('queuePreviewText').textContent = buildMessage(row);
}

function queueSendCurrent() {
  const idx = queueList[currentQueueStep];
  const row = rows[idx];
  const url = buildWhatsAppUrl(row);
  
  // Open WhatsApp
  window.open(url, '_blank');
  
  // Mark sent
  markSent(idx);
  
  // Move to next
  currentQueueStep++;
  processQueueStep();
}

function queueSkip() {
  currentQueueStep++;
  processQueueStep();
}

function closeQueueModal() {
  document.getElementById('queueModal').classList.remove('open');
  queueList = [];
  currentQueueStep = 0;
  
  // Uncheck all
  document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = false);
  document.getElementById('selectAll').checked = false;
  updateBulkBtn();
}

function closeQueueOnBackdrop(e) {
  if (e.target === document.getElementById('queueModal')) {
    closeQueueModal();
  }
}

// ══════════════════════════════════════════════
// SENDING
// ══════════════════════════════════════════════
function sendRow(idx) {
  const row = rows[idx];
  const url = buildWhatsAppUrl(row);
  window.open(url, '_blank');
  markSent(idx);
}

function markSent(idx) {
  const key = sentKey(rows[idx]);
  if (!sentStatus[key]) {
    sentStatus[key] = { sentAt: new Date().toISOString(), count: 1 };
  } else {
    sentStatus[key].count++;
    sentStatus[key].sentAt = new Date().toISOString();
  }
  saveSent();
  renderTable();
  updateStats();
}

// ══════════════════════════════════════════════
// PREVIEW MODAL
// ══════════════════════════════════════════════
function openPreviewModal(idx) {
  previewIdx = idx;
  const msg = buildMessage(rows[idx]);
  document.getElementById('previewText').textContent = msg;
  document.getElementById('previewModal').classList.add('open');
}

function closePreviewModal() {
  document.getElementById('previewModal').classList.remove('open');
  previewIdx = null;
}

function closeModal(e) {
  if (e.target.id === 'previewModal') closePreviewModal();
}

function copyMessage() {
  const text = document.getElementById('previewText').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.modal-footer .btn-ghost');
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ הועתק!';
    setTimeout(() => { btn.innerHTML = orig; }, 1800);
  });
}

function sendFromModal() {
  if (previewIdx !== null) {
    sendRow(previewIdx);
    closePreviewModal();
  }
}

// ══════════════════════════════════════════════
// CLEAR DATA
// ══════════════════════════════════════════════
function clearData() {
  if (!confirm('האם לנקות את הנתונים? סטטוס השליחה יישמר.')) return;
  rows = [];
  headers = [];
  fileInput.value = '';
  uploadZone.classList.remove('has-data');
  document.getElementById('clearDataBtn').style.display = 'none';
  document.getElementById('statsBar').style.display = 'none';
  document.getElementById('tableWrapper').style.display = 'none';
  document.getElementById('tableHead').innerHTML = '';
  document.getElementById('tableBody').innerHTML = '';
}

// ══════════════════════════════════════════════
// PAGE NAVIGATION
// ══════════════════════════════════════════════
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page${page.charAt(0).toUpperCase() + page.slice(1)}`).classList.add('active');
  document.getElementById(`nav${page.charAt(0).toUpperCase() + page.slice(1)}`).classList.add('active');
}

// ══════════════════════════════════════════════
// SETTINGS PAGE
// ══════════════════════════════════════════════
function populateSettingsForm() {
  document.getElementById('senderName').value    = settings.senderName;
  document.getElementById('projectName').value   = settings.projectName;
  document.getElementById('city').value          = settings.city;
  document.getElementById('pickupAddress').value = settings.pickupAddress;
  document.getElementById('calendarLink').value  = settings.calendarLink;
  document.getElementById('messageTemplate').value = settings.template;
}

function resetTemplate() {
  // Update the textarea
  document.getElementById('messageTemplate').value = DEFAULT_TEMPLATE;
  // Also save everything immediately so localStorage reflects the new default
  settings.template = DEFAULT_TEMPLATE;
  localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings));
  showToast();
}

// Insert a variable token at cursor position in the textarea
function insertVar(token) {
  const ta  = document.getElementById('messageTemplate');
  const pos = ta.selectionStart;
  ta.value  = ta.value.slice(0, pos) + token + ta.value.slice(ta.selectionEnd);
  ta.selectionStart = ta.selectionEnd = pos + token.length;
  ta.focus();
}

// ══════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════
function showToast() {
  const toast = document.getElementById('saveToast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ══════════════════════════════════════════════
// THEME
// ══════════════════════════════════════════════
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('themeIcon');
  // Switch icon: sun for dark mode toggle, moon for light mode toggle
  icon.innerHTML = theme === 'dark'
    ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
    : '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
}

document.getElementById('themeToggle').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem(STORAGE_THEME, next);
});

// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════
(function init() {
  const savedTheme = localStorage.getItem(STORAGE_THEME) || 'dark';
  applyTheme(savedTheme);
  populateSettingsForm();
})();
