import './style.css'
import QRCode from 'qrcode'
import { supabase } from './supabase.js'

const app = document.querySelector('#app')

let session = null
let assets = []
let repairs = []
let maintenance = []
let serviceRecords = []
let partsInventory = []
let partsUsage = []
let activePage = 'dashboard'
let resolveContext = null
let resolvingTicket = false

const statusOptions = ['Operational', 'Needs Attention', 'Under Repair', 'Out of Service']
const priorityOptions = ['Low', 'Medium', 'High', 'Critical']
const repairStatusOptions = ['Open', 'Diagnosing', 'Waiting Parts', 'In Repair', 'Resolved']
const slaHours = { Low: 168, Medium: 72, High: 24, Critical: 8 }


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
      <div class="auth-card glass hub-entry-card">
        <div class="brand-lockup hub-lockup">
          <div class="orb"></div>
          <div>
            <p class="eyebrow">MEDSTROM ENGINEERING</p>
            <h1>Maintenance Hub</h1>
            <p>Intelligent maintenance platform</p>
          </div>
        </div>
        <div id="messageBox" class="message hidden"></div>
        <button id="authAction" class="primary enter-button">Enter</button>
        <small class="muted">Secure Supabase session starts automatically in the background.</small>
      </div>
    </section>
  `

  const action = document.querySelector('#authAction')

  action.addEventListener('click', async () => {
    const email = import.meta.env.VITE_MAINTENANCE_GUEST_EMAIL
    const password = import.meta.env.VITE_MAINTENANCE_GUEST_PASSWORD

    if (!email || !password) {
      return showMessage('Guest access is not configured. Add VITE_MAINTENANCE_GUEST_EMAIL and VITE_MAINTENANCE_GUEST_PASSWORD to your .env file.', 'error')
    }

    action.disabled = true
    action.textContent = 'Entering...'

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    action.disabled = false
    action.textContent = 'Enter'

    if (error) return showMessage(error.message, 'error')

    session = data?.session || null
    await loadData()
    location.hash = location.hash || 'dashboard'
    handleRoute()
  })
}

async function loadData() {
  const [assetResult, repairResult, maintenanceResult, serviceResult, partsResult, usageResult] = await Promise.all([
    safeAssetsQuery(),
    supabase.from('repair_tickets').select('*').order('created_at', { ascending: false }),
    supabase.from('maintenance_tasks').select('*').order('due_date', { ascending: true }),
    supabase.from('service_records').select('*').order('service_date', { ascending: false }),
    supabase.from('parts_inventory').select('*').order('part_name', { ascending: true }),
    supabase.from('parts_usage').select('*').order('created_at', { ascending: false })
  ])

  if (assetResult.error) console.warn(assetResult.error.message)
  if (repairResult.error) console.warn(repairResult.error.message)
  if (maintenanceResult.error && !String(maintenanceResult.error.message).includes('maintenance_tasks')) console.warn(maintenanceResult.error.message)
  if (serviceResult.error && !String(serviceResult.error.message).includes('service_records')) console.warn(serviceResult.error.message)
  if (partsResult?.error && !String(partsResult.error.message).includes('parts_inventory')) console.warn(partsResult.error.message)
  if (usageResult?.error && !String(usageResult.error.message).includes('parts_usage')) console.warn(usageResult.error.message)

  assets = assetResult.data || []
  repairs = repairResult.data || []
  maintenance = maintenanceResult.data || []
  serviceRecords = serviceResult.data || []
  partsInventory = partsResult?.data || []
  partsUsage = usageResult?.data || []
}

async function safeAssetsQuery() {
  const filtered = await supabase
    .from('assets')
    .select('*')
    .or('archived.is.null,archived.eq.false')
    .order('created_at', { ascending: false })

  if (!filtered.error) return filtered

  const fallback = await supabase
    .from('assets')
    .select('*')
    .order('created_at', { ascending: false })

  if (!fallback.error) {
    fallback.data = (fallback.data || []).filter(a => a.archived !== true)
    return fallback
  }
  return filtered
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
        ${navButton('agv', 'AGV Fleet')}
        ${navButton('printers', '3D Printer Fleet')}
        ${navButton('maintenance', 'Maintenance')}
        ${navButton('parts', 'Parts Inventory')}
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
  if (activePage === 'agv') return renderFleetPage('agv')
  if (activePage === 'printers') return renderFleetPage('printer')
  if (activePage === 'maintenance') return renderMaintenance()
  if (activePage === 'parts') return renderPartsInventory()
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
      ${statCard('Overdue Repairs', overdueRepairs, `${criticalOpen} critical open`)}
    </section>
    <section class="grid three intelligence-grid">
      <div class="card intelligence-card">
        <h2>Maintenance Intelligence</h2>
        <p class="muted">Calculated from faults, downtime, overdue service and repeat issues.</p>
        ${intelligenceSummary()}
      </div>
      <div class="card intelligence-card">
        <h2>Fleet Health</h2>
        <p class="muted">Live health average by equipment family.</p>
        ${fleetHealthSummary()}
      </div>
      <div class="card intelligence-card danger-glow">
        <h2>High Risk Radar</h2>
        <p class="muted">Assets needing engineering attention first.</p>
        ${highRiskAssets().map(a => compactHealthRow(a)).join('') || '<p class="muted">No high-risk assets detected.</p>'}
      </div>
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
            <p class="muted">SLA driven view of active repair risk.</p>
          </div>
        </div>
        ${repairs.filter(r => r.status !== 'Resolved').slice(0, 6).map(repairRow).join('') || '<p class="muted">No active repair tickets.</p>'}
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
  const health = calculateAssetHealth(a)
  return `
    <div class="data-row asset-health-row">
      <div>
        <h3>${escapeHtml(a.name || 'Unnamed Asset')}</h3>
        <p>${escapeHtml(a.type || 'Asset')} • ${escapeHtml(a.location || 'No location')}</p>
        <small>Status: <span class="status-pill ${statusClass(a.status)}">${escapeHtml(a.status || 'Operational')}</span></small>
      </div>
      <div class="health-mini ${health.tone}">
        <span>${health.score}</span>
        <small>${health.label}</small>
      </div>
      <div class="row-actions">
        <button onclick="location.hash='asset/${a.id}'">Open</button>
        <button class="danger subtle" onclick="event.stopPropagation(); window.archiveAsset('${a.id}', '${escapeHtml(a.name || 'this asset')}')">Archive</button>
      </div>
    </div>
  `
}

function openRepairsForAsset(assetRepairs = []) {
  const active = assetRepairs.filter(r => r.status !== 'Resolved').slice(0, 4)
  if (!active.length) return '<p class="muted">No open repairs for this asset.</p>'
  return active.map(r => {
    const health = getRepairHealth(r)
    return `<div class="asset-mini-row ${health.state}">
      <div><strong>${escapeHtml(r.title || 'Repair ticket')}</strong><small>${escapeHtml(r.priority || 'Medium')} • ${escapeHtml(r.status || 'Open')}</small></div>
      <span>${escapeHtml(health.label)}</span>
    </div>`
  }).join('')
}

function recentAssetParts(assetId) {
  const usage = partsUsage.filter(u => u.asset_id === assetId).slice(0, 5)
  if (!usage.length) return '<p class="muted">No stock parts fitted yet.</p>'
  return usage.map(u => {
    const part = partsInventory.find(p => p.id === u.part_id)
    const name = part?.part_name || part?.name || 'Inventory part'
    return `<div class="asset-mini-row">
      <div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(u.source_type || 'service')} • ${formatDate(u.created_at)}</small></div>
      <span>x${Number(u.quantity_used || 0)}</span>
    </div>`
  }).join('')
}

function recentServiceFindings(assetServices = []) {
  const rows = assetServices.slice(0, 5).map(s => {
    const findings = serviceFindingSummary(s)
    return `<div class="asset-mini-row service-finding-row">
      <div><strong>${escapeHtml(s.service_type || 'Service')}</strong><small>${escapeHtml(findings || s.corrective_action || s.issues_found || 'No findings recorded')}</small></div>
      <span>${formatDate(s.service_date || s.created_at)}</span>
    </div>`
  })
  return rows.join('') || '<p class="muted">No service findings recorded yet.</p>'
}

function serviceFindingSummary(record = {}) {
  const data = typeof record.service_data === 'string' ? safeJson(record.service_data) : (record.service_data || {})
  const findings = data.findings || {}
  const text = Object.entries(findings)
    .filter(([, v]) => v)
    .slice(0, 3)
    .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1')}: ${v}`)
    .join(' • ')
  return text
}

