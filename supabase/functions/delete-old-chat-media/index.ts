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
    const body = await req.json().catch(() => ({}))

    // Handle both Database Webhook payload (old_record / record) and direct JSON body
    const oldRecord = body.old_record || body.record || {}
    const mediaUrl = body.mediaUrl || body.media_url || oldRecord.media_url || null
    let pathToDelete = body.objectPath || body.object_path || null

    // If no media_url or objectPath is present (e.g. text-only message deleted), exit cleanly
    if (!mediaUrl && !pathToDelete) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No media_url present on deleted row. No storage file to remove.' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Safety check: NEVER delete banners or files outside chat-media
    if (mediaUrl && (mediaUrl.includes('banner') || mediaUrl.includes('banners/'))) {
      return new Response(JSON.stringify({ success: false, error: 'Protected banner file path. Operation ignored.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Extract exact object path from media_url if pathToDelete is not directly specified
    if (!pathToDelete && mediaUrl) {
      try {
        const parts = mediaUrl.split('/chat-media/')
        if (parts.length > 1) {
          pathToDelete = decodeURIComponent(parts[1].split('?')[0])
        }
      } catch (e) {
        console.error('Error parsing media_url:', e)
      }
    }

    // Safety check: verify pathToDelete exists and does not contain banner or path traversal
    if (!pathToDelete || pathToDelete.includes('banner') || pathToDelete.includes('..')) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid or protected object path' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Initialize Supabase Admin client using service role key strictly inside Edge Function
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify if any active row in friend_chats still references this mediaUrl or objectPath
    const { data: existingRows } = await supabaseAdmin
      .from('friend_chats')
      .select('id')
      .or(`media_url.ilike.%${pathToDelete}%,media_url.eq.${mediaUrl}`)
      .limit(1)

    if (existingRows && existingRows.length > 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Object is still referenced by another active message in friend_chats. Skips deletion.' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Delete exact file from chat-media storage bucket
    const { error: removeError } = await supabaseAdmin.storage.from('chat-media').remove([pathToDelete])

    if (removeError) {
      console.error('Edge Function Storage remove warning:', removeError.message)
      // Return 200 so storage errors never crash or block database triggers
      return new Response(JSON.stringify({ success: false, error: removeError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    console.log(`Successfully deleted old chat media from storage: ${pathToDelete}`)
    return new Response(JSON.stringify({ success: true, deletedPath: pathToDelete }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err: any) {
    console.error('Edge function exception:', err)
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})

