// scheduler/whatsapp-notifier.js
// Runs via GitHub Actions (cron) every day at 8:00 AM IST
// Uses Twilio API for WhatsApp messaging
// Node.js 18+

import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

// ── Supabase Setup ────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // Service role for server-side access
)

// ── Twilio Setup ──────────────────────────────────────────
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

// ── Message Templates ─────────────────────────────────────
const TEMPLATES = {
  reminder_2days: (name, amount, dueDate) =>
    `🏠 *RentFlow Reminder*\n\nHi ${name},\n\nYour rent of *₹${amount}* is due in *2 days* (${dueDate}).\n\nPlease ensure timely payment to avoid late fees.\n\n_RentFlow Property Management_`,

  due_today: (name, amount) =>
    `⚠️ *Rent Due Today*\n\nHi ${name},\n\nToday is the *last day* to pay your rent of *₹${amount}*.\n\nPlease pay immediately to avoid overdue charges.\n\n_RentFlow Property Management_`,

  overdue_1: (name, amount, days) =>
    `🔴 *Rent Overdue - ${days} Day*\n\nHi ${name},\n\nYour rent of *₹${amount}* is now *${days} day overdue*.\n\nPlease pay immediately to avoid further penalties.\n\n_RentFlow Property Management_`,

  overdue_n: (name, amount, days) =>
    `🚨 *Rent Overdue - ${days} Days*\n\nHi ${name},\n\nYour rent of *₹${amount}* is *${days} days overdue*.\n\nImmediate payment required. Contact your owner if you have any issues.\n\n_RentFlow Property Management_`,
}