function safeJson(value) {
  try { return JSON.parse(value) } catch { return {} }
}

async function renderAssetDetail(id) {
  await loadData()
  const a = assets.find(item => item.id === id)
  if (!a) {
    content().innerHTML = `<button onclick="location.hash='assets'">Back</button><h1>Asset not found</h1>`
    return
  }
  const assetRepairs = repairs.filter(r => r.asset_id === id)
  const assetServices = serviceRecords.filter(r => r.asset_id === id)
  const health = calculateAssetHealth(a)
  const qrUrl = `${location.origin}${location.pathname}#asset/${a.id}`
  const qr = await QRCode.toDataURL(qrUrl)

  content().innerHTML = `
    ${renderHeader('ASSET RECORD', escapeHtml(a.name), `<button onclick="location.hash='assets'">Back</button><button class="danger subtle" onclick="window.archiveAsset('${a.id}', '${escapeHtml(a.name || 'this asset')}')">Archive Asset</button>`)}
    <section class="grid three asset-specific-grid">
      <div class="card intelligence-card">
        <h2>Open Repairs</h2>
        <p class="muted">Active engineering work for this asset only.</p>
        ${openRepairsForAsset(assetRepairs)}
      </div>
      <div class="card intelligence-card">
        <h2>Recent Parts Fitted</h2>
        <p class="muted">Parts deducted from stock against this asset.</p>
        ${recentAssetParts(a.id)}
      </div>
      <div class="card intelligence-card">
        <h2>Recent Service Findings</h2>
        <p class="muted">Latest non-pass inspection notes and actions.</p>
        ${recentServiceFindings(assetServices)}
      </div>
    </section>
    <section class="grid two">
      <div class="card asset-health-card ${health.tone}">
        <h2>Asset Health</h2>
        <div class="health-orb" style="--score:${health.score}"><span>${health.score}</span></div>
        <h3>${health.label}</h3>
        <p class="muted">${escapeHtml(health.reason)}</p>
      </div>
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
        <button onclick="navigator.clipboard.writeText('${qrUrl}'); window.toast?.('Asset link copied.', 'success')">Copy Asset Link</button>
        <button class="primary" onclick="window.openAssetModal('repairModal')">Log Fault</button>
      </div>
    </section>
    <section class="card action-console">
      <div>
        <h2>Asset Actions</h2>
        <p class="muted">Keep the asset record clean. Open engineering forms only when needed.</p>
      </div>
      <div class="action-buttons">
        <button class="primary" onclick="window.openAssetModal('serviceModal')">Log Service / Inspection</button>
        <button onclick="window.openAssetModal('repairModal')">Log Repair / Fault</button>
      </div>
    </section>
    <section class="card">
      <h2>Asset History Timeline</h2>
      ${assetHistoryTimeline(a, assetRepairs, assetServices)}
    </section>
    <div id="serviceModal" class="asset-modal hidden">
      <div class="asset-modal-backdrop" onclick="window.closeAssetModal('serviceModal')"></div>
      <div class="asset-modal-card service-modal-card">
        <div class="modal-head">
          <div>
            <p class="eyebrow">SERVICE WORKFLOW</p>
            <h2>Log Service / Inspection</h2>
            <p class="muted">Creates a structured service record and recalculates the next service date.</p>
          </div>
          <button class="icon-btn" onclick="window.closeAssetModal('serviceModal')">×</button>
        </div>
        <div class="asset-modal-scroll">
          <div id="serviceMessageBox" class="message hidden"></div>
          ${serviceFormMarkup(a.id)}
        </div>
      </div>
    </div>
    <div id="repairModal" class="asset-modal hidden">
      <div class="asset-modal-backdrop" onclick="window.closeAssetModal('repairModal')"></div>
      <div class="asset-modal-card repair-modal-card">
        <div class="modal-head">
          <div>
            <p class="eyebrow">FAULT WORKFLOW</p>
            <h2>Log Repair / Fault</h2>
            <p class="muted">QR workflow: scan, describe fault, attach photo, submit.</p>
          </div>
          <button class="icon-btn" onclick="window.closeAssetModal('repairModal')">×</button>
        </div>
        <div class="asset-modal-scroll">
          <div id="messageBox" class="message hidden"></div>
          <input id="repairTitle" placeholder="Fault title" />
          <textarea id="repairDesc" placeholder="Fault description"></textarea>
          <div class="form-grid">
            <select id="repairPriority">${priorityOptions.map(o => `<option>${o}</option>`).join('')}</select>
            <select id="repairStatus">${repairStatusOptions.map(o => `<option>${o}</option>`).join('')}</select>
            <input id="repairCost" type="number" step="0.01" placeholder="Cost £" />
            <input id="repairDowntime" type="number" step="0.1" placeholder="Downtime hours" />
          </div>
          ${partsSelectorMarkup('repair')}
          <input id="repairParts" placeholder="Extra parts notes / non-stock items" />
          <label class="file-label">Attach photo <input id="repairPhoto" type="file" accept="image/*" /></label>
        </div>
        <div class="modal-actions">
          <button onclick="window.closeAssetModal('repairModal')">Cancel</button>
          <button id="saveRepair" class="primary">Save Repair</button>
        </div>
      </div>
    </div>
  `

  document.querySelector('#saveRepair').onclick = () => addRepair(a.id)
  document.querySelector('#saveService')?.addEventListener('click', () => saveServiceRecord(a.id))
  initialiseServiceConditionalNotes()
}



