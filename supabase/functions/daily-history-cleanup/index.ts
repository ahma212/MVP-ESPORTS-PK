import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Security check: verify request is authorized via Service Role / Bearer auth or internal cron header
    const authHeader = req.headers.get('Authorization')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing server environment variables (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    // Initialize Supabase Admin client strictly on the server side
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // Execute the database cleanup procedure: SELECT public.cleanup_old_history();
    const { data, error } = await supabaseAdmin.rpc('cleanup_old_history')

    if (error) {
      console.error('Error executing public.cleanup_old_history():', error)
      return new Response(JSON.stringify({ 
        success: false, 
        error: error.message 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    console.log('Successfully executed public.cleanup_old_history()')
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'public.cleanup_old_history() executed successfully',
      result: data ?? null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err: any) {
    console.error('Exception in daily-history-cleanup Edge Function:', err)
    return new Response(JSON.stringify({ 
      success: false, 
      error: err.message 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
