import './style.css'
import QRCode from 'qrcode'
import { supabase } from './supabase.js'

const app = document.querySelector('#app')

let session = null
let assets = []
let repairs = []
let maintenance = []
let activePage = 'dashboard'
let resolveContext = null
let resolvingTicket = false
let submittingFault = false

const statusOptions = ['Operational', 'Needs Attention', 'Under Repair', 'Out of Service']
const priorityOptions = ['Low', 'Medium', 'High', 'Critical']
const slaHours = { Low: 168, Medium: 72, High: 24, Critical: 8 }

const serviceResultOptions = ['Pass', 'Good', 'OK', 'N/A', 'Monitor', 'Worn', 'Failed', 'Requires Attention']
const serviceWorkflows = {
  AGV: {
    label: 'AGV Service Workflow',
    description: 'Mobility, battery, sensor and safety inspection.',
    fields: [
      ['batteryType', 'Battery type', 'text'],
      ['batteryHealth', 'Battery health', 'check'],
      ['driveMotorsInspection', 'Drive motors inspection', 'check'],
      ['wheelCondition', 'Wheel condition', 'check'],
      ['crashSensorCheck', 'Crash sensor check', 'check'],
      ['emergencyStopTest', 'Emergency stop test', 'check'],
      ['trackSensorCheck', 'Track sensor check', 'check'],
      ['chargerCheck', 'Charger check', 'check'],
      ['routeTrackIssues', 'Route/track issues', 'textarea'],
      ['wiringCheck', 'Wiring check', 'check'],
      ['upgradesRequired', 'Upgrades required', 'textarea']
    ]
  },
  FDM: {
    label: 'FDM 3D Printer Service Workflow',
    description: 'Print-quality, extrusion and motion-system reliability checks.',
    fields: [
      ['nozzleCondition', 'Nozzle condition', 'check'],
      ['extruderGearCondition', 'Extruder gear condition', 'check'],
      ['bedLevellingCheck', 'Bed levelling check', 'check'],
      ['buildPlateCondition', 'Build plate condition', 'check'],
      ['beltTension', 'Belt tension', 'check'],
      ['linearRailCondition', 'Linear rail condition', 'check'],
      ['zAxisInspection', 'Z-axis inspection', 'check'],
      ['firmwareNotes', 'Firmware notes', 'textarea'],
      ['filamentTubeCondition', 'Filament tube condition', 'check'],
      ['calibrationCubeTestResults', 'Calibration cube / test print results', 'textarea'],
      ['printQualityNotes', 'Print quality notes', 'textarea']
    ]
  },
  RESIN: {
    label: 'Resin Printer Service Workflow',
    description: 'Resin vat, FEP, optics and exposure-system inspection.',
    fields: [
      ['resinVatCondition', 'Resin vat condition', 'check'],
      ['fepFilmCondition', 'FEP film condition', 'check'],
      ['lcdScreenInspection', 'LCD screen inspection', 'check'],
      ['uvLightInspection', 'UV light inspection', 'check'],
      ['buildPlateCondition', 'Build plate condition', 'check'],
      ['buildPlateLevelling', 'Build plate levelling', 'check'],
      ['resinContaminationCheck', 'Resin contamination check', 'check'],
      ['zAxisInspection', 'Z-axis inspection', 'check'],
      ['railLubricationCheck', 'Rail lubrication check', 'check'],
      ['exposureTestResult', 'Exposure test result', 'textarea']
    ]
  },
  WASH_CURE: {
    label: 'Wash & Cure Station Service Workflow',
    description: 'Wash tank, UV cure, rotation and safety inspection.',
    fields: [
      ['washTankCondition', 'Wash tank condition', 'check'],
      ['ipaResinContamination', 'IPA/resin contamination check', 'check'],
      ['washMotorOperation', 'Wash motor operation check', 'check'],
      ['impellerInspection', 'Impeller inspection', 'check'],
      ['uvLightInspection', 'UV light inspection', 'check'],
      ['turntableRotation', 'Turntable rotation check', 'check'],
      ['lidSafetySwitchInspection', 'Lid/safety switch inspection', 'check'],
      ['sealLeakInspection', 'Seal/leak inspection', 'check'],
      ['cleaningCompleted', 'Cleaning completed', 'check'],
      ['cureTestResult', 'Cure test result', 'textarea']
    ]
  },
  GENERAL: {
    label: 'General Service Workflow',
    description: 'General engineering service inspection.',
    fields: [
      ['conditionCheck', 'Condition check', 'check'],
      ['safetyCheck', 'Safety check', 'check'],
      ['electricalInspection', 'Electrical inspection', 'check'],
      ['mechanicalInspection', 'Mechanical inspection', 'check'],
      ['cleaningCompleted', 'Cleaning completed', 'check'],
      ['serviceNotes', 'Service notes', 'textarea']
    ]
  }
}


init()

async function init() {
  window.addEventListener('hashchange', handleRoute)

  // V15 development entry mode: authentication is temporarily bypassed.
  // The splash screen is still shown, but users enter the platform with a single button.
  // V15 development entry mode: always show the entry screen per browser session.
  // Clear any older persistent flag so a cached localStorage value cannot bypass or blank the landing screen.
  localStorage.removeItem('maintenanceos_entered')
  const hasEntered = sessionStorage.getItem('maintenanceos_entered') === 'true'
  if (!hasEntered) {
    renderAuth()
    return
  }

  session = { user: { email: 'development@maintenanceos.local' } }
  handleRoute()
  await loadData()
  renderPage()
}

function showMessage(message, type = 'info') {
  const box = document.querySelector('#messageBox')
  if (!box) return alert(message)
  box.textContent = message
  box.className = `message ${type}`
}

function renderAuth() {
  app.innerHTML = `
    <section class="auth-page entry-page">
      <div class="auth-card entry-card glass">
        <div class="brand-lockup entry-brand">
          <div class="orb entry-orb"></div>
          <div>
            <h1>MaintenanceOS</h1>
            <p>Intelligent maintenance platform</p>
          </div>
        </div>
        <button id="enterPlatform" class="primary entry-button">Enter</button>
      </div>
    </section>
  `

  document.querySelector('#enterPlatform').addEventListener('click', async () => {
    sessionStorage.setItem('maintenanceos_entered', 'true')
    session = { user: { email: 'development@maintenanceos.local' } }
    location.hash = location.hash || 'dashboard'
    handleRoute()
    await loadData()
    renderPage()
  })
}