function openAssetModal(id) {
  const modal = document.getElementById(id)
  if (!modal) return
  modal.classList.remove('hidden')
  document.body.classList.add('modal-open')
  setTimeout(() => {
    const first = modal.querySelector('input, textarea, select, button.primary')
    first?.focus?.()
  }, 60)
}

function closeAssetModal(id) {
  const modal = document.getElementById(id)
  if (!modal) return
  modal.classList.add('hidden')
  if (!document.querySelector('.asset-modal:not(.hidden)')) document.body.classList.remove('modal-open')
}

window.openAssetModal = openAssetModal
window.closeAssetModal = closeAssetModal

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    document.querySelectorAll('.asset-modal:not(.hidden)').forEach(modal => closeAssetModal(modal.id))
  }
})


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
    parts_used: buildPartsSummary('repair', value('#repairParts')),
    photo_url: await uploadRepairPhoto()
  }

  const { error } = await supabase.from('repair_tickets').insert(payload)
  if (error) return showMessage(error.message, 'error')

  await consumeSelectedPart('repair', { assetId: selectedAsset, sourceType: 'repair', sourceId: null, notes: title })

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

        ${partsSelectorMarkup('repair')}
        <div class="field-block wide">
          <label>Extra parts notes / non-stock items</label>
          <input id="repairParts" placeholder="e.g. non-stock item, supplier note, temporary fix..." />
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
  const health = getRepairHealth(r)
  return `
    <div class="data-row repair-row ${resolved ? 'resolved' : ''} ${health.state}">
      <div class="repair-main">
        <div class="repair-title-line">
          <h3>${escapeHtml(r.title || 'Untitled repair')}</h3>
          <span class="priority-pill ${String(r.priority || 'Medium').toLowerCase()}">${escapeHtml(r.priority || 'Medium')}</span>
          <span class="sla-pill ${health.state}">${health.label}</span>
        </div>
        <p>${escapeHtml(asset?.name || 'Unknown Asset')} • ${escapeHtml(r.status || 'Open')}</p>
        <small>${escapeHtml(r.description || '')}</small>
        ${r.resolution_notes ? `<small><b>Resolution:</b> ${escapeHtml(r.resolution_notes)}</small>` : ''}
        ${r.resolved_at ? `<small>Resolved: ${new Date(r.resolved_at).toLocaleString()}</small>` : `<small>Opened: ${formatAge(r.created_at)}</small>`}
      </div>
      ${r.photo_url ? `<img class="repair-thumb" src="${escapeHtml(r.photo_url)}" alt="Repair photo" onclick="window.openImagePreview('${escapeHtml(r.photo_url)}', '${escapeHtml(r.title || 'Repair photo')}')" />` : ''}
      <div class="row-actions">
        ${!resolved ? `<button class="resolve-btn" onclick="window.resolveRepair('${r.id}', '${r.asset_id}')">Resolve</button>` : '<span class="pill ok">Resolved</span>'}
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


function partsSelectorMarkup(prefix) {
  const compatible = partsInventory.filter(p => partMatchesContext(p, prefix))
  return `
    <div class="parts-picker field-block wide">
      <label>Inventory part used</label>
      <div class="parts-picker-grid">
        <select id="${prefix}PartId">
          <option value="">No stock part selected</option>
          ${compatible.map(p => `<option value="${p.id}">${escapeHtml(p.part_name || p.name || 'Part')} — ${Number(p.quantity_in_stock || 0)} in stock</option>`).join('')}
        </select>
        <input id="${prefix}PartQty" type="number" min="1" step="1" placeholder="Qty" />
      </div>
      <small class="muted">Selecting a stock part deducts the quantity when the service or repair is saved.</small>
    </div>
  `
}

function partMatchesContext(part, prefix) {
  const type = String(part.equipment_type || part.asset_type || 'General').toLowerCase()
  if (prefix === 'service' || prefix === 'repair') return true
  return !type
}

function selectedPart(prefix) {
  const partId = value(`#${prefix}PartId`)
  const qty = Number(value(`#${prefix}PartQty`) || 0)
  if (!partId || !qty) return null
  const part = partsInventory.find(p => p.id === partId)
  if (!part) return null
  return { part, qty }
}

function buildPartsSummary(prefix, extraNotes = '') {
  const selected = selectedPart(prefix)
  const lines = []
  if (selected) lines.push(`${selected.part.part_name || selected.part.name || 'Inventory part'} x${selected.qty}`)
  if (extraNotes) lines.push(extraNotes)
  return lines.join(' | ')
}

async function consumeSelectedPart(prefix, { assetId, sourceType, sourceId = null, notes = '' }) {
  const selected = selectedPart(prefix)
  if (!selected) return
  const current = Number(selected.part.quantity_in_stock || 0)
  const nextQty = Math.max(0, current - selected.qty)

  const { error: updateError } = await supabase
    .from('parts_inventory')
    .update({ quantity_in_stock: nextQty, updated_at: new Date().toISOString() })
    .eq('id', selected.part.id)

  if (updateError) {
    toast(`Part stock not updated: ${updateError.message}`, 'error')
    return
  }

  const usagePayload = {
    part_id: selected.part.id,
    asset_id: assetId,
    source_type: sourceType,
    source_id: sourceId,
    quantity_used: selected.qty,
    notes
  }
  const { error: usageError } = await supabase.from('parts_usage').insert(usagePayload)
  if (usageError) console.warn('Part usage history skipped:', usageError.message)
  await audit('part_stock_deducted', 'parts_inventory', `${selected.part.part_name || selected.part.name} x${selected.qty}; ${current} -> ${nextQty}`)
}

