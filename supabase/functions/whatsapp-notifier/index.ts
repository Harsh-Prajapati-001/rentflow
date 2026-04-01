// supabase/functions/whatsapp-notifier/index.ts
// Sends WhatsApp reminders via Twilio Business API

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

  // 3. Fetch all unpaid/overdue rent records
  const { data: records, error } = await supabase
    .from('rent_records')
    .select(`
      id, amount, due_date, status,
      tenants ( id, user_id, owner_id, profiles ( full_name, phone, whatsapp_number ) )
    `)
    .in('status', ['unpaid', 'overdue'])

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  let sent = 0, failed = 0

  for (const record of records || []) {
    const tenant = record.tenants
    const profile = tenant?.profiles
    if (!profile) continue

    // Determine target phone number (prefer explicit whatsapp_number, fallback to phone)
    let phoneStr = profile.whatsapp_number || profile.phone
    if (!phoneStr) continue
    
    // Format to E.164 standard required by Twilio (assuming India +91)
    if (phoneStr.length === 10) phoneStr = `+91${phoneStr}`
    if (!phoneStr.startsWith('+')) phoneStr = `+${phoneStr}`

    // Calculate days difference
    const dueDate = new Date(record.due_date)
    dueDate.setHours(0, 0, 0, 0)
    const diffTime = today.getTime() - dueDate.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    // Determine if we should send a message today
    let message = ''
    if (diffDays === -2) {
      message = `🏠 *RentFlow Reminder*\n\nHi ${profile.full_name},\nYour rent of *₹${record.amount}* is due in *2 days* (${record.due_date}).\nPlease ensure timely payment to avoid late fees.`
    } else if (diffDays === 0) {
      message = `⚠️ *Rent Due Today*\n\nHi ${profile.full_name},\nToday is the *last day* to pay your rent of *₹${record.amount}*.\nPlease pay immediately to avoid overdue charges.`
    } else if (diffDays > 0) {
      message = `🔴 *Rent Overdue - ${diffDays} Day(s)*\n\nHi ${profile.full_name},\nYour rent of *₹${record.amount}* is now *${diffDays} day(s) overdue*.\nPlease pay immediately.`
    }

    if (!message) continue // No message needed for this day

    // 4. Send message via Twilio REST API
    const body = new URLSearchParams({
      To: `whatsapp:${phoneStr}`,
      From: `whatsapp:${twilioWaNumber}`,
      Body: message
    })

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
      // Also log the in-app notification for the tenant
      await supabase.from('notifications').insert({
        user_id: tenant.user_id,
        title: diffDays < 0 ? `⏰ Rent Due in ${Math.abs(diffDays)} Day(s)` : `⚠️ Rent ${diffDays} Day(s) Overdue`,
        message: `Your rent of ₹${record.amount} is ${diffDays < 0 ? 'due soon' : 'overdue'}.`,
        type: diffDays >= 0 ? 'overdue' : 'warning',
        related_rent_id: record.id
      })
    } else {
      failed++
      console.error(`Twilio error for ${phoneStr}:`, await twilioRes.text())
    }
  }

  return new Response(JSON.stringify({ sent, failed }), { headers: { 'Content-Type': 'application/json' } })
})