async function loadData() {
  try {
    const [assetResult, repairResult, maintenanceResult] = await Promise.all([
      supabase.from('assets').select('*').or('archived.is.null,archived.eq.false').order('created_at', { ascending: false }),
      supabase.from('repair_tickets').select('*').order('created_at', { ascending: false }),
      supabase.from('maintenance_tasks').select('*').order('due_date', { ascending: true })
    ])

    if (assetResult.error) console.warn(assetResult.error.message)
    if (repairResult.error) console.warn(repairResult.error.message)
    if (maintenanceResult.error && !maintenanceResult.error.message.includes('maintenance_tasks')) console.warn(maintenanceResult.error.message)

    assets = assetResult.data || []
    repairs = repairResult.data || []
    maintenance = maintenanceResult.data || []
  } catch (err) {
    console.warn('Data load skipped:', err?.message || err)
    assets = []
    repairs = []
    maintenance = []
  }
}

function handleRoute() {
  closeResolveModal()
  closeServiceModal()
  window.closeImagePreview?.()
  const hash = location.hash.replace('#', '')
  if (hash.startsWith('asset/')) {
    renderShell(false)
    renderAssetDetail(hash.replace('asset/', ''))
    return
  }
  activePage = hash || activePage || 'dashboard'
  renderShell(true)
  renderPage()
}

function renderShell(withSidebar = true) {
  app.innerHTML = `
    ${withSidebar ? `
      <aside class="sidebar">
        <div class="brand">
          <div class="orb"></div>
          <div>
            <h2>Medstrom Engineering</h2>
            <p>Equipment Command Centre</p>
          </div>
        </div>
        ${navButton('dashboard', 'Dashboard')}
        ${navButton('assets', 'Assets')}
        ${navButton('repairs', 'Faults & Repairs')}
        ${navButton('maintenance', 'Maintenance')}
        ${navButton('qr', 'QR Labels')}
        ${navButton('reports', 'Reports')}
        <button id="logout" class="nav danger">Exit</button>
      </aside>` : ''}
    <main class="main ${withSidebar ? '' : 'full'}">
      <div id="content"></div>
    </main>
  `

  if (withSidebar) {
    document.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        location.hash = btn.dataset.page
      })
    })
    document.querySelector('#logout').addEventListener('click', async () => {
      sessionStorage.removeItem('maintenanceos_entered')
      localStorage.removeItem('maintenanceos_entered')
      location.hash = ''
      location.reload()
    })
  }
}

function navButton(page, label) {
  return `<button class="nav ${activePage === page ? 'active' : ''}" data-page="${page}">${label}</button>`
}

function renderPage() {
  if (activePage === 'dashboard') return renderDashboard()
  if (activePage === 'assets') return renderAssets()
  if (activePage === 'repairs') return renderRepairs()
  if (activePage === 'maintenance') return renderMaintenance()
  if (activePage === 'qr') return renderQR()
  if (activePage === 'reports') return renderReports()
  renderDashboard()
}

function content() {
  return document.querySelector('#content')
}

function renderHeader(kicker, title, actions = '') {
  return `
    <div class="page-header">
      <div>
        <p class="eyebrow">${kicker}</p>
        <h1>${title}</h1>
      </div>
      <div class="header-actions">${actions}</div>
    </div>
  `
}

function renderDashboard() {
  const operational = assets.filter(a => a.status === 'Operational').length
  const underRepair = assets.filter(a => a.status === 'Under Repair').length
  const attention = assets.filter(a => a.status === 'Needs Attention').length
  const openRepairs = repairs.filter(r => r.status !== 'Resolved').length
  const overdueRepairs = repairs.filter(r => getRepairHealth(r).state === 'overdue').length
  const criticalOpen = repairs.filter(r => r.status !== 'Resolved' && r.priority === 'Critical').length

  content().innerHTML = `
    ${renderHeader('LIVE FLEET OVERVIEW', 'Dashboard', '<button id="refresh">Refresh</button>')}
    <section class="stats-grid">
      ${statCard('Total Assets', assets.length, 'Registered equipment')}
      ${statCard('Operational', operational, 'Available for use')}
      ${statCard('Under Repair', underRepair, 'Active engineering work')}
      ${statCard('Needs Attention', attention, 'Service or inspection required')}
      ${statCard('Overdue Faults', overdueRepairs, `${criticalOpen} critical open`)}
    </section>
    <section class="grid two">
      <div class="card">
        <div class="section-title-row compact">
          <div>
            <h2>Recent Assets</h2>
            <p class="muted">Live status from service and repair activity.</p>
          </div>
        </div>
        ${assets.slice(0, 6).map(assetRow).join('') || '<p class="muted">No assets yet.</p>'}
      </div>
      <div class="card smart-panel">
        <div class="section-title-row compact">
          <div>
            <h2>Priority Radar</h2>
            <p class="muted">SLA driven view of active fault risk.</p>
          </div>
        </div>
        ${repairs.filter(r => r.status !== 'Resolved').slice(0, 6).map(repairRow).join('') || '<p class="muted">No active faults.</p>'}
      </div>
    </section>
  `
  document.querySelector('#refresh').onclick = async () => { await loadData(); renderDashboard() }
}

function statCard(label, value, sub) {
  return `<div class="card stat"><p>${label}</p><h2>${value}</h2><small>${sub}</small></div>`
}

function renderAssets() {
  content().innerHTML = `
    ${renderHeader('ASSET REGISTER', 'Assets')}
    <section class="card">
      <h2>Add Asset</h2>
      <div id="messageBox" class="message hidden"></div>
      <div class="form-grid">
        <input id="assetName" placeholder="Asset name" />
        <input id="assetType" list="assetTypeOptions" placeholder="Type e.g. AGV / FDM 3D Printer / Resin Printer / Wash & Cure Station" />
        <datalist id="assetTypeOptions"><option value="AGV"><option value="FDM 3D Printer"><option value="Resin Printer"><option value="Wash & Cure Station"><option value="General Equipment"></datalist>
        <input id="assetSerial" placeholder="Serial number" />
        <input id="assetLocation" placeholder="Location" />
        <input id="assetManufacturer" placeholder="Manufacturer" />
        <input id="assetModel" placeholder="Model" />
        <select id="assetStatus">${statusOptions.map(o => `<option>${o}</option>`).join('')}</select>
        <input id="assetService" type="date" title="Next service date" />
      </div>
      <textarea id="assetNotes" placeholder="Notes"></textarea>
      <button id="addAsset" class="primary">Add Asset</button>
    </section>
    <section class="card">
      <h2>Asset List</h2>
      ${assets.map(assetRow).join('') || '<p class="muted">No assets yet.</p>'}
    </section>
  `
  document.querySelector('#addAsset').onclick = addAsset
}

