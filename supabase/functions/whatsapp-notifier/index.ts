// supabase/functions/whatsapp-notifier/index.ts
// Sends WhatsApp reminders via Twilio Business API for Rent and Electricity bills
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

serve(async (req) => {
  // 1. Verify authorization
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${Deno.env.get('FUNCTION_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 2. Twilio Credentials
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
  const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN')!
  const twilioWaNumber = Deno.env.get('TWILIO_WA_NUMBER')! // e.g., +14155238886
  const twilioAuth = btoa(`${twilioSid}:${twilioToken}`)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let sent = 0
  let failed = 0

  // ==========================================
  // 3. Process Rent Records
  // ==========================================
  const { data: rentRecords, error: rentError } = await supabase
    .from('rent_records')
    .select(`
      id, amount, due_date, status, stay_month, stay_year,
      tenants ( id, user_id, owner_id, full_name, phone, whatsapp_number )
    `)
    .in('status', ['unpaid', 'overdue'])

  if (rentError) {
    console.error('Error fetching rent records:', rentError.message)
  } else {
    for (const record of (rentRecords as any) || []) {
      const tenant = record.tenants
      if (!tenant) continue

      // Determine target phone number (prefer explicit whatsapp_number, fallback to phone)
      let phoneStr = tenant.whatsapp_number || tenant.phone
      if (!phoneStr) continue

      // Format to E.164 standard required by Twilio (assuming India +91)
      phoneStr = phoneStr.trim()
      if (phoneStr.length === 10) phoneStr = `+91${phoneStr}`
      if (!phoneStr.startsWith('+')) phoneStr = `+${phoneStr}`

      // Calculate days difference
      const dueDate = new Date(record.due_date)
      dueDate.setHours(0, 0, 0, 0)
      const diffTime = today.getTime() - dueDate.getTime()
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

      // Determine if we should send a message today
      let message = ''
      const monthName = MONTHS[record.stay_month - 1] || `Month ${record.stay_month}`
      const amountStr = parseFloat(record.amount || 0).toFixed(2)

      if (diffDays === -2) {
        message = `*RentFlow Reminder*\n\nHi ${tenant.full_name},\nYour rent of *₹${amountStr}* for ${monthName} ${record.stay_year} is due in *2 days* (${record.due_date}).\nPlease ensure timely payment to avoid late fees.`
      } else if (diffDays === 0) {
        message = `*Rent Due Today*\n\nHi ${tenant.full_name},\nToday is the *last day* to pay your rent of *₹${amountStr}* for ${monthName} ${record.stay_year}.\nPlease pay immediately to avoid overdue charges.`
      } else if (diffDays > 0) {
        message = `*Rent Overdue - ${diffDays} Day(s)*\n\nHi ${tenant.full_name},\nYour rent of *₹${amountStr}* for ${monthName} ${record.stay_year} is now *${diffDays} day(s) overdue*.\nPlease pay immediately.`
      }

      if (!message) continue

      // Send message via Twilio REST API
      const body = new URLSearchParams({
        To: `whatsapp:${phoneStr}`,
        From: `whatsapp:${twilioWaNumber}`,
        Body: message
      })

      try {
        const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${twilioAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: body.toString()
        })

        if (twilioRes.ok) {
          sent++
          // Log the in-app notification for the tenant
          if (tenant.user_id) {
            await supabase.from('notifications').insert({
              user_id: tenant.user_id,
              title: diffDays < 0 ? `Rent Due in ${Math.abs(diffDays)} Day(s)` : `Rent ${diffDays} Day(s) Overdue`,
              message: `Your rent of ₹${amountStr} for ${monthName} ${record.stay_year} is ${diffDays < 0 ? 'due soon' : 'overdue'}.`,
              type: diffDays >= 0 ? 'overdue' : 'warning',
              related_rent_id: record.id
            })
          }
          // Log in notification_logs
          await supabase.from('notification_logs').insert({
            tenant_id: tenant.id,
            rent_record_id: record.id,
            message_type: 'whatsapp_rent_reminder',
            message_body: message,
            whatsapp_number: phoneStr,
            status: 'sent'
          })
        } else {
          failed++
          const errText = await twilioRes.text()
          console.error(`Twilio error for ${phoneStr} (Rent):`, errText)
          await supabase.from('notification_logs').insert({
            tenant_id: tenant.id,
            rent_record_id: record.id,
            message_type: 'whatsapp_rent_reminder',
            message_body: message,
            whatsapp_number: phoneStr,
            status: 'failed'
          })
        }
      } catch (e) {
        failed++
        console.error(`Network error sending WhatsApp to ${phoneStr} (Rent):`, e)
      }
    }
  }

  // ==========================================
  // 4. Process Electricity Records
  // ==========================================
  const { data: elecRecords, error: elecError } = await supabase
    .from('electricity_records')
    .select(`
      id, total_amount, due_date, status, stay_month, stay_year,
      tenants ( id, user_id, owner_id, full_name, phone, whatsapp_number )
    `)
    .in('status', ['unpaid', 'overdue'])

  if (elecError) {
    console.error('Error fetching electricity records:', elecError.message)
  } else {
    for (const record of (elecRecords as any) || []) {
      const tenant = record.tenants
      if (!tenant) continue

      // Determine target phone number (prefer explicit whatsapp_number, fallback to phone)
      let phoneStr = tenant.whatsapp_number || tenant.phone
      if (!phoneStr) continue

      // Format to E.164 standard required by Twilio (assuming India +91)
      phoneStr = phoneStr.trim()
      if (phoneStr.length === 10) phoneStr = `+91${phoneStr}`
      if (!phoneStr.startsWith('+')) phoneStr = `+${phoneStr}`

      // Calculate days difference
      const dueDate = new Date(record.due_date)
      dueDate.setHours(0, 0, 0, 0)
      const diffTime = today.getTime() - dueDate.getTime()
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

      // Determine if we should send a message today
      let message = ''
      const monthName = MONTHS[record.stay_month - 1] || `Month ${record.stay_month}`
      const amountStr = parseFloat(record.total_amount || 0).toFixed(2)

      if (diffDays === -2) {
        message = `*RentFlow Electricity Bill Reminder*\n\nHi ${tenant.full_name},\nYour electricity bill of *₹${amountStr}* for ${monthName} ${record.stay_year} is due in *2 days* (${record.due_date}).\nPlease ensure timely payment to avoid late fees.`
      } else if (diffDays === 0) {
        message = `*RentFlow Electricity Bill Due Today*\n\nHi ${tenant.full_name},\nToday is the *last day* to pay your electricity bill of *₹${amountStr}* for ${monthName} ${record.stay_year}.\nPlease pay immediately to avoid overdue charges.`
      } else if (diffDays > 0) {
        message = `*RentFlow Electricity Bill Overdue - ${diffDays} Day(s)*\n\nHi ${tenant.full_name},\nYour electricity bill of *₹${amountStr}* for ${monthName} ${record.stay_year} is now *${diffDays} day(s) overdue*.\nPlease pay immediately.`
      }

      if (!message) continue

      // Send message via Twilio REST API
      const body = new URLSearchParams({
        To: `whatsapp:${phoneStr}`,
        From: `whatsapp:${twilioWaNumber}`,
        Body: message
      })

      try {
        const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${twilioAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: body.toString()
        })

        if (twilioRes.ok) {
          sent++
          // Log the in-app notification for the tenant
          if (tenant.user_id) {
            await supabase.from('notifications').insert({
              user_id: tenant.user_id,
              title: diffDays < 0 ? `Electricity Bill Due in ${Math.abs(diffDays)} Day(s)` : `Electricity Bill ${diffDays} Day(s) Overdue`,
              message: `Your electricity bill of ₹${amountStr} for ${monthName} ${record.stay_year} is ${diffDays < 0 ? 'due soon' : 'overdue'}.`,
              type: diffDays >= 0 ? 'overdue' : 'warning',
              related_elec_id: record.id
            })
          }
          // Log in notification_logs
          await supabase.from('notification_logs').insert({
            tenant_id: tenant.id,
            message_type: 'whatsapp_electricity_reminder',
            message_body: message,
            whatsapp_number: phoneStr,
            status: 'sent'
          })
        } else {
          failed++
          const errText = await twilioRes.text()
          console.error(`Twilio error for ${phoneStr} (Electricity):`, errText)
          await supabase.from('notification_logs').insert({
            tenant_id: tenant.id,
            message_type: 'whatsapp_electricity_reminder',
            message_body: message,
            whatsapp_number: phoneStr,
            status: 'failed'
          })
        }
      } catch (e) {
        failed++
        console.error(`Network error sending WhatsApp to ${phoneStr} (Electricity):`, e)
      }
    }
  }

  return new Response(JSON.stringify({ sent, failed }), {
    headers: { 'Content-Type': 'application/json' }
  })
})