function lowStockParts() {
  return partsInventory.filter(p => Number(p.quantity_in_stock || 0) <= Number(p.minimum_stock_level || 0))
}

async function uploadPartImage() {
  const input = document.querySelector('#partImage')
  const file = input?.files?.[0]
  if (!file) return value('#partImageUrl') || null
  const safeName = file.name.replace(/[^a-z0-9.\-_]/gi, '_')
  const path = `${Date.now()}-${safeName}`
  const { error } = await supabase.storage.from('part-images').upload(path, file, { upsert: false })
  if (error) {
    showMessage(`Part image upload skipped: ${error.message}. You can paste an image URL instead.`, 'error')
    return value('#partImageUrl') || null
  }
  const { data } = supabase.storage.from('part-images').getPublicUrl(path)
  return data?.publicUrl || null
}

function renderPartsInventory() {
  const low = lowStockParts()
  const totalValue = partsInventory.reduce((sum, p) => sum + Number(p.price || 0) * Number(p.quantity_in_stock || 0), 0)
  content().innerHTML = `
    ${renderHeader('PARTS & SPARES CONTROL', 'Parts Inventory', '<button id="refresh">Refresh</button>')}
    <section class="stats-grid parts-stats">
      ${statCard('Parts Listed', partsInventory.length, 'Inventory records')}
      ${statCard('Low Stock', low.length, 'At or below minimum')}
      ${statCard('Stock Value', `£${totalValue.toFixed(2)}`, 'Estimated inventory value')}
      ${statCard('Usage Events', partsUsage.length, 'Services and repairs')}
      ${statCard('Locations', new Set(partsInventory.map(p => p.stock_location).filter(Boolean)).size, 'Stock locations')}
    </section>
    <section class="card">
      <h2>Add Part</h2>
      <p class="muted">Add AGV, 3D printer or general engineering spares. Parts can then be selected on service and repair forms.</p>
      <div id="messageBox" class="message hidden"></div>
      <div class="form-grid">
        <input id="partName" placeholder="Part name" />
        <select id="partEquipmentType">
          <option>AGV</option>
          <option>3D Printer</option>
          <option>General</option>
        </select>
        <input id="partCategory" placeholder="Category e.g. Sensor / Belt / Nozzle" />
        <input id="partPrice" type="number" step="0.01" placeholder="Price £" />
        <input id="partQty" type="number" step="1" placeholder="Qty currently in stock" />
        <input id="partMinQty" type="number" step="1" placeholder="Minimum stock level" />
        <input id="partLocation" placeholder="Location e.g. Stores A / Drawer 3" />
        <input id="partSupplierUrl" placeholder="Supplier / part website link" />
      </div>
      <div class="form-grid">
        <label class="file-label">Upload part image <input id="partImage" type="file" accept="image/*" /></label>
        <input id="partImageUrl" placeholder="Or paste image URL" />
      </div>
      <textarea id="partNotes" placeholder="Notes, compatibility, reorder detail..."></textarea>
      <button id="addPart" class="primary">Add Part</button>
    </section>
    <section class="grid two">
      <div class="card">
        <h2>Low Stock Alerts</h2>
        ${low.map(partAlertRow).join('') || '<p class="muted">No low stock alerts.</p>'}
      </div>
      <div class="card">
        <h2>Recent Parts Usage</h2>
        ${partsUsage.slice(0, 8).map(partsUsageRow).join('') || '<p class="muted">No parts usage recorded yet.</p>'}
      </div>
    </section>
    <section class="card">
      <h2>Parts List</h2>
      <div class="parts-grid">
        ${partsInventory.map(partCard).join('') || '<p class="muted">No parts added yet. Add the V17 parts SQL table first, then create your spares list.</p>'}
      </div>
    </section>
  `
  document.querySelector('#refresh').onclick = async () => { await loadData(); renderPartsInventory() }
  document.querySelector('#addPart').onclick = addPart
}

async function addPart() {
  const partName = value('#partName')
  if (!partName) return showMessage('Part name is required.', 'error')
  const payload = {
    part_name: partName,
    equipment_type: value('#partEquipmentType') || 'General',
    category: value('#partCategory'),
    price: value('#partPrice') ? Number(value('#partPrice')) : 0,
    supplier_url: value('#partSupplierUrl'),
    quantity_in_stock: value('#partQty') ? Number(value('#partQty')) : 0,
    minimum_stock_level: value('#partMinQty') ? Number(value('#partMinQty')) : 0,
    stock_location: value('#partLocation'),
    image_url: await uploadPartImage(),
    notes: value('#partNotes')
  }
  const { error } = await supabase.from('parts_inventory').insert(payload)
  if (error) return showMessage(error.message || 'Could not add part. Add the V17 parts SQL table first.', 'error')
  await audit('part_created', 'parts_inventory', partName)
  await loadData()
  renderPartsInventory()
}

function partCard(part) {
  const qty = Number(part.quantity_in_stock || 0)
  const min = Number(part.minimum_stock_level || 0)
  const low = qty <= min
  return `
    <article class="part-card ${low ? 'low-stock' : ''}">
      <div class="part-image-wrap">${part.image_url ? `<img src="${escapeHtml(part.image_url)}" alt="${escapeHtml(part.part_name || 'Part')}" />` : '<div class="part-placeholder">PART</div>'}</div>
      <div>
        <p class="eyebrow">${escapeHtml(part.equipment_type || 'General')}</p>
        <h3>${escapeHtml(part.part_name || 'Unnamed part')}</h3>
        <p>${escapeHtml(part.category || 'Uncategorised')} • ${escapeHtml(part.stock_location || 'No location')}</p>
        <div class="part-meta"><span>£${Number(part.price || 0).toFixed(2)}</span><span class="${low ? 'danger-text' : ''}">${qty} in stock</span><span>Min ${min}</span></div>
        ${part.supplier_url ? `<button onclick="window.open('${escapeHtml(part.supplier_url)}', '_blank')">Open Supplier</button>` : ''}
      </div>
    </article>
  `
}

