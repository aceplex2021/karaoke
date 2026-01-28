import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.12'
import Stripe from 'https://esm.sh/stripe@14.25.0?target=denonext'
import { corsHeaders } from '../_shared/cors.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16'
})

const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: {
        ...corsHeaders, 
        'Access-Control-Allow-Headers': 'stripe-signature, content-type'
      }
    })
  }

  try {
    const rawBody = await req.text()
    const signature = req.headers.get('stripe-signature')
    
    let event: Stripe.Event

    // Verify webhook signature
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        endpointSecret
      )
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message)
      return new Response(
        JSON.stringify({ error: `Webhook Error: ${err.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Log event info
    console.log('Processing webhook event:', {
      id: event.id,
      type: event.type,
      metadata: event.data.object.metadata
    })

    // Store webhook data
    const { error: insertError } = await supabaseClient
      .from('webhook_logs')
      .insert({
        event_id: event.id,
        event_type: event.type,
        payload: event.data,
        headers: Object.fromEntries(req.headers.entries()),
        status: 'received',
        created_at: new Date().toISOString(),
        member_id: event.data.object.metadata?.member_id,
        tournament_id: event.data.object.metadata?.tournament_id,
        stripe_payment_id: event.data.object.payment_intent,
        customer_name: event.data.object.customer_details?.name,
        customer_email: event.data.object.customer_details?.email,
        amount: event.data.object.amount_total
      })

    if (insertError) {
      console.error('Failed to store webhook:', insertError)
      throw insertError
    }

    // If payment successful, update payment status
    if (event.type === 'checkout.session.completed') {
      const metadata = event.data.object.metadata
      const { error: paymentError } = await supabaseClient
        .from('tournament_payments')
        .update({
          status: 'paid',
          payment_date: new Date().toISOString(),
          stripe_payment_id: event.data.object.payment_intent,
          notes: metadata.notes || null
        })
        .match({
          tournament_id: metadata.tournament_id,
          member_id: metadata.member_id,
          status: 'pending'
        })

      if (paymentError) {
        console.error('Failed to update payment status:', paymentError)
        throw paymentError
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Webhook handler error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})