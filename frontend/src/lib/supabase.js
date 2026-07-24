import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// If env vars are missing, show a clear error in the UI instead of crashing silently
if (!supabaseUrl || !supabaseAnonKey) {
  document.getElementById('root').innerHTML = `
    <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;
      justify-content:center;padding:32px;background:#0f1117;color:#e2e8f0;font-family:monospace">
      <div style="font-size:2rem;margin-bottom:16px">⚠️</div>
      <h2 style="color:#ef4444;margin-bottom:12px">Missing Environment Variables</h2>
      <p style="color:#8892a4;margin-bottom:20px;text-align:center;max-width:500px">
        VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set.<br/><br/>
        Go to Vercel → your project → Settings → Environment Variables
        and add both values, then redeploy.
      </p>
      <code style="background:#1a1d27;padding:12px 20px;border-radius:8px;color:#f59e0b;font-size:13px">
        VITE_SUPABASE_URL = https://xxxx.supabase.co<br/>
        VITE_SUPABASE_ANON_KEY = eyJ...
      </code>
    </div>
  `
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
})

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ── Auth ──────────────────────────────────────────────────
export const signUp = ({ email, password, fullName, role, phone }) =>
  supabase.auth.signUp({ email, password, options: { data: { full_name: fullName, role, phone } } })

export const signIn = ({ email, password }) =>
  supabase.auth.signInWithPassword({ email, password })

export const signOut = () => supabase.auth.signOut()

export const getProfile = (userId) =>
  supabase.from('profiles').select('*').eq('id', userId).single()

export const updateProfile = (userId, updates) =>
  supabase.from('profiles').update(updates).eq('id', userId)

// ── Owner lookup (for tenant registration) ────────────────
export const findOwnerByCredentials = async (email, phone) => {
  const { data, error } = await supabase.rpc('find_owner_by_credentials', {
    p_email: email, p_phone: phone.replace(/\D/g, '')
  })
  return { data, error }
}

export const getOwnerBuildings = async (ownerId) =>
  supabase.from('buildings').select('*, rooms(id, room_number, floor, rent_amount, is_occupied)').eq('owner_id', ownerId)

// ── Buildings ─────────────────────────────────────────────
export const getBuildings = (ownerId) =>
  supabase.from('buildings').select('*').eq('owner_id', ownerId).order('created_at')

export const createBuilding = ({ ownerId, name, address }) =>
  supabase.from('buildings').insert({ owner_id: ownerId, name, address }).select().single()

export const updateBuilding = (id, updates) =>
  supabase.from('buildings').update(updates).eq('id', id).select().single()

export const deleteBuilding = (id) =>
  supabase.from('buildings').delete().eq('id', id)

// ── Rooms ─────────────────────────────────────────────────
export const getRooms = (buildingId) =>
  supabase.from('rooms')
    .select('*, tenants(id, full_name, phone, is_active, user_id)')
    .eq('building_id', buildingId).order('room_number')

export const getRoomById = (id) =>
  supabase.from('rooms').select('*').eq('id', id).single()

export const createRoom = (roomData) =>
  supabase.from('rooms').insert(roomData).select().single()

export const updateRoom = (id, updates) =>
  supabase.from('rooms').update(updates).eq('id', id).select().single()

export const deleteRoom = (id) =>
  supabase.from('rooms').delete().eq('id', id)

// ── Tenants ───────────────────────────────────────────────
export const getTenants = (buildingId) =>
  supabase.from('tenants')
    .select('*, rooms(room_number, rent_amount, due_date_day)')
    .eq('building_id', buildingId).eq('is_active', true).order('full_name')

export const getTenantByUserId = (userId) =>
  supabase.from('tenants')
    .select('*, rooms(*), buildings(name, address, owner_id)')
    .eq('user_id', userId).eq('is_active', true).single()

export const createTenant = (tenantData) =>
  supabase.from('tenants').insert(tenantData).select().single()

export const updateTenant = (id, updates) =>
  supabase.from('tenants').update(updates).eq('id', id).select().single()