function partAlertRow(part) {
  return `<div class="data-row overdue"><div><h3>${escapeHtml(part.part_name)}</h3><p>${escapeHtml(part.stock_location || 'No location')} • ${escapeHtml(part.equipment_type || 'General')}</p><small>${Number(part.quantity_in_stock || 0)} in stock / minimum ${Number(part.minimum_stock_level || 0)}</small></div></div>`
}

function partsUsageRow(row) {
  const part = partsInventory.find(p => p.id === row.part_id)
  const asset = assets.find(a => a.id === row.asset_id)
  return `<div class="data-row"><div><h3>${escapeHtml(part?.part_name || 'Part used')}</h3><p>${escapeHtml(asset?.name || 'Unknown asset')} • ${escapeHtml(row.source_type || 'usage')}</p><small>Qty ${escapeHtml(row.quantity_used || 0)} • ${formatDate(row.created_at)}</small></div></div>`
}

function renderMaintenance() {
  const today = new Date().toISOString().slice(0, 10)
  const dueAssets = assets
    .slice()
    .sort((a, b) => String(a.next_service_date || '9999').localeCompare(String(b.next_service_date || '9999')))

  content().innerHTML = `
    ${renderHeader('PLANNED MAINTENANCE', 'Maintenance')}
    <section class="card">
      <h2>Service Schedule</h2>
      <p class="muted">Use the service form to record what was inspected, what was found and when the next service is due.</p>
      ${dueAssets.map(a => serviceScheduleRow(a, today)).join('') || '<p class="muted">No assets to schedule.</p>'}
    </section>
    <section class="card">
      <h2>Recent Service Records</h2>
      ${serviceRecords.slice(0, 12).map(serviceRecordRow).join('') || '<p class="muted">No service records yet. Add the optional V16 service_records table to retain full form history.</p>'}
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

function serviceScheduleRow(a, today) {
  const health = calculateAssetHealth(a)
  const overdue = a.next_service_date && a.next_service_date < today
  return `
    <div class="data-row ${overdue ? 'overdue' : ''}">
      <div>
        <h3>${escapeHtml(a.name)}</h3>
        <p>${escapeHtml(a.type || 'Asset')} • Next service: ${escapeHtml(a.next_service_date || 'Not set')}</p>
        <small>${overdue ? 'Overdue' : 'Scheduled'} • Health ${health.score}%</small>
      </div>
      <div class="row-actions"><button onclick="location.hash='asset/${a.id}'">Open Service Form</button></div>
    </div>
  `
}

function serviceRecordRow(record) {
  const asset = assets.find(a => a.id === record.asset_id)
  return `
    <div class="data-row service-record-row">
      <div>
        <h3>${escapeHtml(asset?.name || record.asset_name || 'Asset Service')}</h3>
        <p>${escapeHtml(record.service_type || 'Service')} • ${escapeHtml(record.condition_after || 'Condition not recorded')}</p>
        <small>${escapeHtml(record.engineer_name || 'Unknown engineer')} • ${formatDate(record.service_date || record.created_at)}</small>
      </div>
      <div class="service-chip">Next: ${escapeHtml(record.next_service_due || '-')}</div>
    </div>
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
        <p>Scan → open asset → log repair</p>
        <div class="qr-actions">
          <button onclick="window.open('${url}', '_blank')">Open</button>
          <button onclick="navigator.clipboard.writeText('${url}')">Copy Link</button>
        </div>
      </div>
    `
  }
}


function renderFleetPage(kind) {
  const isAgv = kind === 'agv'
  const fleetAssets = assets.filter(a => isAgv ? isAgvAsset(a) : isPrinterAsset(a))
  const title = isAgv ? 'AGV Fleet' : '3D Printer Fleet'
  const kicker = isAgv ? 'AUTONOMOUS VEHICLE COMMAND' : 'ADDITIVE MANUFACTURING COMMAND'
  const healthAvg = averageHealth(fleetAssets)
  const activeFaults = repairs.filter(r => fleetAssets.some(a => a.id === r.asset_id) && r.status !== 'Resolved')
  const overdueService = fleetAssets.filter(a => isServiceOverdue(a)).length

  content().innerHTML = `
    ${renderHeader(kicker, title, '<button id="refresh">Refresh</button>')}
    <section class="stats-grid fleet-stats">
      ${statCard('Fleet Assets', fleetAssets.length, isAgv ? 'AGV units tracked' : 'Printer units tracked')}
      ${statCard('Fleet Health', `${healthAvg}%`, 'Average calculated health')}
      ${statCard('Active Faults', activeFaults.length, 'Open repair tickets')}
      ${statCard('Overdue Service', overdueService, 'Service date exceeded')}
      ${statCard('Downtime', `${fleetDowntime(fleetAssets).toFixed(1)}h`, 'Logged downtime')}
    </section>
    <section class="fleet-command-grid">
      ${fleetAssets.map(fleetCard).join('') || `<div class="card"><p class="muted">No ${isAgv ? 'AGV' : '3D printer'} assets found. Check asset type naming.</p></div>`}
    </section>
  `
  document.querySelector('#refresh').onclick = async () => { await loadData(); renderFleetPage(kind) }
}

function fleetCard(asset) {
  const health = calculateAssetHealth(asset)
  const open = repairs.filter(r => r.asset_id === asset.id && r.status !== 'Resolved')
  const lastService = serviceRecords.find(s => s.asset_id === asset.id)
  return `
    <article class="fleet-card ${health.tone}">
      <div class="fleet-card-head">
        <div>
          <p class="eyebrow">${escapeHtml(asset.type || 'Asset')}</p>
          <h2>${escapeHtml(asset.name || 'Unnamed')}</h2>
          <p>${escapeHtml(asset.location || 'No location')}</p>
        </div>
        <div class="health-ring" style="--score:${health.score}"><span>${health.score}</span></div>
      </div>
      <div class="fleet-metrics">
        <span><b>${open.length}</b><small>Open faults</small></span>
        <span><b>${asset.next_service_date || '-'}</b><small>Next service</small></span>
        <span><b>${lastService?.condition_after || 'Unknown'}</b><small>Last condition</small></span>
      </div>
      <p class="muted">${escapeHtml(health.reason)}</p>
      <div class="row-actions">
        <button onclick="location.hash='asset/${asset.id}'">Open Record</button>
        <button class="primary" onclick="location.hash='asset/${asset.id}'; setTimeout(() => document.querySelector('#serviceType')?.focus(), 100)">Service</button>
      </div>
    </article>
  `
}

function isAgvAsset(asset) {
  const text = `${asset.name || ''} ${asset.type || ''} ${asset.model || ''}`.toLowerCase()
  return text.includes('agv') || text.includes('automated guided') || text.includes('vehicle')
}

function isPrinterAsset(asset) {
  const text = `${asset.name || ''} ${asset.type || ''} ${asset.location || ''}`.toLowerCase()
  return text.includes('printer') || text.includes('3d print') || text.includes('resin') || text.includes('wash station')
}

function fleetDowntime(fleetAssets) {
  return repairs
    .filter(r => fleetAssets.some(a => a.id === r.asset_id))
    .reduce((sum, r) => sum + Number(r.downtime_hours || 0), 0)
}

function averageHealth(assetList) {
  if (!assetList.length) return 0
  return Math.round(assetList.reduce((sum, a) => sum + calculateAssetHealth(a).score, 0) / assetList.length)
}

function isServiceOverdue(asset) {
  return Boolean(asset.next_service_date && asset.next_service_date < new Date().toISOString().slice(0, 10))
}

function calculateAssetHealth(asset) {
  const assetRepairs = repairs.filter(r => r.asset_id === asset.id)
  const openRepairs = assetRepairs.filter(r => r.status !== 'Resolved')
  const criticalOpen = openRepairs.filter(r => r.priority === 'Critical').length
  const highOpen = openRepairs.filter(r => r.priority === 'High').length
  const downtime = assetRepairs.reduce((sum, r) => sum + Number(r.downtime_hours || 0), 0)
  const recent = assetRepairs.filter(r => daysSince(r.created_at) <= 90)
  const overdue = isServiceOverdue(asset)
  const repeatFaults = countRepeatFaults(assetRepairs)
  const outOfService = String(asset.status || '').toLowerCase().includes('out')
  const underRepair = String(asset.status || '').toLowerCase().includes('repair')
  const needsAttention = String(asset.status || '').toLowerCase().includes('attention')

  let score = 100
  score -= openRepairs.length * 10
  score -= criticalOpen * 18
  score -= highOpen * 10
  score -= Math.min(20, recent.length * 4)
  score -= Math.min(22, downtime * 1.5)
  score -= overdue ? 14 : 0
  score -= repeatFaults * 7
  score -= outOfService ? 24 : underRepair ? 14 : needsAttention ? 8 : 0
  score = Math.max(0, Math.min(100, Math.round(score)))

  const reasons = []
  if (openRepairs.length) reasons.push(`${openRepairs.length} open fault${openRepairs.length === 1 ? '' : 's'}`)
  if (criticalOpen) reasons.push(`${criticalOpen} critical`)
  if (overdue) reasons.push('service overdue')
  if (repeatFaults) reasons.push('repeat fault pattern')
  if (downtime) reasons.push(`${downtime.toFixed(1)}h downtime`)
  if (!reasons.length) reasons.push('stable service and repair profile')

  const tone = score >= 80 ? 'healthy' : score >= 60 ? 'watch' : score >= 40 ? 'risk' : 'critical'
  const label = score >= 80 ? 'Stable' : score >= 60 ? 'Watchlist' : score >= 40 ? 'High Risk' : 'Critical'
  return { score, tone, label, reason: reasons.join(' • ') }
}

function daysSince(dateValue) {
  if (!dateValue) return 9999
  return Math.max(0, (Date.now() - new Date(dateValue).getTime()) / 864e5)
}

function countRepeatFaults(assetRepairs) {
  const words = {}
  assetRepairs.forEach(r => {
    const key = String(r.title || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(w => w.length > 4).slice(0, 3).join(' ')
    if (!key) return
    words[key] = (words[key] || 0) + 1
  })
  return Object.values(words).filter(v => v >= 2).length
}

function highRiskAssets() {
  return assets
    .map(a => ({ ...a, _health: calculateAssetHealth(a) }))
    .filter(a => a._health.score < 70)
    .sort((a, b) => a._health.score - b._health.score)
    .slice(0, 5)
}

function compactHealthRow(asset) {
  const health = asset._health || calculateAssetHealth(asset)
  return `
    <div class="compact-health-row ${health.tone}">
      <div><strong>${escapeHtml(asset.name)}</strong><small>${escapeHtml(health.reason)}</small></div>
      <b>${health.score}</b>
    </div>
  `
}

function intelligenceSummary() {
  const risk = highRiskAssets().length
  const avg = averageHealth(assets)
  const overdue = assets.filter(isServiceOverdue).length
  return `
    <div class="intel-readout">
      <div><b>${avg}%</b><span>Average asset health</span></div>
      <div><b>${risk}</b><span>High-risk assets</span></div>
      <div><b>${overdue}</b><span>Overdue services</span></div>
    </div>
  `
}

function fleetHealthSummary() {
  const agv = assets.filter(isAgvAsset)
  const printers = assets.filter(isPrinterAsset)
  return barList([
    { label: 'AGV Fleet', value: averageHealth(agv), tone: averageHealth(agv) < 60 ? 'danger' : averageHealth(agv) < 80 ? 'warning' : 'ok' },
    { label: '3D Printer Fleet', value: averageHealth(printers), tone: averageHealth(printers) < 60 ? 'danger' : averageHealth(printers) < 80 ? 'warning' : 'ok' }
  ])
}

function serviceFormMarkup(assetId) {
  const asset = assets.find(a => a.id === assetId)
  const isAgv = isAgvAsset(asset || {})
  const isPrinter = isPrinterAsset(asset || {})
  const today = new Date().toISOString().slice(0, 10)
  const next = new Date(); next.setDate(next.getDate() + 90)
  const workflowTitle = isAgv ? 'AGV Service Workflow' : isPrinter ? '3D Printer Service Workflow' : 'General Service Workflow'
  const workflowText = isAgv ? 'Mobility, battery and safety inspection.' : isPrinter ? 'Print quality, motion system and reliability inspection.' : 'General engineering inspection.'
  const specificFields = isAgv ? agvServiceFieldsMarkup() : isPrinter ? printerServiceFieldsMarkup() : generalServiceFieldsMarkup()

  return `
    <div class="service-workflow-banner ${isAgv ? 'agv' : isPrinter ? 'printer' : 'general'}">
      <div>
        <p class="eyebrow">${isAgv ? 'AUTONOMOUS VEHICLE SERVICE' : isPrinter ? 'ADDITIVE MANUFACTURING SERVICE' : 'GENERAL SERVICE'}</p>
        <h3>${workflowTitle}</h3>
        <p class="muted">${workflowText}</p>
      </div>
    </div>
    <div class="service-form-stack">
      <div class="form-grid">
        <label class="field-block">Service type
          <select id="serviceType">
            <option>Preventative Maintenance</option>
            <option>Inspection</option>
            <option>Calibration</option>
            <option>Corrective Service</option>
            <option>Safety Check</option>
          </select>
        </label>
        <label class="field-block">Engineer
          <input id="serviceEngineer" placeholder="Engineer name" />
        </label>
        <label class="field-block">Service date
          <input id="serviceDate" type="date" value="${today}" />
        </label>
        <label class="field-block">Next service due
          <input id="serviceNextDue" type="date" value="${next.toISOString().slice(0, 10)}" />
        </label>
        <label class="field-block">Downtime hours
          <input id="serviceDowntime" type="number" step="0.1" placeholder="0.0" />
        </label>
        <label class="field-block">Condition after service
          <select id="serviceCondition">
            <option>Good</option>
            <option>Monitor</option>
            <option>Requires Follow-Up</option>
            <option>Unsafe / Do Not Use</option>
          </select>
        </label>
      </div>
      <div class="service-specific-grid">
        ${specificFields}
      </div>
      ${partsSelectorMarkup('service')}
      <label class="field-block wide">Issues found
        <textarea id="serviceIssues" placeholder="What issues were found during the service?"></textarea>
      </label>
      <label class="field-block wide">Corrective action taken
        <textarea id="serviceAction" placeholder="What was adjusted, repaired, cleaned, replaced or verified?"></textarea>
      </label>
      <label class="field-block wide">Extra parts notes / non-stock parts
        <input id="serviceParts" placeholder="Parts not in inventory, supplier note, or extra detail" />
      </label>
      <div class="form-actions modal-actions inline-actions">
        <button type="button" onclick="window.closeAssetModal('serviceModal')">Cancel</button>
        <button id="saveService" class="primary">Save Service Record</button>
      </div>
    </div>
  `
}

function checkField(id, label, options = ['Pass', 'Monitor', 'Fail', 'N/A']) {
  return `<label class="field-block service-check" data-check-field="${id}">${label}<select id="${id}" onchange="window.handleServiceCheckChange('${id}')">${options.map(o => `<option>${o}</option>`).join('')}</select><textarea id="${id}Note" class="conditional-note hidden" placeholder="Reason / action required if this did not pass..."></textarea></label>`
}

function handleServiceCheckChange(id) {
  const select = document.getElementById(id)
  const note = document.getElementById(`${id}Note`)
  if (!select || !note) return
  const needsNote = serviceCheckNeedsNote(id, select.value)
  note.classList.toggle('hidden', !needsNote)
  if (!needsNote) note.value = ''
}

function serviceCheckNeedsNote(id, result) {
  if (id === 'agvBatteryType') return false
  const value = String(result || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return !['pass', 'passed', 'good', 'ok', 'n a', 'na'].includes(value)
}

function initialiseServiceConditionalNotes() {
  document.querySelectorAll('.service-check select').forEach(select => handleServiceCheckChange(select.id))
}

function collectServiceCheckNotes() {
  const notes = {}
  document.querySelectorAll('.conditional-note').forEach(note => {
    if (note.value.trim()) {
      const key = note.id.replace(/Note$/, 'Reason')
      notes[key] = note.value.trim()
    }
  })
  return notes
}

window.handleServiceCheckChange = handleServiceCheckChange

function textField(id, label, placeholder = 'Notes') {
  return `<label class="field-block service-check wide">${label}<textarea id="${id}" placeholder="${placeholder}"></textarea></label>`
}

function dateField(id, label) {
  return `<label class="field-block service-check">${label}<input id="${id}" type="date" /></label>`
}

function agvServiceFieldsMarkup() {
  return `
    ${checkField('agvBatteryType', 'Battery type', ['LiFePO₄', 'Lead Acid', 'Lithium Ion', 'Other / Unknown'])}
    ${checkField('agvBatteryHealth', 'Battery health', ['Good', 'Monitor', 'Poor', 'Replace'])}
    ${checkField('agvDriveMotors', 'Drive motors inspection')}
    ${checkField('agvWheelCondition', 'Wheel condition', ['Good', 'Worn', 'Damaged', 'Replace'])}
    ${checkField('agvCrashSensor', 'Crash sensor check')}
    ${checkField('agvEstop', 'Emergency stop test')}
    ${checkField('agvTrackSensor', 'Track sensor check')}
    ${checkField('agvCharger', 'Charger check')}
    ${textField('agvRouteIssues', 'Route / track issues', 'Track condition, dead zones, route behaviour, docking problems...')}
    ${checkField('agvWiring', 'Wiring check')}
    ${textField('agvUpgradesRequired', 'Upgrades required', 'Recommended upgrades, engineering improvements or safety actions...')}
  `
}

function printerServiceFieldsMarkup() {
  return `
    ${checkField('printerNozzle', 'Nozzle condition', ['Good', 'Cleaned', 'Worn', 'Replaced'])}
    ${checkField('printerExtruderGear', 'Extruder gear condition')}
    ${checkField('printerBedLevelling', 'Bed levelling check')}
    ${checkField('printerBuildPlate', 'Build plate condition', ['Good', 'Worn', 'Damaged', 'Replaced'])}
    ${checkField('printerBeltTension', 'Belt tension', ['Good', 'Adjusted', 'Loose', 'Replace'])}
    ${checkField('printerLinearRail', 'Linear rail condition')}
    ${checkField('printerZAxis', 'Z-axis inspection')}
    ${textField('printerFirmwareNotes', 'Firmware notes', 'Firmware/config changes, offsets, slicer/profile notes...')}
    ${checkField('printerFilamentTube', 'Filament tube condition', ['Good', 'Cleaned', 'Worn', 'Replaced'])}
    ${checkField('printerCalibrationCube', 'Calibration cube / test print results', ['Passed', 'Minor defects', 'Failed', 'Not run'])}
    ${textField('printerPrintQualityNotes', 'Print quality notes', 'Layer quality, extrusion, ringing, dimensional accuracy, bed adhesion...')}
  `
}

function generalServiceFieldsMarkup() {
  return `
    ${checkField('generalInspection', 'General inspection')}
    ${checkField('generalSafety', 'Safety check')}
    ${textField('generalNotes', 'Inspection notes')}
  `
}

function collectServiceData(asset) {
  const isAgv = isAgvAsset(asset || {})
  const isPrinter = isPrinterAsset(asset || {})
  if (isAgv) return {
    batteryType: value('#agvBatteryType'),
    batteryHealth: value('#agvBatteryHealth'),
    driveMotorsInspection: value('#agvDriveMotors'),
    wheelCondition: value('#agvWheelCondition'),
    crashSensorCheck: value('#agvCrashSensor'),
    emergencyStopTest: value('#agvEstop'),
    trackSensorCheck: value('#agvTrackSensor'),
    chargerCheck: value('#agvCharger'),
    routeTrackIssues: value('#agvRouteIssues'),
    wiringCheck: value('#agvWiring'),
    upgradesRequired: value('#agvUpgradesRequired')
  }
  if (isPrinter) return {
    nozzleCondition: value('#printerNozzle'),
    extruderGearCondition: value('#printerExtruderGear'),
    bedLevellingCheck: value('#printerBedLevelling'),
    buildPlateCondition: value('#printerBuildPlate'),
    beltTension: value('#printerBeltTension'),
    linearRailCondition: value('#printerLinearRail'),
    zAxisInspection: value('#printerZAxis'),
    firmwareNotes: value('#printerFirmwareNotes'),
    filamentTubeCondition: value('#printerFilamentTube'),
    calibrationCubeTestPrintResults: value('#printerCalibrationCube'),
    printQualityNotes: value('#printerPrintQualityNotes')
  }
  return {
    generalInspection: value('#generalInspection'),
    safetyCheck: value('#generalSafety'),
    notes: value('#generalNotes')
  }
}

function serviceCategory(asset) {
  if (isAgvAsset(asset || {})) return 'AGV'
  if (isPrinterAsset(asset || {})) return '3D_PRINTER'
  return 'GENERAL'
}

function serviceDataSummary(data = {}) {
  return Object.entries(data)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1')}: ${v}`)
    .join(' | ')
}

