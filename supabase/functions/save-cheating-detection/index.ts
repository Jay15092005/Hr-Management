import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { roomId, violationType, severity, confidence, metadata } = await req.json()

        // Validate required fields
        if (!roomId || !violationType || !severity || confidence === undefined) {
            return new Response(
                JSON.stringify({
                    error: 'Missing required fields: roomId, violationType, severity, confidence'
                }),
                {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            )
        }

        // Validate violation type
        const validViolationTypes = [
            'eyes_away',
            'multiple_faces',
            'head_turned',
            'low_attention',
            'tab_switch',
            'fullscreen_exit',
            'mouse_leave',
            'copy_paste',
            'suspicious_audio',
            'multiple_voices',
        ]
        if (!validViolationTypes.includes(violationType)) {
            return new Response(
                JSON.stringify({
                    error: `Invalid violation type. Must be one of: ${validViolationTypes.join(', ')}`
                }),
                {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            )
        }

        // Validate severity
        const validSeverities = ['low', 'medium', 'high']
        if (!validSeverities.includes(severity)) {
            return new Response(
                JSON.stringify({
                    error: `Invalid severity. Must be one of: ${validSeverities.join(', ')}`
                }),
                {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            )
        }

        // Validate confidence
        if (confidence < 0 || confidence > 1) {
            return new Response(
                JSON.stringify({ error: 'Confidence must be between 0 and 1' }),
                {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            )
        }

        // Create Supabase client with service role key for database access
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Get interview ID from room ID
        const { data: interview, error: interviewError } = await supabase
            .from('interview_configurations')
            .select('id')
            .eq('room_id', roomId)
            .single()

        if (interviewError || !interview) {
            console.error('Interview not found for room:', roomId, interviewError)
            return new Response(
                JSON.stringify({
                    error: 'Interview not found for the given room ID',
                    details: interviewError?.message
                }),
                {
                    status: 404,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            )
        }

        // Save detection event to database
        const { data, error } = await supabase
            .from('cheating_detections')
            .insert({
                interview_id: interview.id,
                room_id: roomId,
                violation_type: violationType,
                severity: severity,
                confidence: confidence,
                metadata: metadata || {},
                timestamp: new Date().toISOString()
            })
            .select()
            .single()

        if (error) {
            console.error('Error saving detection event:', error)
            return new Response(
                JSON.stringify({
                    error: 'Failed to save detection event',
                    details: error.message
                }),
                {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            )
        }

        console.log('Detection event saved:', {
            interviewId: interview.id,
            roomId,
            violationType,
            severity,
            confidence
        })

        return new Response(
            JSON.stringify({
                success: true,
                data,
                message: 'Detection event saved successfully'
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        )
    } catch (err) {
        console.error('Unexpected error:', err)
        return new Response(
            JSON.stringify({
                error: 'Internal server error',
                details: err instanceof Error ? err.message : 'Unknown error'
            }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        )
    }
})
