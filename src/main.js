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

const statusOptions = ['Operational', 'Needs Attention', 'Under Repair', 'Out of Service']
const priorityOptions = ['Low', 'Medium', 'High', 'Critical']
const repairStatusOptions = ['Open', 'Diagnosing', 'Waiting Parts', 'In Repair', 'Resolved']

init()

async function init() {
  const { data, error } = await supabase.auth.getSession()
  if (error) console.warn(error.message)
  session = data?.session || null

  window.addEventListener('hashchange', handleRoute)

  if (!session) {
    renderAuth()
    return
  }

  await loadData()
  handleRoute()
}

function showMessage(message, type = 'info') {
  const box = document.querySelector('#messageBox')
  if (!box) return alert(message)
  box.textContent = message
  box.className = `message ${type}`
}

function renderAuth() {
  app.innerHTML = `
    <section class="auth-page">
      <div class="auth-card glass">
        <div class="brand-lockup">
          <div class="orb"></div>
          <div>
            <h1>Medstrom Asset Management</h1>
            <p>Secure access required.</p>
          </div>
        </div>
        <div id="messageBox" class="message hidden"></div>
        <input id="email" type="email" placeholder="Email" autocomplete="email" />
        <input id="password" type="password" placeholder="Password" autocomplete="current-password" />
        <button id="authAction" class="primary">Log in</button>
        <button id="authToggle" class="ghost">Need an account? Sign up</button>
      </div>
    </section>
  `

  let signupMode = false
  const action = document.querySelector('#authAction')
  const toggle = document.querySelector('#authToggle')

  toggle.addEventListener('click', () => {
    signupMode = !signupMode
    action.textContent = signupMode ? 'Create account' : 'Log in'
    toggle.textContent = signupMode ? 'Already have an account? Log in' : 'Need an account? Sign up'
    showMessage('', 'hidden')
  })

  action.addEventListener('click', async () => {
    const email = document.querySelector('#email').value.trim()
    const password = document.querySelector('#password').value.trim()

    if (!email || !password) return showMessage('Enter an email and password.', 'error')
    if (password.length < 6) return showMessage('Password must be at least 6 characters.', 'error')

    action.disabled = true
    action.textContent = signupMode ? 'Creating account...' : 'Logging in...'

    const result = signupMode
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })

    action.disabled = false
    action.textContent = signupMode ? 'Create account' : 'Log in'

    if (result.error) return showMessage(result.error.message, 'error')

    if (signupMode && !result.data.session) {
      showMessage('Account created. Check your email if confirmation is enabled, then log in.', 'success')
      signupMode = false
      action.textContent = 'Log in'
      toggle.textContent = 'Need an account? Sign up'
      return
    }

    location.reload()
  })
}

async function loadData() {
  const [assetResult, repairResult, maintenanceResult] = await Promise.all([
    supabase.from('assets').select('*').order('created_at', { ascending: false }),
    supabase.from('repair_tickets').select('*').order('created_at', { ascending: false }),
    supabase.from('maintenance_tasks').select('*').order('due_date', { ascending: true })
  ])

  if (assetResult.error) console.warn(assetResult.error.message)
  if (repairResult.error) console.warn(repairResult.error.message)
  if (maintenanceResult.error && !maintenanceResult.error.message.includes('maintenance_tasks')) console.warn(maintenanceResult.error.message)

  assets = assetResult.data || []
  repairs = repairResult.data || []
  maintenance = maintenanceResult.data || []
}