async function addAsset() {
  const name = document.querySelector('#assetName').value.trim()
  if (!name) return showMessage('Asset name is required.', 'error')

  const payload = {
    name,
    type: value('#assetType'),
    serial_number: value('#assetSerial'),
    location: value('#assetLocation'),
    manufacturer: value('#assetManufacturer'),
    model: value('#assetModel'),
    status: value('#assetStatus') || 'Operational',
    archived: false,
    next_service_date: value('#assetService') || null,
    notes: value('#assetNotes')
  }

  const { error } = await supabase.from('assets').insert(payload)
  if (error) return showMessage(error.message, 'error')

  await audit('asset_created', 'assets', name)
  await loadData()
  renderAssets()
}

function value(selector) {
  return document.querySelector(selector)?.value?.trim() || ''
}

function assetRow(a) {
  return `
    <div class="data-row">
      <div>
        <h3>${escapeHtml(a.name || 'Unnamed Asset')}</h3>
        <p>${escapeHtml(a.type || 'Asset')} • ${escapeHtml(a.location || 'No location')}</p>
        <small>Status: <span class="status-pill ${statusClass(a.status)}">${escapeHtml(a.status || 'Operational')}</span></small>
      </div>
      <div class="row-actions">
        <button onclick="location.hash='asset/${a.id}'">Open</button>
        <button class="danger subtle" onclick="event.stopPropagation(); window.archiveAsset('${a.id}', '${escapeHtml(a.name || 'this asset')}')">Archive</button>
      </div>
    </div>
  `
}

async function renderAssetDetail(id) {
  await loadData()
  const a = assets.find(item => item.id === id)
  if (!a) {
    content().innerHTML = `<button onclick="location.hash='assets'">Back</button><h1>Asset not found</h1>`
    return
  }
  const assetRepairs = repairs.filter(r => r.asset_id === id)
  const qrUrl = `${location.origin}${location.pathname}#asset/${a.id}`
  const qr = await QRCode.toDataURL(qrUrl)

  content().innerHTML = `
    ${renderHeader('ASSET RECORD', escapeHtml(a.name), `<button onclick="location.hash='assets'">Back</button><button class="primary" onclick="window.openServiceModal('${a.id}')">Service Asset</button><button class="danger subtle" onclick="window.archiveAsset('${a.id}', '${escapeHtml(a.name || 'this asset')}')">Archive Asset</button>`)}
    <section class="grid two">
      <div class="card">
        <h2>Equipment Details</h2>
        <p><b>Type:</b> ${escapeHtml(a.type || '-')}</p>
        <p><b>Location:</b> ${escapeHtml(a.location || '-')}</p>
        <p><b>Status:</b> ${escapeHtml(a.status || '-')}</p>
        <p><b>Serial:</b> ${escapeHtml(a.serial_number || '-')}</p>
        <p><b>Manufacturer:</b> ${escapeHtml(a.manufacturer || '-')}</p>
        <p><b>Model:</b> ${escapeHtml(a.model || '-')}</p>
        <p><b>Next service:</b> ${escapeHtml(a.next_service_date || '-')}</p>
        <p>${escapeHtml(a.notes || '')}</p>
      </div>
      <div class="card qr-mini">
        <h2>QR Link</h2>
        <img src="${qr}" alt="QR code" />
        <button onclick="navigator.clipboard.writeText('${qrUrl}'); window.toast?.('Asset link copied.', 'success')">Copy Asset Link</button><button class="primary" onclick="document.querySelector('#repairTitle')?.focus()">Report Fault</button>
      </div>
    </section>
    <section class="card">
      <h2>Report Fault</h2>
      <p class="muted">QR workflow: scan, describe fault, attach photo, submit.</p>
      <div id="messageBox" class="message hidden"></div>
      <input id="repairTitle" placeholder="Fault title" />
      <textarea id="repairDesc" placeholder="Fault description"></textarea>
      <div class="form-grid">
        <select id="repairPriority">${priorityOptions.map(o => `<option>${o}</option>`).join('')}</select>
      </div>
      <label class="file-label">Attach photo <input id="repairPhoto" type="file" accept="image/*" /></label>
      <button id="saveRepair" class="primary">Report Fault</button>
    </section>
    <section class="card">
      <h2>Asset History Timeline</h2>
      ${assetHistoryTimeline(a, assetRepairs)}
    </section>
  `

  document.querySelector('#saveRepair').onclick = () => addRepair(a.id)
}


async function uploadRepairPhoto() {
  const input = document.querySelector('#repairPhoto')
  const file = input?.files?.[0]
  if (!file) return null

  const safeName = file.name.replace(/[^a-z0-9.\-_]/gi, '_')
  const path = `${Date.now()}-${safeName}`
  const { error } = await supabase.storage.from('repair-photos').upload(path, file, { upsert: false })
  if (error) throw new Error(`Fault photo upload failed: ${error.message}. Please retry.`)

  const { data } = supabase.storage.from('repair-photos').getPublicUrl(path)
  return data?.publicUrl || null
}

async function updateAssetStatusFromRepairs(assetId) {
  const { data, error } = await supabase
    .from('repair_tickets')
    .select('status, priority')
    .eq('asset_id', assetId)
    .or('status.is.null,status.neq.Resolved')

  if (error) return console.warn(error.message)

  let nextStatus = 'Operational'
  if (data?.some(r => r.status === 'In Repair')) nextStatus = 'Under Repair'
  else if (data?.length) nextStatus = 'Needs Attention'

  await supabase.from('assets').update({ status: nextStatus }).eq('id', assetId)
}

