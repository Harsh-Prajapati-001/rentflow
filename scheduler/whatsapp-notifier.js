// scheduler/whatsapp-notifier.js
// Runs via GitHub Actions (cron) every day at 8:00 AM and 8:00 PM IST
//
// FIX: Gemini Issue #5 — Wrong ID mapping for in-app notifications
//
// Root cause: The script was doing:
//   supabase.from('profiles').eq('id', tenant.id)
// But tenant.id is the UUID from the TENANTS table, NOT the auth UUID.
// profiles.id = auth user UUID = tenant.user_id
//
// Fix 1: The tenants select query now fetches user_id explicitly.
// Fix 2: In-app notifications use tenant.user_id (the auth UUID), not tenant.id.

import { createClient }                     from '@supabase/supabase-js'
import { Client, LocalAuth }                from 'whatsapp-web.js'
import qrcode                               from 'qrcode-terminal'
import fs                                   from 'fs'
import path                                 from 'path'

// ── Supabase ──────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── Message templates ─────────────────────────────────────
const TEMPLATES = {
  reminder_2days: (name, amount, dueDate) =>
    `🏠 *RentFlow Reminder*\n\nHi ${name},\n\nYour rent of *₹${amount}* is due in *2 days* (${dueDate}).\n\nPlease ensure timely payment.\n\n_RentFlow Property Management_`,

  due_today: (name, amount) =>
    `⚠️ *Rent Due Today*\n\nHi ${name},\n\nToday is the *last day* to pay your rent of *₹${amount}*.\n\nPlease pay immediately.\n\n_RentFlow Property Management_`,

  overdue_1: (name, amount) =>
    `🔴 *Rent Overdue — 1 Day*\n\nHi ${name},\n\nYour rent of *₹${amount}* is now *1 day overdue*.\n\nPlease pay immediately.\n\n_RentFlow Property Management_`,

  overdue_n: (name, amount, days) =>
    `🚨 *Rent Overdue — ${days} Days*\n\nHi ${name},\n\nYour rent of *₹${amount}* is *${days} days overdue*.\n\nImmediate payment required.\n\n_RentFlow Property Management_`,
}

// ── WhatsApp client ───────────────────────────────────────
let waClient = null

async function initWhatsApp() {
  return new Promise((resolve, reject) => {
    const sessionDir = path.join(process.cwd(), '.wwebjs_auth')

    if (process.env.WA_SESSION_DATA) {
      try {
        const sessionData = Buffer.from(process.env.WA_SESSION_DATA, 'base64').toString('utf8')
        fs.mkdirSync(path.join(sessionDir, 'session'), { recursive: true })
        fs.writeFileSync(path.join(sessionDir, 'session', 'session.json'), sessionData)
        console.log('✅ WhatsApp session restored')
      } catch (err) {
        console.warn('⚠️ Could not restore WA session:', err.message)
      }
    }

    waClient = new Client({
      authStrategy: new LocalAuth({ dataPath: sessionDir }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox', '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', '--disable-gpu',
          '--no-first-run', '--no-zygote', '--single-process',
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      },
    })

    waClient.on('qr',          (qr) => qrcode.generate(qr, { small: true }))
    waClient.on('ready',       ()   => { console.log('✅ WhatsApp ready'); resolve(waClient) })
    waClient.on('auth_failure',(msg) => reject(new Error('WA auth failed: ' + msg)))
    waClient.initialize()
  })
}

// ── Send WhatsApp message ─────────────────────────────────
async function sendWhatsApp(phone, message, tenantId, rentRecordId, messageType) {
  const normalized = normalizePhone(phone)
  const chatId     = `${normalized}@c.us`

  try {
    await waClient.sendMessage(chatId, message)
    await supabase.from('notification_logs').insert({
      tenant_id: tenantId, rent_record_id: rentRecordId,
      message_type: messageType, message_body: message,
      whatsapp_number: normalized, status: 'sent',
    })
    console.log(`✅ WhatsApp [${messageType}] → ${normalized}`)
    return true
  } catch (err) {
    console.error(`❌ WhatsApp failed → ${phone}:`, err.message)
    await supabase.from('notification_logs').insert({
      tenant_id: tenantId, rent_record_id: rentRecordId,
      message_type: messageType, message_body: message,
      whatsapp_number: normalized, status: 'failed',
    })
    return false
  }
}

function normalizePhone(phone) {
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('0'))         return '91' + d.slice(1)
  if (d.length === 10)           return '91' + d
  return d
}

// ── Already notified today? ───────────────────────────────
async function alreadyNotifiedToday(tenantId, messageType) {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase
    .from('notification_logs')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('message_type', messageType)
    .gte('sent_at', `${today}T00:00:00`)
    .limit(1)
  return (data?.length || 0) > 0
}

