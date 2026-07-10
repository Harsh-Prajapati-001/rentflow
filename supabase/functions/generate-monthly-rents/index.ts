// supabase/functions/generate-monthly-rents/index.ts
// Supabase Edge Function — generate-monthly-rents
// Generates postpaid rent records for the completed stay month, due in the following month.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${Deno.env.get('FUNCTION_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const today = new Date()
  // POSTPAID billing: bill for the month that just completed
  // E.g., Running on April 1st -> stayMonth is 3 (March), stayYear is 2026
  const stayMonth = today.getMonth() === 0 ? 12 : today.getMonth()
  const stayYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()

  // Fetch active tenants that are assigned to a room
  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, room_id, building_id, rooms(rent_amount, due_date_day)')
    .eq('is_active', true)
    .not('room_id', 'is', null)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  let created = 0
  let skipped = 0

  for (const tenant of tenants ?? []) {
    // Check if record already exists for this stay month
    const { data: existing } = await supabase
      .from('rent_records')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('stay_month', stayMonth)
      .eq('stay_year', stayYear)
      .maybeSingle()

    if (existing) {
      skipped++
      continue
    }

    const dueDay = (tenant.rooms as any)?.due_date_day ?? 5
    const dueMonth = stayMonth === 12 ? 1 : stayMonth + 1
    const dueYear = stayMonth === 12 ? stayYear + 1 : stayYear

    const periodStart = new Date(stayYear, stayMonth - 1, 1)
    const periodEnd = new Date(stayYear, stayMonth, 0) // Last day of stay month
    const dueDate = new Date(dueYear, dueMonth - 1, dueDay)

    const { error: insertErr } = await supabase.from('rent_records').insert({
      tenant_id: tenant.id,
      room_id: tenant.room_id,
      building_id: tenant.building_id,
      stay_month: stayMonth,
      stay_year: stayYear,
      period_start: periodStart.toISOString().split('T')[0],
      period_end: periodEnd.toISOString().split('T')[0],
      amount: (tenant.rooms as any)?.rent_amount ?? 0,
      due_date: dueDate.toISOString().split('T')[0],
      status: 'unpaid'
    })

    if (!insertErr) {
      created++
    } else {
      console.error('Insert error for tenant', tenant.id, insertErr.message)
    }
  }

  // Auto-mark overdue rent records
  await supabase
    .from('rent_records')
    .update({ status: 'overdue' })
    .eq('status', 'unpaid')
    .lt('due_date', today.toISOString().split('T')[0])

  return new Response(
    JSON.stringify({ success: true, stayMonth, stayYear, created, skipped }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})