function openResolveModal(repairId, assetId) {
  if (resolvingTicket) return
  const repair = repairs.find(r => r.id === repairId)
  if (!repair || repair.asset_id !== assetId || repair.status === 'Resolved') {
    toast('Repairs require an active fault for this asset.', 'error')
    return
  }
  ensureResolveModal()
  const asset = assets.find(a => a.id === assetId)

  resolveContext = { repairId, assetId }
  resolvingTicket = false

  document.querySelector('#resolveTicketTitle').textContent = repair?.title || 'Fault'
  document.querySelector('#resolveAssetName').textContent = asset?.name || 'Unknown asset'
  document.querySelector('#resolveMeta').textContent = `Fault ${repair.id} • ${repair.priority || 'Medium'} priority • ${repair.status}`
  document.querySelector('#resolutionNotes').value = repair?.resolution_notes || ''
  document.querySelector('#resolutionParts').value = repair?.parts_used || ''
  document.querySelector('#resolutionCost').value = repair?.cost || ''
  document.querySelector('#resolutionDowntime').value = repair?.downtime_hours || ''
  document.querySelector('#resolveSuccess').classList.add('hidden')
  const modal = document.querySelector('#resolveModal')
  modal.hidden = false
  modal.setAttribute('aria-hidden', 'false')
  modal.classList.remove('hidden')
  document.querySelector('#confirmResolve').disabled = false
  document.querySelector('#resolutionNotes').focus()
}

function closeResolveModal(force = false) {
  if (resolvingTicket && force !== true) return
  const modal = document.querySelector('#resolveModal')
  if (modal) {
    modal.hidden = true
    modal.classList.add('hidden')
    modal.setAttribute('aria-hidden', 'true')
  }
  resolveContext = null
}

async function confirmResolveRepair() {
  if (!resolveContext || resolvingTicket) return
  const context = { ...resolveContext }
  const confirmBtn = document.querySelector('#confirmResolve')
  const notes = value('#resolutionNotes')
  const parts = value('#resolutionParts')
  const costValue = value('#resolutionCost')
  const downtimeValue = value('#resolutionDowntime')
  if (!notes) return toast('Add repair and verification notes before resolving the fault.', 'error')
  const cost = costValue === '' ? null : Number(costValue)
  const downtime = downtimeValue === '' ? null : Number(downtimeValue)
  if ([cost, downtime].some(v => v !== null && (!Number.isFinite(v) || v < 0))) {
    return toast('Cost and downtime must be zero or positive numbers.', 'error')
  }
  resolvingTicket = true
  confirmBtn.disabled = true
  confirmBtn.textContent = 'Saving repair…'
  let saved = false
  try {
    const { error } = await supabase.rpc('complete_fault_repair', {
      p_fault_id: context.repairId, p_asset_id: context.assetId,
      p_notes: notes, p_parts: parts || null, p_cost: cost, p_downtime: downtime
    })
    if (error) throw new Error(error.message)
    saved = true
    closeResolveModal(true)
    await audit('fault_repaired', 'repair_tickets', context.repairId)
    toast('Repair recorded and fault resolved.', 'success')
    await loadData()
    if (location.hash.startsWith('#asset/')) await renderAssetDetail(location.hash.slice(7))
    else renderPage()
  } catch (err) {
    toast(saved ? 'Repair saved and fault resolved. Refresh to reload the page.' : `Repair was not saved: ${err.message}`, 'error')
  } finally {
    resolvingTicket = false
    confirmBtn.disabled = false
    confirmBtn.textContent = 'Save Repair & Resolve Fault'
  }
}

function ensureResolveModal() {
  if (document.querySelector('#resolveModal')) return

  document.body.insertAdjacentHTML('beforeend', `
    <div id="resolveModal" class="resolve-modal hidden" hidden aria-hidden="true">
      <div class="resolve-backdrop" data-close-resolve></div>
      <section class="resolve-card" role="dialog" aria-modal="true" aria-labelledby="resolveTicketTitle">
        <div class="resolve-motion" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>

        <div class="resolve-head">
          <div>
            <p class="eyebrow">REPAIR FOR ACTIVE FAULT</p>
            <h2 id="resolveTicketTitle">Record Repair</h2>
            <p id="resolveAssetName" class="muted">Asset</p>
            <small id="resolveMeta" class="muted"></small>
          </div>
          <button id="closeResolve" class="icon-btn" title="Close">×</button>
        </div>

        <div id="resolveSuccess" class="success-burst hidden">
          <div class="success-tick">✓</div>
          <div>
            <strong>Ticket resolved</strong>
            <span>Asset status has been recalculated.</span>
          </div>
        </div>

        <label class="field-label">Resolution notes
          <textarea id="resolutionNotes" placeholder="What was found, what was repaired, and how was it verified?"></textarea>
        </label>

        <div class="form-grid resolve-grid">
          <label class="field-label">Parts used
            <input id="resolutionParts" placeholder="e.g. nozzle, belt, sensor" />
          </label>
          <label class="field-label">Repair cost (£)
            <input id="resolutionCost" type="number" min="0" step="0.01" placeholder="0.00" />
          </label>
          <label class="field-label">Downtime (hours)
            <input id="resolutionDowntime" type="number" min="0" step="0.1" placeholder="0.0" />
          </label>
        </div>

        <div class="resolve-actions">
          <button id="cancelResolve" class="ghost">Cancel</button>
          <button id="confirmResolve" class="primary">Save Repair &amp; Resolve Fault</button>
        </div>
      </section>
    </div>
  `)

  document.querySelector('#closeResolve').onclick = closeResolveModal
  document.querySelector('#cancelResolve').onclick = closeResolveModal
  document.querySelector('[data-close-resolve]').onclick = closeResolveModal
  document.querySelector('#confirmResolve').onclick = confirmResolveRepair
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeResolveModal()
  })
}

function toast(message, type = 'info') {
  let toastBox = document.querySelector('#toastBox')
  if (!toastBox) {
    toastBox = document.createElement('div')
    toastBox.id = 'toastBox'
    toastBox.className = 'toast-box'
    document.body.appendChild(toastBox)
  }

  const item = document.createElement('div')
  item.className = `toast ${type}`
  item.textContent = message
  toastBox.appendChild(item)
  setTimeout(() => item.classList.add('show'), 20)
  setTimeout(() => {
    item.classList.remove('show')
    setTimeout(() => item.remove(), 220)
  }, 3200)
}

async function resolveRepair(repairId, assetId) {
  openResolveModal(repairId, assetId)
}