// ── Create in-app notification ────────────────────────────
// FIX: Must use authUserId (tenant.user_id) — NOT the tenants table UUID
async function createInAppNotif(authUserId, title, message, type, rentRecordId) {
  if (!authUserId) return  // Tenant has no app account — skip
  await supabase.from('notifications').insert({
    user_id: authUserId,   // FIX: this is profiles.id = auth.users.id = tenant.user_id
    title, message, type,
    related_rent_id: rentRecordId
  })
}

// ── Main scheduler ────────────────────────────────────────
async function runScheduler() {
  console.log('🚀 RentFlow WhatsApp Scheduler')
  console.log(`📅 ${new Date().toLocaleDateString('en-IN')}`)

  const today = new Date(); today.setHours(0, 0, 0, 0)

  // FIX: select includes user_id so we can use it for in-app notifications
  const { data: rentRecords, error } = await supabase
    .from('rent_records')
    .select(`
      id, amount, due_date, status, tenant_id,
      tenants (
        id,
        user_id,
        full_name,
        whatsapp_number,
        phone,
        owner_id
      )
    `)
    .in('status', ['unpaid', 'overdue'])

  if (error) {
    console.error('❌ Failed to fetch rent records:', error.message)
    process.exit(1)
  }

  console.log(`📋 ${rentRecords.length} unpaid/overdue records found`)
  if (rentRecords.length === 0) {
    console.log('✅ Nothing to notify')
    return
  }

  await initWhatsApp()

  let sent = 0, skipped = 0, failed = 0

  for (const record of rentRecords) {
    const tenant = record.tenants
    if (!tenant) { skipped++; continue }

    const waNumber = tenant.whatsapp_number || tenant.phone
    if (!waNumber) {
      console.warn(`⚠️ No phone for ${tenant.full_name}`)
      skipped++; continue
    }

    const dueDate = new Date(record.due_date); dueDate.setHours(0, 0, 0, 0)
    const diffDays = Math.round((today - dueDate) / 86400000)
    const amount   = parseFloat(record.amount).toLocaleString('en-IN')
    const dueDateStr = dueDate.toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })

    let messageType = null
    let message     = null

    if      (diffDays === -2) { messageType = 'reminder_2days'; message = TEMPLATES.reminder_2days(tenant.full_name, amount, dueDateStr) }
    else if (diffDays ===  0) { messageType = 'due_today';      message = TEMPLATES.due_today(tenant.full_name, amount) }
    else if (diffDays ===  1) { messageType = 'overdue_1';      message = TEMPLATES.overdue_1(tenant.full_name, amount) }
    else if (diffDays >=   2) { messageType = `overdue_${diffDays}`; message = TEMPLATES.overdue_n(tenant.full_name, amount, diffDays) }
    else { skipped++; continue }

    const alreadySent = await alreadyNotifiedToday(tenant.id, messageType)
    if (alreadySent) { console.log(`⏭️  Already notified ${tenant.full_name} [${messageType}]`); skipped++; continue }

    const ok = await sendWhatsApp(waNumber, message, tenant.id, record.id, messageType)

    // ── In-app notifications ──────────────────────────────
    // Owner notification
    if (tenant.owner_id) {
      await supabase.from('notifications').insert({
        user_id:          tenant.owner_id,   // owner's auth UUID
        title:            diffDays < 0
                            ? `⏰ Reminder: ${tenant.full_name}`
                            : `⚠️ ${tenant.full_name} — ${diffDays} Day(s) Overdue`,
        message:          `Rent (₹${amount}) — ${messageType.replace(/_/g,' ')}`,
        type:             diffDays >= 0 ? 'overdue' : 'warning',
        related_rent_id:  record.id,
        related_tenant_id: tenant.id,
      })
    }

    // FIX: Tenant in-app notification uses tenant.user_id (auth UUID)
    // NOT tenant.id (tenants table UUID)
    await createInAppNotif(
      tenant.user_id,   // ← THE FIX: auth UUID, maps correctly to profiles.id
      diffDays < 0
        ? `⏰ Rent Due in ${Math.abs(diffDays)} Day(s)`
        : `⚠️ Rent ${diffDays} Day(s) Overdue`,
      `Your rent of ₹${amount} — ${messageType.replace(/_/g,' ')}`,
      diffDays >= 0 ? 'overdue' : 'warning',
      record.id
    )

    if (ok) sent++
    else    failed++

    // Small delay to avoid WhatsApp rate limiting
    await new Promise(r => setTimeout(r, 2000))
  }

  console.log(`\n📊 Sent=${sent} | Skipped=${skipped} | Failed=${failed}`)
  await waClient.destroy()
  console.log('✅ Scheduler complete')
}

// ── Run ───────────────────────────────────────────────────
runScheduler().catch(err => {
  console.error('💥 Scheduler crashed:', err)
  process.exit(1)
})