function handleRoute() {
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
        ${navButton('repairs', 'Repairs')}
        ${navButton('maintenance', 'Maintenance')}
        ${navButton('qr', 'QR Labels')}
        ${navButton('reports', 'Reports')}
        <button id="logout" class="nav danger">Log out</button>
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
      await supabase.auth.signOut()
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

  content().innerHTML = `
    ${renderHeader('LIVE FLEET OVERVIEW', 'Dashboard', '<button id="refresh">Refresh</button>')}
    <section class="stats-grid">
      ${statCard('Total Assets', assets.length, 'Registered equipment')}
      ${statCard('Operational', operational, 'Available for use')}
      ${statCard('Under Repair', underRepair, 'Active engineering work')}
      ${statCard('Needs Attention', attention, 'Service or inspection required')}
      ${statCard('Open Repairs', openRepairs, 'Tickets not resolved')}
    </section>
    <section class="grid two">
      <div class="card">
        <h2>Recent Assets</h2>
        ${assets.slice(0, 6).map(assetRow).join('') || '<p class="muted">No assets yet.</p>'}
      </div>
      <div class="card">
        <h2>Recent Repairs</h2>
        ${repairs.slice(0, 6).map(repairRow).join('') || '<p class="muted">No repair tickets yet.</p>'}
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
        <input id="assetType" placeholder="Type e.g. 3D Printer" />
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
        <small>Status: ${escapeHtml(a.status || 'Operational')}</small>
      </div>
      <div class="row-actions">
        <button onclick="location.hash='asset/${a.id}'">Open</button>
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
    ${renderHeader('ASSET RECORD', escapeHtml(a.name), '<button onclick="location.hash=\'assets\'">Back</button>')}
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
        <button onclick="navigator.clipboard.writeText('${qrUrl}')">Copy Asset Link</button>
      </div>
    </section>
    <section class="card">
      <h2>Quick Log Repair</h2>
      <p class="muted">QR workflow: scan, describe fault, attach photo, submit.</p>
      <div id="messageBox" class="message hidden"></div>
      <input id="repairTitle" placeholder="Fault title" />
      <textarea id="repairDesc" placeholder="Fault description"></textarea>
      <div class="form-grid">
        <select id="repairPriority">${priorityOptions.map(o => `<option>${o}</option>`).join('')}</select>
        <select id="repairStatus">${repairStatusOptions.map(o => `<option>${o}</option>`).join('')}</select>
        <input id="repairCost" type="number" step="0.01" placeholder="Cost £" />
        <input id="repairDowntime" type="number" step="0.1" placeholder="Downtime hours" />
      </div>
      <input id="repairParts" placeholder="Parts used" />
      <label class="file-label">Attach photo <input id="repairPhoto" type="file" accept="image/*" /></label>
      <button id="saveRepair" class="primary">Save Repair</button>
    </section>
    <section class="card">
      <h2>Repair History</h2>
      ${assetRepairs.map(repairRow).join('') || '<p class="muted">No repairs logged.</p>'}
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
  if (error) {
    showMessage(`Photo upload skipped: ${error.message}`, 'error')
    return null
  }

  const { data } = supabase.storage.from('repair-photos').getPublicUrl(path)
  return data?.publicUrl || null
}

async function updateAssetStatusFromRepairs(assetId) {
  const { data, error } = await supabase
    .from('repair_tickets')
    .select('status, priority')
    .eq('asset_id', assetId)
    .neq('status', 'Resolved')

  if (error) return console.warn(error.message)

  let nextStatus = 'Operational'
  if (data?.some(r => r.status === 'In Repair')) nextStatus = 'Under Repair'
  else if (data?.length) nextStatus = 'Needs Attention'

  await supabase.from('assets').update({ status: nextStatus }).eq('id', assetId)
}

function openResolveModal(repairId, assetId) {
  ensureResolveModal()
  const repair = repairs.find(r => r.id === repairId)
  const asset = assets.find(a => a.id === assetId)

  resolveContext = { repairId, assetId }
  resolvingTicket = false

  document.querySelector('#resolveTicketTitle').textContent = repair?.title || 'Repair Ticket'
  document.querySelector('#resolveAssetName').textContent = asset?.name || 'Unknown asset'
  document.querySelector('#resolveMeta').textContent = `${repair?.priority || 'Medium'} priority • ${repair?.status || 'Open'}`
  document.querySelector('#resolutionNotes').value = repair?.resolution_notes || ''
  document.querySelector('#resolutionParts').value = repair?.parts_used || ''
  document.querySelector('#resolutionCost').value = repair?.cost || ''
  document.querySelector('#resolutionDowntime').value = repair?.downtime_hours || ''
  document.querySelector('#resolveSuccess').classList.add('hidden')
  document.querySelector('#resolveModal').classList.remove('hidden')
}

function closeResolveModal() {
  document.querySelector('#resolveModal')?.classList.add('hidden')
  resolveContext = null
  resolvingTicket = false
}

async function confirmResolveRepair() {
  if (!resolveContext || resolvingTicket) return

  const confirmBtn = document.querySelector('#confirmResolve')
  const notes = value('#resolutionNotes')
  const parts = value('#resolutionParts')
  const costValue = value('#resolutionCost')
  const downtimeValue = value('#resolutionDowntime')

  if (!notes) {
    toast('Add resolution notes before closing the ticket.', 'error')
    return
  }

  resolvingTicket = true
  confirmBtn.disabled = true
  confirmBtn.innerHTML = '<span class="btn-spinner"></span> Resolving...'

  const { error } = await supabase
    .from('repair_tickets')
    .update({
      status: 'Resolved',
      resolved_at: new Date().toISOString(),
      resolution_notes: notes,
      parts_used: parts || null,
      cost: costValue ? Number(costValue) : null,
      downtime_hours: downtimeValue ? Number(downtimeValue) : null
    })
    .eq('id', resolveContext.repairId)

  confirmBtn.disabled = false
  confirmBtn.innerHTML = 'Resolve Ticket'
  resolvingTicket = false

  if (error) {
    toast(error.message, 'error')
    return
  }

  await updateAssetStatusFromRepairs(resolveContext.assetId)
  await audit('repair_resolved', 'repair_tickets', notes || resolveContext.repairId)
  await loadData()

  document.querySelector('#resolveSuccess').classList.remove('hidden')
  toast('Repair ticket resolved.', 'success')

  const assetId = resolveContext.assetId
  setTimeout(() => {
    closeResolveModal()
    const hash = location.hash.replace('#', '')
    if (hash.startsWith('asset/')) renderAssetDetail(assetId)
    else renderRepairs()
  }, 850)
}

function ensureResolveModal() {
  if (document.querySelector('#resolveModal')) return

  document.body.insertAdjacentHTML('beforeend', `
    <div id="resolveModal" class="resolve-modal hidden" aria-hidden="true">
      <div class="resolve-backdrop" data-close-resolve></div>
      <section class="resolve-card" role="dialog" aria-modal="true" aria-labelledby="resolveTicketTitle">
        <div class="resolve-motion" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>

        <div class="resolve-head">
          <div>
            <p class="eyebrow">REPAIR CLOSURE</p>
            <h2 id="resolveTicketTitle">Resolve Repair</h2>
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
            <input id="resolutionCost" type="number" step="0.01" placeholder="0.00" />
          </label>
          <label class="field-label">Downtime (hours)
            <input id="resolutionDowntime" type="number" step="0.1" placeholder="0.0" />
          </label>
        </div>

        <div class="resolve-actions">
          <button id="cancelResolve" class="ghost">Cancel</button>
          <button id="confirmResolve" class="primary">Resolve Ticket</button>
        </div>
      </section>
    </div>
  `)

  document.querySelector('#closeResolve').onclick = closeResolveModal
  document.querySelector('#cancelResolve').onclick = closeResolveModal
  document.querySelector('[data-close-resolve]').onclick = closeResolveModal
  document.querySelector('#confirmResolve').onclick = confirmResolveRepair
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
  const selectedAsset = assetId || value('#repairAsset')
  if (!selectedAsset) return showMessage('Select an asset.', 'error')
  const title = value('#repairTitle')
  if (!title) return showMessage('Repair title is required.', 'error')

  const payload = {
    asset_id: selectedAsset,
    title,
    description: value('#repairDesc'),
    priority: value('#repairPriority') || 'Medium',
    status: value('#repairStatus') || 'Open',
    cost: value('#repairCost') ? Number(value('#repairCost')) : null,
    downtime_hours: value('#repairDowntime') ? Number(value('#repairDowntime')) : null,
    parts_used: value('#repairParts'),
    photo_url: await uploadRepairPhoto()
  }

  const { error } = await supabase.from('repair_tickets').insert(payload)
  if (error) return showMessage(error.message, 'error')

  await updateAssetStatusFromRepairs(selectedAsset)
  await audit('repair_logged', 'repair_tickets', title)

  await loadData()
  if (assetId) renderAssetDetail(assetId)
  else renderRepairs()
}

function renderRepairs() {
  content().innerHTML = `
    ${renderHeader('REPAIR CONTROL', 'Repairs')}
    <section class="card repair-form-card">
      <div class="section-title-row">
        <div>
          <h2>New Repair Ticket</h2>
          <p class="muted">Log a fault, attach evidence and update asset status in one workflow.</p>
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
          <div class="field-block">
            <label>Status</label>
            <select id="repairStatus">${repairStatusOptions.map(o => `<option>${o}</option>`).join('')}</select>
          </div>
          <div class="field-block">
            <label>Estimated cost</label>
            <input id="repairCost" type="number" step="0.01" placeholder="£0.00" />
          </div>
          <div class="field-block">
            <label>Downtime</label>
            <input id="repairDowntime" type="number" step="0.1" placeholder="Hours" />
          </div>
        </div>

        <div class="field-block wide">
          <label>Parts used / required</label>
          <input id="repairParts" placeholder="e.g. nozzle, PTFE tube, belt, sensor, control board..." />
        </div>

        <label class="file-label premium-upload">
          <span class="upload-icon">＋</span>
          <span class="upload-copy">
            <strong>Attach repair photo</strong>
            <small>Upload evidence of the fault, damage or completed repair.</small>
          </span>
          <input id="repairPhoto" type="file" accept="image/*" />
        </label>

        <div class="form-actions">
          <button id="addRepair" class="primary">Create Ticket</button>
        </div>
      </div>
    </section>
    <section class="card">
      <h2>Repair Tickets</h2>
      ${repairs.map(repairRow).join('') || '<p class="muted">No repair tickets yet.</p>'}
    </section>
  `
  document.querySelector('#addRepair').onclick = () => addRepair()
}

function repairRow(r) {
  const asset = assets.find(a => a.id === r.asset_id)
  const resolved = r.status === 'Resolved'
  return `
    <div class="data-row repair-row ${resolved ? 'resolved' : ''}">
      <div class="repair-main">
        <h3>${escapeHtml(r.title || 'Untitled repair')}</h3>
        <p>${escapeHtml(asset?.name || 'Unknown Asset')} • ${escapeHtml(r.priority || 'Medium')} • ${escapeHtml(r.status || 'Open')}</p>
        <small>${escapeHtml(r.description || '')}</small>
        ${r.resolution_notes ? `<small><b>Resolution:</b> ${escapeHtml(r.resolution_notes)}</small>` : ''}
        ${r.resolved_at ? `<small>Resolved: ${new Date(r.resolved_at).toLocaleString()}</small>` : ''}
      </div>
      ${r.photo_url ? `<img class="repair-thumb" src="${escapeHtml(r.photo_url)}" alt="Repair photo" />` : ''}
      <div class="row-actions">
        ${!resolved ? `<button class="resolve-btn" onclick="window.resolveRepair('${r.id}', '${r.asset_id}')">Resolve</button>` : '<span class="pill ok">Resolved</span>'}
      </div>
    </div>
  `
}

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
          <div class="row-actions"><button onclick="window.markServiced('${a.id}')">Mark Serviced</button></div>
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
        <p>Scan for service record</p>
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
  content().innerHTML = `
    ${renderHeader('REPORTING', 'Reports')}
    <section class="stats-grid">
      ${statCard('Total Assets', assets.length, 'Registered equipment')}
      ${statCard('Repair Tickets', repairs.length, 'All tickets')}
      ${statCard('Repair Cost', `£${totalCost.toFixed(2)}`, 'Logged repair spend')}
      ${statCard('Downtime', `${downtime.toFixed(1)}h`, 'Logged machine downtime')}
    </section>
  `
}

window.resolveRepair = resolveRepair

async function markServiced(assetId) {
  const days = Number(prompt('Next service due in how many days?', '90') || 90)
  const due = new Date()
  due.setDate(due.getDate() + days)
  const next = due.toISOString().slice(0, 10)
  const { error } = await supabase.from('assets').update({ status: 'Operational', next_service_date: next }).eq('id', assetId)
  if (error) return alert(error.message)
  await audit('asset_serviced', 'assets', `Next due ${next}`)
  await loadData()
  renderMaintenance()
}

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
