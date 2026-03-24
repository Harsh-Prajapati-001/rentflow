// backend/supabase/functions/generate-monthly-rents/index.ts
// Supabase Edge Function — triggered on 1st of each month via GitHub Actions
// or manually via HTTP POST

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // Verify secret header (set in GitHub Actions)
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${Deno.env.get('FUNCTION_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  // Get all active tenants with their room rent info
  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, room_id, building_id, rooms(rent_amount, due_date)')
    .eq('is_active', true)
    .not('room_id', 'is', null)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  let created = 0
  let skipped = 0

  for (const tenant of tenants ?? []) {
    // Check if rent record already exists for this month
    const { data: existing } = await supabase
      .from('rent_records')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('month', month)
      .eq('year', year)
      .maybeSingle()

    if (existing) {
      skipped++
      continue
    }

    const dueDay = (tenant.rooms as any)?.due_date ?? 1
    const dueDate = new Date(year, month - 1, dueDay)

    const { error: insertErr } = await supabase.from('rent_records').insert({
      tenant_id: tenant.id,
      room_id: tenant.room_id,
      building_id: tenant.building_id,
      month,
      year,
      amount: (tenant.rooms as any)?.rent_amount ?? 0,
      due_date: dueDate.toISOString().split('T')[0],
      status: 'unpaid',
    })

    if (!insertErr) created++
  }

  return new Response(
    JSON.stringify({ success: true, month, year, created, skipped }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