async function addRepair(assetId = null) {
  if (submittingFault) return
  const selectedAsset = assetId || value('#repairAsset')
  const title = value('#repairTitle')
  if (!selectedAsset) return showMessage('Select an asset.', 'error')
  if (!title) return showMessage('Fault title is required.', 'error')
  const button = document.querySelector(assetId ? '#saveRepair' : '#addRepair')
  submittingFault = true
  if (button) { button.disabled = true; button.textContent = 'Reporting…' }
  let saved = false
  try {
    const payload = {
      asset_id: selectedAsset, title, description: value('#repairDesc'),
      priority: value('#repairPriority') || 'Medium', status: 'Open',
      photo_url: await uploadRepairPhoto()
    }
    const { error } = await supabase.from('repair_tickets').insert(payload)
    if (error) throw new Error(error.message)
    saved = true
    // Database trigger updates asset status in the same transaction as the fault.
    await audit('fault_reported', 'repair_tickets', title)
    closeResolveModal(true)
    closeServiceModal()
    window.closeImagePreview?.()
    await loadData()
    if (location.hash.startsWith('#asset/')) await renderAssetDetail(location.hash.slice(7))
    else renderPage()
    toast('Fault reported. Record repair work from the active fault.', 'success')
  } catch (err) {
    showMessage(saved ? 'Fault reported. Refresh to reload the page before reporting another fault.' : `Fault was not submitted: ${err.message}`, 'error')
  } finally {
    submittingFault = false
    if (button) { button.disabled = false; button.textContent = 'Report Fault' }
  }
}

function renderRepairs() {
  content().innerHTML = `
    ${renderHeader('FAULT CONTROL', 'Faults & Repairs')}
    <section class="card repair-form-card">
      <div class="section-title-row">
        <div>
          <h2>Report Fault</h2>
          <p class="muted">Report the symptoms and attach evidence. Record repair work against the active fault.</p>
        </div>
      </div>
      <div id="messageBox" class="message hidden"></div>

      <div class="repair-form-stack">
        <div class="field-block wide">
          <label>Asset</label>
          <select id="repairAsset">${assets.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select>
        </div>

        <div class="field-block wide">
          <label>Fault title</label>
          <input id="repairTitle" placeholder="e.g. Extruder blockage / axis fault / calibration issue" />
        </div>

        <div class="field-block wide">
          <label>Fault description</label>
          <textarea id="repairDesc" placeholder="Describe the symptoms, when it started, and any checks already carried out..."></textarea>
        </div>

        <div class="form-grid repair-meta-grid">
          <div class="field-block">
            <label>Priority</label>
            <select id="repairPriority">${priorityOptions.map(o => `<option>${o}</option>`).join('')}</select>
          </div>
        </div>

        <label class="file-label premium-upload">
          <span class="upload-icon">＋</span>
          <span class="upload-copy">
            <strong>Attach fault photo</strong>
            <small>Upload evidence of the fault or damage.</small>
          </span>
          <input id="repairPhoto" type="file" accept="image/*" />
        </label>

        <div class="form-actions">
          <button id="addRepair" class="primary">Report Fault</button>
        </div>
      </div>
    </section>
    <section class="card">
      <h2>Fault Records</h2>
      ${repairs.map(repairRow).join('') || '<p class="muted">No faults reported yet.</p>'}
    </section>
  `
  document.querySelector('#addRepair').onclick = () => addRepair()
}

function repairRow(r) {
  const asset = assets.find(a => a.id === r.asset_id)
  const resolved = r.status === 'Resolved'
  const health = getRepairHealth(r)
  return `
    <div class="data-row repair-row ${resolved ? 'resolved' : ''} ${health.state}">
      <div class="repair-main">
        <div class="repair-title-line">
          <h3>${escapeHtml(r.title || 'Untitled fault')}</h3>
          <span class="priority-pill ${String(r.priority || 'Medium').toLowerCase()}">${escapeHtml(r.priority || 'Medium')}</span>
          <span class="sla-pill ${health.state}">${health.label}</span>
        </div>
        <p>${escapeHtml(asset?.name || 'Unknown Asset')} • ${escapeHtml(r.status || 'Open')}</p>
        <small>Fault reference: ${escapeHtml(r.id)}</small>
        <small>${escapeHtml(r.description || '')}</small>
        ${resolved ? `<small>Repair cost: £${Number(r.cost || 0).toFixed(2)} • Downtime: ${Number(r.downtime_hours || 0)}h • Parts: ${escapeHtml(r.parts_used || 'None recorded')}</small>` : ''}
        ${r.resolution_notes ? `<small><b>Resolution:</b> ${escapeHtml(r.resolution_notes)}</small>` : ''}
        ${r.resolved_at ? `<small>Resolved: ${new Date(r.resolved_at).toLocaleString()}</small>` : `<small>Opened: ${formatAge(r.created_at)}</small>`}
      </div>
      ${r.photo_url ? `<img class="repair-thumb" src="${escapeHtml(r.photo_url)}" alt="Repair photo" onclick="window.openImagePreview('${escapeHtml(r.photo_url)}', '${escapeHtml(r.title || 'Repair photo')}')" />` : ''}
      <div class="row-actions">
        ${!resolved ? `<button class="resolve-btn" onclick="window.resolveRepair('${r.id}', '${r.asset_id}')">Record Repair</button>` : '<span class="pill ok">Resolved</span>'}
      </div>
    </div>
  `
}


async function archiveAsset(assetId, assetName = 'this asset') {
  const confirmed = confirm(`Archive ${assetName}?\n\nThis removes it from the active asset list but keeps repair history for reporting.`)
  if (!confirmed) return

  const { error } = await supabase
    .from('assets')
    .update({ archived: true, archived_at: new Date().toISOString() })
    .eq('id', assetId)

  if (error) {
    toast(error.message || 'Could not archive asset.', 'error')
    return
  }

  await audit('asset_archived', 'assets', assetName)
  toast('Asset archived.', 'success')
  await loadData()
  if (location.hash.startsWith('#asset/')) location.hash = 'assets'
  else renderAssets()
}

window.archiveAsset = archiveAsset