// ── Send WhatsApp Message ─────────────────────────────────
async function sendMessage(phone, message, tenantId, rentRecordId, messageType) {
  try {
    // Normalize phone to WhatsApp format (with +)
    const normalized = normalizePhone(phone)

    // Send via Twilio
    await twilioClient.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${normalized}`,
      body: message,
    })

    // Log to Supabase
    await supabase.from('notification_logs').insert({
      tenant_id: tenantId,
      rent_record_id: rentRecordId,
      message_type: messageType,
      message_body: message,
      whatsapp_number: normalized,
      status: 'sent',
    })

    console.log(`✅ Sent [${messageType}] to ${normalized}`)
    return true
  } catch (err) {
    console.error(`❌ Failed to send to ${phone}:`, err.message)

    await supabase.from('notification_logs').insert({
      tenant_id: tenantId,
      rent_record_id: rentRecordId,
      message_type: messageType,
      message_body: message,
      whatsapp_number: phone,
      status: 'failed',
    })

    return false
  }
}

function normalizePhone(phone) {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '')
  // If starts with 0, replace with 91
  if (digits.startsWith('0')) return '+91' + digits.slice(1)
  // If 10 digits (Indian mobile), prepend +91
  if (digits.length === 10) return '+91' + digits
  // If doesn't start with +, add it
  if (!digits.startsWith('+')) return '+' + digits
  // Already has country code
  return '+' + digits
}

// ── Already Notified Today Check ─────────────────────────
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

// ── Create In-App Notifications ───────────────────────────
async function createInAppNotification(userId, tenantName, status, days) {
  let title, message, type

  if (status === 'reminder_2days') {
    title = 'Rent Due in 2 Days'
    message = `Rent for ${tenantName} is due in 2 days.`
    type = 'warning'
  } else if (status === 'due_today') {
    title = 'Rent Due Today'
    message = `Today is the last day for ${tenantName} to pay rent.`
    type = 'warning'
  } else {
    title = `Rent Overdue — ${days} day(s)`
    message = `${tenantName} is ${days} day(s) overdue on rent.`
    type = 'overdue'
  }

  await supabase.from('notifications').insert({ user_id: userId, title, message, type })
}

// ── Main Scheduler Logic ──────────────────────────────────
async function runScheduler() {
  console.log('🚀 RentFlow WhatsApp Scheduler starting...')
  console.log(`📅 Date: ${new Date().toLocaleDateString('en-IN')}`)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Fetch all unpaid/overdue rent records with tenant info
  const { data: rentRecords, error } = await supabase
    .from('rent_records')
    .select(`
      id, amount, due_date, status, tenant_id,
      tenants (
        id, full_name, whatsapp_number, phone, owner_id,
        buildings (id, owner_id)
      )
    `)
    .in('status', ['unpaid', 'overdue'])

  if (error) {
    console.error('❌ Failed to fetch rent records:', error.message)
    process.exit(1)
  }

  console.log(`📋 Found ${rentRecords.length} unpaid/overdue records`)

  if (rentRecords.length === 0) {
    console.log('✅ No notifications needed today')
    return
  }

  let sent = 0, skipped = 0, failed = 0

  for (const record of rentRecords) {
    const tenant = record.tenants
    if (!tenant) continue

    const waNumber = tenant.whatsapp_number || tenant.phone
    if (!waNumber) {
      console.warn(`⚠️ No phone for tenant ${tenant.full_name}`)
      skipped++
      continue
    }

    const dueDate = new Date(record.due_date)
    dueDate.setHours(0, 0, 0, 0)
    const diffDays = Math.round((today - dueDate) / 86400000)
    const amount = parseFloat(record.amount).toLocaleString('en-IN')
    const dueDateStr = dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

    let messageType = null
    let message = null

    if (diffDays === -2) {
      // 2 days BEFORE due
      messageType = 'reminder_2days'
      message = TEMPLATES.reminder_2days(tenant.full_name, amount, dueDateStr)
    } else if (diffDays === 0) {
      // Due TODAY
      messageType = 'due_today'
      message = TEMPLATES.due_today(tenant.full_name, amount)
    } else if (diffDays === 1) {
      // 1 day overdue
      messageType = 'overdue_1'
      message = TEMPLATES.overdue_1(tenant.full_name, amount, 1)
    } else if (diffDays >= 2) {
      // N days overdue
      messageType = `overdue_${diffDays}`
      message = TEMPLATES.overdue_n(tenant.full_name, amount, diffDays)
    } else {
      // Not yet time to notify
      skipped++
      continue
    }

    // Check if already notified today with this type
    const alreadySent = await alreadyNotifiedToday(tenant.id, messageType)
    if (alreadySent) {
      console.log(`⏭️ Already notified ${tenant.full_name} [${messageType}] today`)
      skipped++
      continue
    }

    // Send WhatsApp
    const success = await sendMessage(waNumber, message, tenant.id, record.id, messageType)

    // Create in-app notification for owner
    await createInAppNotification(
      tenant.buildings?.owner_id || tenant.owner_id,
      tenant.full_name,
      messageType,
      diffDays > 0 ? diffDays : null
    )

    // Create in-app notification for tenant (if they have a user account)
    const { data: tenantProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', tenant.id)
      .maybeSingle()

    if (tenantProfile) {
      let tenantTitle, tenantMsg, tenantType
      if (diffDays < 0) {
        tenantTitle = `Rent Due in ${Math.abs(diffDays)} Days`
        tenantMsg = `Your rent of ₹${amount} is due on ${dueDateStr}.`
        tenantType = 'warning'
      } else if (diffDays === 0) {
        tenantTitle = 'Rent Due Today'
        tenantMsg = `Your rent of ₹${amount} is due today.`
        tenantType = 'warning'
      } else {
        tenantTitle = `You are ${diffDays} day(s) overdue`
        tenantMsg = `Your rent of ₹${amount} is ${diffDays} day(s) overdue. Please pay immediately.`
        tenantType = 'overdue'
      }
      await supabase.from('notifications').insert({
        user_id: tenantProfile.id,
        title: tenantTitle,
        message: tenantMsg,
        type: tenantType,
      })
    }

    if (success) sent++
    else failed++

    // Small delay to respect Twilio rate limits
    await new Promise((r) => setTimeout(r, 1000))
  }

  console.log(`\n📊 Summary: Sent=${sent} | Skipped=${skipped} | Failed=${failed}`)
  console.log('✅ Scheduler complete')
}

// ── Run ───────────────────────────────────────────────────
runScheduler().catch((err) => {
  console.error('💥 Scheduler crashed:', err)
  process.exit(1)
})