async function saveServiceRecord(assetId) {
  const asset = assets.find(a => a.id === assetId)
  const payload = {
    asset_id: assetId,
    asset_name: asset?.name || null,
    service_type: value('#serviceType') || 'Preventative Maintenance',
    engineer_name: value('#serviceEngineer'),
    service_date: value('#serviceDate') || new Date().toISOString().slice(0, 10),
    next_service_due: value('#serviceNextDue') || null,
    downtime_hours: value('#serviceDowntime') ? Number(value('#serviceDowntime')) : null,
    condition_after: value('#serviceCondition'),
    issues_found: value('#serviceIssues'),
    corrective_action: value('#serviceAction'),
    parts_replaced: buildPartsSummary('service', value('#serviceParts')),
    service_category: serviceCategory(asset),
    service_data: { ...collectServiceData(asset), findings: collectServiceCheckNotes() }
  }

  const msg = document.querySelector('#serviceMessageBox')
  if (msg) { msg.className = 'message hidden'; msg.textContent = '' }

  const updatePayload = {
    next_service_date: payload.next_service_due,
    status: payload.condition_after === 'Unsafe / Do Not Use' ? 'Out of Service' : payload.condition_after === 'Requires Follow-Up' ? 'Needs Attention' : 'Operational'
  }

  const { error: updateError } = await supabase.from('assets').update(updatePayload).eq('id', assetId)
  if (updateError) return showServiceMessage(updateError.message, 'error')

  let { error: serviceError } = await supabase.from('service_records').insert(payload)
  if (serviceError && String(serviceError.message || '').includes('service_')) {
    const fallbackPayload = { ...payload }
    delete fallbackPayload.service_category
    delete fallbackPayload.service_data
    fallbackPayload.corrective_action = `${payload.corrective_action || ''}

Workflow checks: ${serviceDataSummary(payload.service_data)}`.trim()
    const retry = await supabase.from('service_records').insert(fallbackPayload)
    serviceError = retry.error
  }

  await consumeSelectedPart('service', { assetId, sourceType: 'service', sourceId: null, notes: `${asset?.name || assetId}: ${payload.service_type}` })

  if (serviceError) {
    await audit('service_record_logged', 'assets', `${asset?.name || assetId}: ${payload.service_type}; condition ${payload.condition_after}; next due ${payload.next_service_due}; checks ${serviceDataSummary(payload.service_data)}; notes ${payload.corrective_action || payload.issues_found || 'none'}`)
    showServiceMessage('Service saved to asset record. Optional service_records table not found, so full form history was written to audit log only.', 'success')
  } else {
    await audit('service_record_logged', 'service_records', `${asset?.name || assetId}: ${payload.service_type}`)
    showServiceMessage('Service record saved.', 'success')
  }

  await loadData()
  setTimeout(() => renderAssetDetail(assetId), 900)
}