function renderMaintenance() {
  const today = new Date().toISOString().slice(0, 10)
  content().innerHTML = `
    ${renderHeader('PLANNED MAINTENANCE', 'Maintenance')}
    <section class="card">
      <h2>Service Schedule</h2>
      ${assets.map(a => `
        <div class="data-row ${a.next_service_date && a.next_service_date < today ? 'overdue' : ''}">
          <div>
            <h3>${escapeHtml(a.name)}</h3>
            <p>Next service: ${escapeHtml(a.next_service_date || 'Not set')}</p>
            <small>${a.next_service_date && a.next_service_date < today ? 'Overdue' : 'Scheduled'}</small>
          </div>
          <div class="row-actions"><button class="primary" onclick="window.openServiceModal('${a.id}')">Service</button><button onclick="location.hash='asset/${a.id}'">Open</button></div>
        </div>
      `).join('') || '<p class="muted">No assets to schedule.</p>'}
    </section>
    <section class="card">
      <h2>Maintenance Tasks</h2>
      ${maintenance.map(t => `
        <div class="data-row">
          <div>
            <h3>${escapeHtml(t.title || 'Task')}</h3>
            <p>${escapeHtml(t.status || 'Open')} • Due: ${escapeHtml(t.due_date || '-')}</p>
          </div>
        </div>`).join('') || '<p class="muted">No extra maintenance tasks.</p>'}
    </section>
  `
}

async function renderQR() {
  content().innerHTML = `
    ${renderHeader('LIVE FLEET OVERVIEW', 'QR Labels', '<button onclick="window.print()">Print</button>')}
    <p class="lead">Print these and place them on equipment. Scanning opens the exact asset record.</p>
    <section id="qrGrid" class="qr-grid"></section>
  `

  const grid = document.querySelector('#qrGrid')
  for (const a of assets) {
    const url = `${location.origin}${location.pathname}#asset/${a.id}`
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 360 })
    grid.innerHTML += `
      <div class="qr-card">
        <h2>${escapeHtml(a.name)}</h2>
        <p>${escapeHtml(a.type || 'Asset')} • ${escapeHtml(a.location || '')}</p>
        <img src="${qr}" alt="QR code for ${escapeHtml(a.name)}" />
        <p>Scan → open asset → report fault</p>
        <div class="qr-actions">
          <button onclick="window.open('${url}', '_blank')">Open</button>
          <button onclick="navigator.clipboard.writeText('${url}')">Copy Link</button>
        </div>
      </div>
    `
  }
}

function renderReports() {
  const totalCost = repairs.reduce((sum, r) => sum + Number(r.cost || 0), 0)
  const downtime = repairs.reduce((sum, r) => sum + Number(r.downtime_hours || 0), 0)
  const monthly = buildMonthlyReportData(repairs)
  const topAssets = buildTopFaultAssets(repairs, assets)
  const openCount = repairs.filter(r => r.status !== 'Resolved').length
  const resolvedCount = repairs.filter(r => r.status === 'Resolved').length

  content().innerHTML = `
    ${renderHeader('REPORTING', 'Reports')}
    <section class="stats-grid">
      ${statCard('Total Assets', assets.length, 'Active registered equipment')}
      ${statCard('Fault Records', repairs.length, 'All tickets')}
      ${statCard('Open Faults', openCount, 'Tickets not resolved')}
      ${statCard('Repair Cost', `£${totalCost.toFixed(2)}`, 'Logged repair spend')}
      ${statCard('Downtime', `${downtime.toFixed(1)}h`, 'Logged machine downtime')}
    </section>

    <section class="report-grid">
      <div class="card report-card">
        <div class="section-title-row">
          <div>
            <h2>Monthly Downtime Trend</h2>
            <p class="muted">Used by management to check whether maintenance activity is reducing lost operating time.</p>
          </div>
        </div>
        ${lineChartSvg(monthly.labels, monthly.downtime, 'Downtime hours')}
      </div>

      <div class="card report-card">
        <div class="section-title-row">
          <div>
            <h2>Monthly Ticket Trend</h2>
            <p class="muted">Tracks whether the number of faults being raised is reducing over time.</p>
          </div>
        </div>
        ${lineChartSvg(monthly.labels, monthly.tickets, 'Tickets raised')}
      </div>

      <div class="card report-card">
        <h2>Open vs Resolved</h2>
        <p class="muted">Snapshot of current repair control health.</p>
        ${barList([
          { label: 'Open', value: openCount, tone: 'warning' },
          { label: 'Resolved', value: resolvedCount, tone: 'ok' }
        ])}
      </div>

      <div class="card report-card">
        <h2>Top Fault Assets</h2>
        <p class="muted">Assets generating the highest number of tickets.</p>
        ${barList(topAssets.length ? topAssets : [{ label: 'No ticket data yet', value: 0, tone: 'ok' }])}
      </div>
    </section>
  `
}

function buildMonthlyReportData(repairRows) {
  const months = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString(undefined, { month: 'short' }),
      tickets: 0,
      downtime: 0
    })
  }

  const byKey = Object.fromEntries(months.map(m => [m.key, m]))
  repairRows.forEach(r => {
    if (!r.created_at) return
    const d = new Date(r.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!byKey[key]) return
    byKey[key].tickets += 1
    byKey[key].downtime += Number(r.downtime_hours || 0)
  })

  return {
    labels: months.map(m => m.label),
    tickets: months.map(m => m.tickets),
    downtime: months.map(m => Number(m.downtime.toFixed(1)))
  }
}