// ── Room Requests ─────────────────────────────────────────
export const getRoomRequests = (buildingId) =>
  supabase.from('room_requests')
    .select('*, rooms(room_number, floor, rent_amount), profiles(full_name, phone, email)')
    .eq('building_id', buildingId).order('created_at', { ascending: false })

export const getMyRoomRequests = (userId) =>
  supabase.from('room_requests')
    .select('*, rooms(room_number, floor, rent_amount), buildings(name)')
    .eq('tenant_user_id', userId).order('created_at', { ascending: false })

export const createRoomRequest = async ({ tenantUserId, roomId, buildingId, ownerId, message }) => {
  const { data, error } = await supabase.from('room_requests').insert({
    tenant_user_id: tenantUserId, room_id: roomId,
    building_id: buildingId, owner_id: ownerId, message
  }).select().single()

  if (data && !error && ownerId) {
    const { data: p } = await supabase.from('profiles').select('full_name').eq('id', tenantUserId).single()
    const { data: r } = await supabase.from('rooms').select('room_number').eq('id', roomId).single()
    await supabase.from('notifications').insert({
      user_id: ownerId,
      title: 'New Room Request',
      message: `${p?.full_name || 'A tenant'} requested to book Room ${r?.room_number || roomId}.`,
      type: 'info'
    })
  }
  return { data, error }
}

export const updateRoomRequest = (id, status) =>
  supabase.from('room_requests').update({ status }).eq('id', id)

export const approveRoomRequest = async (requestId, tenantId) => {
  // Mark request approved
  await supabase.from('room_requests').update({ status: 'approved' }).eq('id', requestId)
  // Withdraw all other pending requests from the same tenant
  const { data: req } = await supabase.from('room_requests').select('tenant_user_id, owner_id').eq('id', requestId).single()
  if (req) {
    await supabase.from('room_requests')
      .update({ status: 'withdrawn' })
      .eq('tenant_user_id', req.tenant_user_id)
      .eq('owner_id', req.owner_id)
      .eq('status', 'pending')
  }
}

// ── AUTO-GENERATE RENT (POSTPAID) ─────────────────────────
// Stay month M → Bill due on day X of month M+1
// Runs silently every time dashboard loads
export const autoGenerateRentRecords = async (buildingId) => {
  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, room_id, building_id, join_date, rooms(rent_amount, due_date_day)')
    .eq('building_id', buildingId).eq('is_active', true).not('room_id', 'is', null)

  if (error || !tenants?.length) return { created: 0 }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const lastStayMonth = today.getMonth() === 0 ? 12 : today.getMonth()
  const lastStayYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()
  let created = 0

  for (const tenant of tenants) {
    if (!tenant.room_id) continue
    const joinDate = new Date(tenant.join_date || today)
    let genMonth = joinDate.getMonth() + 1
    let genYear = joinDate.getFullYear()

    while (genYear < lastStayYear || (genYear === lastStayYear && genMonth <= lastStayMonth)) {
      const { data: existing } = await supabase.from('rent_records')
        .select('id').eq('tenant_id', tenant.id)
        .eq('stay_month', genMonth).eq('stay_year', genYear).maybeSingle()

      if (!existing) {
        const dueDay = tenant.rooms?.due_date_day || 5
        const dueMonth = genMonth === 12 ? 1 : genMonth + 1
        const dueYear = genMonth === 12 ? genYear + 1 : genYear
        const periodStart = new Date(genYear, genMonth - 1, 1)
        const periodEnd = new Date(genYear, genMonth, 0) // last day of stay month
        const dueDate = new Date(dueYear, dueMonth - 1, dueDay)

        await supabase.from('rent_records').insert({
          tenant_id: tenant.id, room_id: tenant.room_id,
          building_id: tenant.building_id,
          stay_month: genMonth, stay_year: genYear,
          period_start: periodStart.toISOString().split('T')[0],
          period_end: periodEnd.toISOString().split('T')[0],
          amount: tenant.rooms?.rent_amount || 0,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'unpaid'
        })
        created++
      }
      if (genMonth === 12) { genMonth = 1; genYear++ } else genMonth++
    }
  }

  // Auto-mark overdue
  await supabase.from('rent_records').update({ status: 'overdue' })
    .eq('building_id', buildingId).eq('status', 'unpaid')
    .lt('due_date', today.toISOString().split('T')[0])

  return { created }
}

