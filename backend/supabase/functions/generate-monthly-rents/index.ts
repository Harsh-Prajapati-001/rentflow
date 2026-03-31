// Supabase Edge Function — generate-monthly-rents
// POSTPAID: generates bill for last month's stay, due this month
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

  // POSTPAID: bill for the month that just completed
  // Running on April 1 → billing for March (month 3)
  const stayMonth = today.getMonth() === 0 ? 12 : today.getMonth()
  const stayYear  = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()

  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, room_id, building_id, rooms(rent_amount, due_date)')
    .eq('is_active', true)
    .not('room_id', 'is', null)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  let created = 0, skipped = 0

  for (const tenant of tenants ?? []) {
    const { data: existing } = await supabase
      .from('rent_records')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('month', stayMonth)
      .eq('year', stayYear)
      .maybeSingle()

    if (existing) { skipped++; continue }

    // Due date = X days into the month AFTER the stay month
    const dueDay   = (tenant.rooms as any)?.due_date ?? 5
    const dueMonth = stayMonth === 12 ? 1 : stayMonth + 1
    const dueYear  = stayMonth === 12 ? stayYear + 1 : stayYear
    const dueDate  = new Date(dueYear, dueMonth - 1, dueDay)

    const { error: insertErr } = await supabase.from('rent_records').insert({
      tenant_id:   tenant.id,
      room_id:     tenant.room_id,
      building_id: tenant.building_id,
      month:       stayMonth,
      year:        stayYear,
      amount:      (tenant.rooms as any)?.rent_amount ?? 0,
      due_date:    dueDate.toISOString().split('T')[0],
      status:      'unpaid',
    })

    if (!insertErr) created++
  }

  // Also auto-mark overdue
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
