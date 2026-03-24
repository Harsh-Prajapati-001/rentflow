// frontend/src/lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

// ── Auth helpers ──────────────────────────────────────────
export const signUp = async ({ email, password, fullName, role, phone }) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, role, phone },
    },
  })
  return { data, error }
}

export const signIn = async ({ email, password }) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export const getProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return { data, error }
}

// ── Buildings ─────────────────────────────────────────────
export const getBuildings = async (ownerId) => {
  const { data, error } = await supabase
    .from('buildings')
    .select('*, rooms(count)')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
  return { data, error }
}

export const createBuilding = async ({ ownerId, name, address }) => {
  const { data, error } = await supabase
    .from('buildings')
    .insert({ owner_id: ownerId, name, address })
    .select()
    .single()
  return { data, error }
}

export const updateBuilding = async (id, updates) => {
  const { data, error } = await supabase
    .from('buildings')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export const deleteBuilding = async (id) => {
  const { error } = await supabase.from('buildings').delete().eq('id', id)
  return { error }
}

// ── Rooms ─────────────────────────────────────────────────
export const getRooms = async (buildingId) => {
  const { data, error } = await supabase
    .from('rooms')
    .select('*, tenants(id, full_name, phone, is_active)')
    .eq('building_id', buildingId)
    .order('room_number')
  return { data, error }
}

export const createRoom = async (roomData) => {
  const { data, error } = await supabase
    .from('rooms')
    .insert(roomData)
    .select()
    .single()
  return { data, error }
}

export const updateRoom = async (id, updates) => {
  const { data, error } = await supabase
    .from('rooms')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export const deleteRoom = async (id) => {
  const { error } = await supabase.from('rooms').delete().eq('id', id)
  return { error }
}

// ── Tenants ───────────────────────────────────────────────
export const getTenants = async (buildingId) => {
  const { data, error } = await supabase
    .from('tenants')
    .select('*, rooms(room_number, rent_amount)')
    .eq('building_id', buildingId)
    .eq('is_active', true)
    .order('full_name')
  return { data, error }
}

export const getTenantByUserId = async (userId) => {
  const { data, error } = await supabase
    .from('tenants')
    .select('*, rooms(*), buildings(name, address)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()
  return { data, error }
}

export const createTenant = async (tenantData) => {
  const { data, error } = await supabase
    .from('tenants')
    .insert(tenantData)
    .select()
    .single()
  return { data, error }
}

export const updateTenant = async (id, updates) => {
  const { data, error } = await supabase
    .from('tenants')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// ── Rent Records ──────────────────────────────────────────
export const getRentRecords = async (buildingId, month, year) => {
  let query = supabase
    .from('rent_records')
    .select('*, tenants(full_name, phone, whatsapp_number), rooms(room_number)')
    .eq('building_id', buildingId)

  if (month) query = query.eq('month', month)
  if (year) query = query.eq('year', year)

  const { data, error } = await query.order('due_date')
  return { data, error }
}

export const getTenantRentRecords = async (tenantId) => {
  const { data, error } = await supabase
    .from('rent_records')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
  return { data, error }
}

export const createRentRecord = async (rentData) => {
  const { data, error } = await supabase
    .from('rent_records')
    .insert(rentData)
    .select()
    .single()
  return { data, error }
}

export const updateRentRecord = async (id, updates) => {
  const { data, error } = await supabase
    .from('rent_records')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export const markRentPaid = async (id, paymentMethod) => {
  const { data, error } = await supabase
    .from('rent_records')
    .update({ status: 'paid', paid_date: new Date().toISOString().split('T')[0], payment_method: paymentMethod })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// ── Electricity ───────────────────────────────────────────
export const getElectricityRecords = async (buildingId, month, year) => {
  let query = supabase
    .from('electricity_records')
    .select('*, rooms(room_number), tenants(full_name)')
    .eq('building_id', buildingId)

  if (month) query = query.eq('month', month)
  if (year) query = query.eq('year', year)

  const { data, error } = await query.order('reading_date', { ascending: false })
  return { data, error }
}

export const createElectricityRecord = async (elecData) => {
  const { data, error } = await supabase
    .from('electricity_records')
    .insert(elecData)
    .select()
    .single()
  return { data, error }
}

// ── Documents ─────────────────────────────────────────────
export const getDocuments = async (tenantId) => {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  return { data, error }
}

export const uploadDocument = async ({ tenantId, buildingId, uploadedBy, docType, file }) => {
  const fileExt = file.name.split('.').pop()
  const filePath = `${buildingId}/${tenantId}/${docType}_${Date.now()}.${fileExt}`

  const { error: uploadError } = await supabase.storage
    .from('tenant-documents')
    .upload(filePath, file, { cacheControl: '3600', upsert: false })

  if (uploadError) return { data: null, error: uploadError }

  const { data, error } = await supabase
    .from('documents')
    .insert({
      tenant_id: tenantId,
      building_id: buildingId,
      uploaded_by: uploadedBy,
      doc_type: docType,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type,
    })
    .select()
    .single()

  return { data, error }
}

export const getDocumentUrl = async (filePath) => {
  const { data } = await supabase.storage
    .from('tenant-documents')
    .createSignedUrl(filePath, 3600)
  return data?.signedUrl
}

// ── Notifications ─────────────────────────────────────────
export const getNotifications = async (userId) => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  return { data, error }
}

export const markNotificationRead = async (id) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
  return { error }
}

export const markAllNotificationsRead = async (userId) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)
  return { error }
}

// ── Dashboard Stats ───────────────────────────────────────
export const getBuildingStats = async (buildingId) => {
  const [rooms, tenants, rentRecords] = await Promise.all([
    supabase.from('rooms').select('id, is_occupied').eq('building_id', buildingId),
    supabase.from('tenants').select('id').eq('building_id', buildingId).eq('is_active', true),
    supabase
      .from('rent_records')
      .select('status, amount')
      .eq('building_id', buildingId)
      .eq('month', new Date().getMonth() + 1)
      .eq('year', new Date().getFullYear()),
  ])

  const stats = {
    totalRooms: rooms.data?.length || 0,
    occupiedRooms: rooms.data?.filter((r) => r.is_occupied).length || 0,
    totalTenants: tenants.data?.length || 0,
    paidRent: rentRecords.data?.filter((r) => r.status === 'paid').length || 0,
    unpaidRent: rentRecords.data?.filter((r) => r.status !== 'paid').length || 0,
    totalRentDue: rentRecords.data
      ?.filter((r) => r.status !== 'paid')
      .reduce((sum, r) => sum + parseFloat(r.amount), 0) || 0,
    totalRentCollected: rentRecords.data
      ?.filter((r) => r.status === 'paid')
      .reduce((sum, r) => sum + parseFloat(r.amount), 0) || 0,
  }

  return stats
}