function buildTopFaultAssets(repairRows, assetRows) {
  const counts = {}
  repairRows.forEach(r => {
    if (!r.asset_id) return
    counts[r.asset_id] = (counts[r.asset_id] || 0) + 1
  })
  return Object.entries(counts)
    .map(([assetId, value]) => ({
      label: assetRows.find(a => a.id === assetId)?.name || 'Unknown Asset',
      value,
      tone: value >= 3 ? 'danger' : value >= 2 ? 'warning' : 'ok'
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
}

function lineChartSvg(labels, values, title) {
  const w = 640
  const h = 240
  const pad = 38
  const max = Math.max(...values, 1)
  const points = values.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(values.length - 1, 1)
    const y = h - pad - (Number(v) / max) * (h - pad * 2)
    return { x, y, v }
  })
  const polyline = points.map(p => `${p.x},${p.y}`).join(' ')
  const area = `${pad},${h - pad} ${polyline} ${w - pad},${h - pad}`

  return `
    <div class="chart-wrap" role="img" aria-label="${escapeHtml(title)} chart">
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chartGlow" x1="0" x2="1">
            <stop offset="0" stop-color="#24e2aa" stop-opacity="0.72" />
            <stop offset="1" stop-color="#5db6ff" stop-opacity="0.72" />
          </linearGradient>
          <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="#24e2aa" stop-opacity="0.20" />
            <stop offset="1" stop-color="#5db6ff" stop-opacity="0.00" />
          </linearGradient>
        </defs>
        <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" class="chart-axis" />
        <polygon points="${area}" fill="url(#chartFill)"></polygon>
        <polyline points="${polyline}" fill="none" stroke="url(#chartGlow)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></polyline>
        ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="6" class="chart-dot"><title>${p.v}</title></circle>`).join('')}
        ${labels.map((label, i) => {
          const x = pad + (i * (w - pad * 2)) / Math.max(labels.length - 1, 1)
          return `<text x="${x}" y="${h - 10}" text-anchor="middle" class="chart-label">${escapeHtml(label)}</text>`
        }).join('')}
      </svg>
      <div class="chart-values">
        ${labels.map((label, i) => `<span><b>${escapeHtml(String(values[i]))}</b><small>${escapeHtml(label)}</small></span>`).join('')}
      </div>
    </div>
  `
}

function barList(items) {
  const max = Math.max(...items.map(i => Number(i.value) || 0), 1)
  return `
    <div class="bar-list">
      ${items.map(item => `
        <div class="bar-row ${item.tone || ''}">
          <div class="bar-meta"><span>${escapeHtml(item.label)}</span><b>${escapeHtml(String(item.value))}</b></div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (Number(item.value) || 0) / max * 100)}%"></div></div>
        </div>
      `).join('')}
    </div>
  `
}


window.resolveRepair = resolveRepair

window.toast = toast
window.openImagePreview = openImagePreview

function repairAgeHours(repair) {
  if (!repair?.created_at || repair.status === 'Resolved') return 0
  return Math.max(0, (Date.now() - new Date(repair.created_at).getTime()) / 36e5)
}

function getRepairHealth(repair) {
  if (repair.status === 'Resolved') return { state: 'resolved', label: 'Resolved' }
  const priority = repair.priority || 'Medium'
  const limit = slaHours[priority] || slaHours.Medium
  const age = repairAgeHours(repair)
  if (age >= limit) return { state: 'overdue', label: 'Overdue' }
  if (age >= limit * 0.75) return { state: 'warning', label: 'Approaching SLA' }
  return { state: 'healthy', label: `${Math.max(1, Math.round(limit - age))}h SLA left` }
}

function formatAge(dateValue) {
  if (!dateValue) return 'Unknown date'
  const hours = Math.max(0, Math.round((Date.now() - new Date(dateValue).getTime()) / 36e5))
  if (hours < 24) return `${hours || 1}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function statusClass(status = 'Operational') {
  return String(status).toLowerCase().replace(/\s+/g, '-')
}

function assetHistoryTimeline(asset, assetRepairs) {
  const items = [
    { date: asset.created_at, title: 'Asset created', body: `${asset.type || 'Asset'} registered in ${asset.location || 'no location set'}`, tone: 'created' },
    ...assetRepairs.map(r => ({
      date: r.created_at,
      title: r.status === 'Resolved' ? `Fault resolved: ${r.title || 'Ticket'}` : `Fault reported: ${r.title || 'Ticket'}`,
      body: `${r.priority || 'Medium'} priority • ${r.status || 'Open'}${r.resolution_notes ? ` • ${r.resolution_notes}` : ''}`,
      tone: r.status === 'Resolved' ? 'resolved' : getRepairHealth(r).state,
      photo: r.photo_url
    }))
  ].filter(i => i.date).sort((a,b) => new Date(b.date) - new Date(a.date))

  if (!items.length) return '<p class="muted">No history yet.</p>'

  return `<div class="timeline">${items.map(i => `
    <div class="timeline-item ${i.tone}">
      <div class="timeline-dot"></div>
      <div class="timeline-body">
        <strong>${escapeHtml(i.title)}</strong>
        <span>${new Date(i.date).toLocaleString()}</span>
        <p>${escapeHtml(i.body)}</p>
        ${i.photo ? `<img class="timeline-thumb" src="${escapeHtml(i.photo)}" onclick="window.openImagePreview('${escapeHtml(i.photo)}', '${escapeHtml(i.title)}')" />` : ''}
      </div>
    </div>`).join('')}</div>`
}