function showServiceMessage(message, type = 'info') {
  const box = document.querySelector('#serviceMessageBox') || document.querySelector('#messageBox')
  if (!box) return alert(message)
  box.textContent = message
  box.className = `message ${type}`
}

function formatDate(dateValue) {
  if (!dateValue) return '-'
  return new Date(dateValue).toLocaleDateString()
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
      ${statCard('Repair Tickets', repairs.length, 'All tickets')}
      ${statCard('Open Repairs', openCount, 'Tickets not resolved')}
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

function assetHistoryTimeline(asset, assetRepairs, assetServices = []) {
  const items = [
    { date: asset.created_at, title: 'Asset created', body: `${asset.type || 'Asset'} registered in ${asset.location || 'no location set'}`, tone: 'created' },
    ...assetRepairs.map(r => ({
      date: r.created_at,
      title: r.status === 'Resolved' ? `Repair resolved: ${r.title || 'Ticket'}` : `Repair logged: ${r.title || 'Ticket'}`,
      body: `${r.priority || 'Medium'} priority • ${r.status || 'Open'}${r.resolution_notes ? ` • ${r.resolution_notes}` : ''}`,
      tone: r.status === 'Resolved' ? 'resolved' : getRepairHealth(r).state,
      photo: r.photo_url
    })),
    ...assetServices.map(s => ({
      date: s.service_date || s.created_at,
      title: `Service completed: ${s.service_type || 'Service'}`,
      body: `${s.condition_after || 'Condition not recorded'} • Next due ${s.next_service_due || '-'}${s.corrective_action ? ` • ${s.corrective_action}` : ''}`,
      tone: 'service'
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


async function markServiced(assetId) {
  location.hash = `asset/${assetId}`
  setTimeout(() => document.querySelector('#serviceType')?.focus(), 150)
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