// ── Rent Records ──────────────────────────────────────────
export const getRentRecords = (buildingId, month, year) => {
  let q = supabase.from('rent_records')
    .select('*, tenants(full_name, phone, whatsapp_number), rooms(room_number)')
    .eq('building_id', buildingId)
  if (month) q = q.eq('stay_month', month)
  if (year) q = q.eq('stay_year', year)
  return q.order('due_date')
}

export const getAllRentRecords = (buildingId) =>
  supabase.from('rent_records')
    .select('*, tenants(full_name), rooms(room_number)')
    .eq('building_id', buildingId)
    .order('stay_year', { ascending: false })
    .order('stay_month', { ascending: false })

export const getTenantRentRecords = (tenantId) =>
  supabase.from('rent_records').select('*').eq('tenant_id', tenantId)
    .order('stay_year', { ascending: false }).order('stay_month', { ascending: false })

export const getRoomRentHistory = (roomId) =>
  supabase.from('rent_records').select('*, tenants(full_name)')
    .eq('room_id', roomId).order('stay_year', { ascending: false }).order('stay_month', { ascending: false })

export const markRentPaid = (id, paymentMethod) =>
  supabase.from('rent_records').update({
    status: 'paid',
    paid_date: new Date().toISOString().split('T')[0],
    payment_method: paymentMethod
  }).eq('id', id).select().single()

export const updateRentRecord = (id, updates) =>
  supabase.from('rent_records').update(updates).eq('id', id).select().single()

// ── Electricity ───────────────────────────────────────────
export const getElectricityRecords = (buildingId, month, year) => {
  let q = supabase.from('electricity_records')
    .select('*, rooms(room_number, last_meter_reading, rate_per_unit), tenants(full_name)')
    .eq('building_id', buildingId)
  if (month) q = q.eq('stay_month', month)
  if (year) q = q.eq('stay_year', year)
  return q.order('reading_date', { ascending: false })
}

export const getAllElectricityRecords = (buildingId) =>
  supabase.from('electricity_records')
    .select('*, rooms(room_number), tenants(full_name)')
    .eq('building_id', buildingId)
    .order('stay_year', { ascending: false }).order('stay_month', { ascending: false })

export const getRoomElectricityHistory = (roomId) =>
  supabase.from('electricity_records').select('*, tenants(full_name)')
    .eq('room_id', roomId).order('stay_year', { ascending: false }).order('stay_month', { ascending: false })

export const getTenantElectricityRecords = (tenantId) =>
  supabase.from('electricity_records').select('*').eq('tenant_id', tenantId)
    .order('stay_year', { ascending: false }).order('stay_month', { ascending: false })

export const createElectricityRecord = (data) =>
  supabase.from('electricity_records').insert(data).select().single()

export const markElectricityPaid = (id, paymentMethod) =>
  supabase.from('electricity_records').update({
    status: 'paid',
    paid_date: new Date().toISOString().split('T')[0],
    payment_method: paymentMethod
  }).eq('id', id).select().single()

// ── Documents ─────────────────────────────────────────────
export const getDocuments = (tenantId) =>
  supabase.from('documents').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })

export const uploadDocument = async ({ tenantId, buildingId, uploadedBy, docType, file }) => {
  const ext = file.name.split('.').pop()
  const filePath = `${buildingId}/${tenantId}/${docType}_${Date.now()}.${ext}`
  const { error: upErr } = await supabase.storage.from('tenant-documents')
    .upload(filePath, file, { cacheControl: '3600', upsert: false })
  if (upErr) return { data: null, error: upErr }
  return supabase.from('documents').insert({
    tenant_id: tenantId, building_id: buildingId, uploaded_by: uploadedBy,
    doc_type: docType, file_name: file.name, file_path: filePath,
    file_size: file.size, mime_type: file.type
  }).select().single()
}