function openImagePreview(url, title = 'Repair photo') {
  let modal = document.querySelector('#imagePreviewModal')
  if (!modal) {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="imagePreviewModal" class="image-modal hidden">
        <div class="image-backdrop" onclick="window.closeImagePreview()"></div>
        <figure class="image-card">
          <button class="icon-btn" onclick="window.closeImagePreview()">×</button>
          <img id="imagePreviewSrc" src="" alt="Repair image preview" />
          <figcaption id="imagePreviewCaption"></figcaption>
        </figure>
      </div>
    `)
    modal = document.querySelector('#imagePreviewModal')
  }
  document.querySelector('#imagePreviewSrc').src = url
  document.querySelector('#imagePreviewCaption').textContent = title
  modal.classList.remove('hidden')
}

window.closeImagePreview = function closeImagePreview() {
  document.querySelector('#imagePreviewModal')?.classList.add('hidden')
}



function workflowKeyForAsset(asset = {}) {
  const text = `${asset.type || ''} ${asset.name || ''} ${asset.model || ''}`.toLowerCase()
  if (text.includes('agv')) return 'AGV'
  if (text.includes('wash') || text.includes('cure')) return 'WASH_CURE'
  if (text.includes('resin') || text.includes('sla') || text.includes('msla')) return 'RESIN'
  if (text.includes('fdm') || text.includes('printer') || text.includes('3d')) return 'FDM'
  return 'GENERAL'
}

function serviceOutcomeNeedsReason(value = '') {
  return !['pass', 'good', 'ok', 'n/a', 'na'].includes(String(value).trim().toLowerCase())
}

function serviceFieldHtml([key, label, type]) {
  if (type === 'text') {
    return `<label class="field-label service-field">${escapeHtml(label)}<input data-service-key="${key}" data-service-label="${escapeHtml(label)}" placeholder="Enter ${escapeHtml(label.toLowerCase())}" /></label>`
  }
  if (type === 'textarea') {
    return `<label class="field-label service-field wide">${escapeHtml(label)}<textarea data-service-key="${key}" data-service-label="${escapeHtml(label)}" placeholder="Add notes for ${escapeHtml(label.toLowerCase())}"></textarea></label>`
  }
  return `
    <div class="field-label service-field service-check" data-check-wrap="${key}">
      <label>${escapeHtml(label)}</label>
      <select data-service-key="${key}" data-service-label="${escapeHtml(label)}" data-service-check="true">
        ${serviceResultOptions.map(o => `<option>${o}</option>`).join('')}
      </select>
      <textarea class="service-reason hidden" data-service-reason="${key}" placeholder="Reason / action required if this did not pass"></textarea>
    </div>
  `
}

function ensureServiceModal() {
  if (document.querySelector('#serviceModal')) return
  document.body.insertAdjacentHTML('beforeend', `
    <div id="serviceModal" class="service-modal hidden" aria-hidden="true">
      <div class="service-backdrop" onclick="window.closeServiceModal()"></div>
      <section class="service-card" role="dialog" aria-modal="true">
        <div class="resolve-motion" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="resolve-head">
          <div>
            <p class="eyebrow">SERVICE WORKFLOW</p>
            <h2 id="serviceWorkflowTitle">Service Asset</h2>
            <p id="serviceAssetName" class="muted">Asset</p>
            <small id="serviceWorkflowDescription" class="muted"></small>
          </div>
          <button class="icon-btn" onclick="window.closeServiceModal()" title="Close">×</button>
        </div>
        <div id="serviceMessage" class="message hidden"></div>
        <div id="serviceFields" class="service-grid"></div>
        <div class="form-grid service-footer-grid">
          <label class="field-label">Parts replaced<input id="servicePartsReplaced" placeholder="Parts replaced during service" /></label>
          <label class="field-label">Next service due<input id="serviceNextDue" type="date" /></label>
        </div>
        <label class="field-label">Engineer notes<textarea id="serviceEngineerNotes" placeholder="Overall findings, recommendations, outstanding risks or actions"></textarea></label>
        <div class="resolve-actions">
          <button class="ghost" onclick="window.closeServiceModal()">Cancel</button>
          <button id="saveServiceRecord" class="primary">Complete Service</button>
        </div>
      </section>
    </div>
  `)
}

function openServiceModal(assetId) {
  ensureServiceModal()
  const asset = assets.find(a => a.id === assetId)
  if (!asset) return toast('Asset not found.', 'error')
  const key = workflowKeyForAsset(asset)
  const workflow = serviceWorkflows[key] || serviceWorkflows.GENERAL
  const modal = document.querySelector('#serviceModal')
  modal.dataset.assetId = assetId
  modal.dataset.workflowKey = key
  document.querySelector('#serviceWorkflowTitle').textContent = workflow.label
  document.querySelector('#serviceAssetName').textContent = asset.name || 'Unnamed asset'
  document.querySelector('#serviceWorkflowDescription').textContent = workflow.description
  document.querySelector('#serviceFields').innerHTML = workflow.fields.map(serviceFieldHtml).join('')
  document.querySelector('#servicePartsReplaced').value = ''
  document.querySelector('#serviceEngineerNotes').value = ''
  const defaultDue = new Date()
  defaultDue.setDate(defaultDue.getDate() + 90)
  document.querySelector('#serviceNextDue').value = asset.next_service_date || defaultDue.toISOString().slice(0, 10)
  document.querySelector('#serviceMessage').className = 'message hidden'

  document.querySelectorAll('[data-service-check="true"]').forEach(select => {
    const key = select.dataset.serviceKey
    const reason = document.querySelector(`[data-service-reason="${key}"]`)
    const toggle = () => reason?.classList.toggle('hidden', !serviceOutcomeNeedsReason(select.value))
    select.addEventListener('change', toggle)
    toggle()
  })

  document.querySelector('#saveServiceRecord').onclick = () => saveServiceRecord(assetId)
  modal.classList.remove('hidden')
}

function closeServiceModal() {
  document.querySelector('#serviceModal')?.classList.add('hidden')
}

function collectServiceData() {
  const checks = []
  document.querySelectorAll('[data-service-key]').forEach(input => {
    if (input.dataset.serviceReason) return
    const key = input.dataset.serviceKey
    const label = input.dataset.serviceLabel || key
    const value = input.value || ''
    const reason = document.querySelector(`[data-service-reason="${key}"]`)?.value || ''
    checks.push({ key, label, value, reason })
  })
  return checks
}

async function saveServiceRecord(assetId) {
  const asset = assets.find(a => a.id === assetId)
  const workflowKey = document.querySelector('#serviceModal')?.dataset.workflowKey || workflowKeyForAsset(asset)
  const nextDue = value('#serviceNextDue')
  const partsReplaced = value('#servicePartsReplaced')
  const engineerNotes = value('#serviceEngineerNotes')
  const checks = collectServiceData()
  const flagged = checks.filter(c => serviceOutcomeNeedsReason(c.value) && c.value)
  const summary = {
    asset: asset?.name || assetId,
    workflow: workflowKey,
    completed_at: new Date().toISOString(),
    next_service_due: nextDue,
    parts_replaced: partsReplaced,
    engineer_notes: engineerNotes,
    findings: checks,
    flagged_findings: flagged
  }

  const { error } = await supabase
    .from('assets')
    .update({ status: flagged.length ? 'Needs Attention' : 'Operational', next_service_date: nextDue || null })
    .eq('id', assetId)

  if (error) {
    const box = document.querySelector('#serviceMessage')
    box.textContent = error.message
    box.className = 'message error'
    return
  }

  if (repairs.some(r => r.asset_id === assetId && r.status !== 'Resolved')) await updateAssetStatusFromRepairs(assetId)
  await audit('asset_serviced', 'assets', JSON.stringify(summary))
  toast('Service completed.', 'success')
  closeServiceModal()
  await loadData()
  const hash = location.hash.replace('#', '')
  if (hash.startsWith('asset/')) renderAssetDetail(assetId)
  else renderMaintenance()
}

async function markServiced(assetId) {
  openServiceModal(assetId)
}

window.openServiceModal = openServiceModal
window.closeServiceModal = closeServiceModal
window.markServiced = markServiced

async function audit(action, tableName, detail) {
  try {
    await supabase.from('audit_log').insert({
      action,
      table_name: tableName,
      detail,
      user_email: session?.user?.email || 'unknown'
    })
  } catch (err) {
    console.warn('Audit skipped:', err.message)
  }
}

function escapeHtml(input) {
  return String(input ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
