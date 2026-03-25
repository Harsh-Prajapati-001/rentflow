import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // 1. Connect to your database using the secure Service Role Key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log("Starting monthly rent generation...")

    // 2. Fetch all active tenants
    const { data: tenants, error: fetchError } = await supabase
      .from('tenants')
      .select('*')
      .eq('status', 'active') // Assuming you only bill active tenants

    if (fetchError) throw fetchError

    if (!tenants || tenants.length === 0) {
      return new Response(JSON.stringify({ message: "No active tenants found." }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })
    }

    // 3. Prepare the new rent records for this month
    const currentDate = new Date()
    const currentMonth = currentDate.getMonth() + 1 // 1-12
    const currentYear = currentDate.getFullYear()
    
    // Set due date to the 5th of the current month (Adjust if needed!)
    const dueDate = new Date(currentYear, currentMonth - 1, 5).toISOString()

    const newRents = tenants.map((tenant) => ({
      tenant_id: tenant.id,
      amount: tenant.rent_amount, // Assumes your tenant table has a rent_amount column
      due_date: dueDate,
      status: 'unpaid',
      month: currentMonth,
      year: currentYear
    }))

    // 4. Insert the new rent records into the database
    const { error: insertError } = await supabase
      .from('rent_records')
      .insert(newRents)

    if (insertError) throw insertError

    return new Response(
      JSON.stringify({ message: `Successfully generated ${newRents.length} rent records.` }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    })
  }
})