export const getDocumentUrl = async (filePath) => {
  const { data } = await supabase.storage.from('tenant-documents').createSignedUrl(filePath, 3600)
  return data?.signedUrl
}

// ── Notifications ─────────────────────────────────────────
export const getNotifications = (userId) =>
  supabase.from('notifications').select('*').eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(100)

export const markNotificationRead = (id) =>
  supabase.from('notifications').update({ is_read: true }).eq('id', id)

export const markAllNotificationsRead = (userId) =>
  supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false)

export const subscribeToNotifications = (userId, onInsert) => {
  return supabase.channel('realtime:notifications')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, onInsert)
    .subscribe()
}

export const subscribeToRoomRequests = (buildingId, onChange) => {
  return supabase.channel(`realtime:requests_${buildingId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_requests', filter: `building_id=eq.${buildingId}` }, onChange)
    .subscribe()
}

export const unsubscribe = (channel) => supabase.removeChannel(channel)

// ── Dashboard Stats ───────────────────────────────────────
export const getBuildingStats = async (buildingId) => {
  const today = new Date()
  const prevMonth = today.getMonth() === 0 ? 12 : today.getMonth()
  const prevYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()

  const [roomsRes, tenantsRes, rentRes, elecRes] = await Promise.all([
    supabase.from('rooms').select('id, is_occupied, room_number, rent_amount, floor, last_meter_reading, due_date_day').eq('building_id', buildingId),
    supabase.from('tenants').select('id').eq('building_id', buildingId).eq('is_active', true),
    supabase.from('rent_records').select('room_id, status, amount, stay_month, stay_year, due_date, period_start, period_end, tenants(full_name)')
      .eq('building_id', buildingId),
    supabase.from('electricity_records').select('room_id, status, total_amount, stay_month, stay_year')
      .eq('building_id', buildingId)
  ])

  const rooms = roomsRes.data || []
  const allRent = rentRes.data || []
  const allElec = elecRes.data || []

  // Per-room ledger: find all unpaid months per room
  const roomLedger = rooms.map(room => {
    const roomRent = allRent.filter(r => r.room_id === room.id)
    const roomElec = allElec.filter(e => e.room_id === room.id)
    const unpaidRent = roomRent.filter(r => r.status !== 'paid')
    const unpaidElec = roomElec.filter(e => e.status !== 'paid')
    const latestRent = roomRent.find(r => r.stay_month === prevMonth && r.stay_year === prevYear)
    const latestElec = roomElec.find(e => e.stay_month === prevMonth && e.stay_year === prevYear)
    return {
      ...room,
      unpaidMonthsCount: unpaidRent.length,
      unpaidRentAmount: unpaidRent.reduce((s, r) => s + parseFloat(r.amount || 0), 0),
      unpaidElecAmount: unpaidElec.reduce((s, e) => s + parseFloat(e.total_amount || 0), 0),
      latestRentStatus: latestRent?.status || null,
      latestElecStatus: latestElec?.status || null,
      unpaidRentMonths: unpaidRent.map(r => `${MONTHS[r.stay_month-1]} ${r.stay_year}`),
      tenant: null // filled separately if needed
    }
  })

  return {
    totalRooms: rooms.length,
    occupiedRooms: rooms.filter(r => r.is_occupied).length,
    totalTenants: tenantsRes.data?.length || 0,
    paidRent: allRent.filter(r => r.status === 'paid' && r.stay_month === prevMonth && r.stay_year === prevYear).length,
    unpaidRent: allRent.filter(r => r.status !== 'paid' && r.stay_month === prevMonth && r.stay_year === prevYear).length,
    totalRentCollected: allRent.filter(r => r.status === 'paid' && r.stay_month === prevMonth && r.stay_year === prevYear).reduce((s, r) => s + parseFloat(r.amount), 0),
    totalRentDue: allRent.filter(r => r.status !== 'paid' && r.stay_month === prevMonth && r.stay_year === prevYear).reduce((s, r) => s + parseFloat(r.amount), 0),
    billingMonth: prevMonth, billingYear: prevYear,
    roomLedger
  }
}