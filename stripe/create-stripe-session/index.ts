import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.12'
import Stripe from 'https://esm.sh/stripe@13.10.0'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
)

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16'
})

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { tournament_id, member_id, amount, metadata } = await req.json()

    if (!tournament_id || !member_id || !amount) {
      throw new Error('Missing required parameters')
    }

    // Get tournament and member info
    const { data: tournament, error: tournamentError } = await supabaseClient
      .from('tournaments')
      .select('name')
      .eq('id', tournament_id)
      .single()

    if (tournamentError) throw tournamentError

    const { data: member, error: memberError } = await supabaseClient
      .from('members')
      .select('name, email')
      .eq('id', member_id)
      .single()

    if (memberError) throw memberError
    }

    // Check for existing payment record
    const { data: existingPayment, error: checkError } = await supabaseClient
      .from('tournament_payments')
      .select()
      .eq('tournament_id', tournament_id)
      .eq('member_id', member_id)
      .single()

    if (checkError && !checkError.message?.includes('No rows found')) throw checkError

    let payment
    
    if (existingPayment?.status === 'paid') {
      throw new Error('Already registered for this tournament')
    } else if (existingPayment) {
      // Update existing payment record
      const { data: updatedPayment, error: updateError } = await supabaseClient
        .from('tournament_payments')
        .update({
          amount,
          status: 'pending',
          payment_method: 'stripe',
          name: member.name,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingPayment.id)
        .select()
        .single()

      if (updateError) throw updateError
      payment = updatedPayment
    } else {
      // Create new payment record
      const { data: newPayment, error: insertError } = await supabaseClient
        .from('tournament_payments')
        .insert({
          tournament_id,
          member_id,
          amount,
          status: 'pending',
          payment_method: 'stripe',
          name: member.name,
          notes: metadata?.notes || null
        })
        .select()
        .single()

      if (insertError) throw insertError
      payment = newPayment
    }

    // Create Stripe session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      client_reference_id: payment.id,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${tournament.name} Registration - ${member.name}`,
              metadata: {
                ...(metadata || {}),
                notes: metadata?.notes || null
              }
            },
            unit_amount: amount
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      success_url: `${req.headers.get('origin')}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get('origin')}/?payment=cancel`,
      metadata: {
        tournament_id,
        member_id,
        payment_id: payment.id,
        ...(metadata || {}),
        notes: metadata?.notes || null
      },
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60) // 30 minutes
    })

    // Update payment record with session info
    const { error: updateError } = await supabaseClient
      .from('tournament_payments')
      .update({
        stripe_session_id: session.id,
        stripe_session_url: session.url,
        notes: metadata?.notes || null
      })
      .eq('id', payment.id)

    if (updateError) throw updateError

    return new Response(
      JSON.stringify({
        stripe_session_id: session.id,
        stripe_session_url: session.url,
        payment_id: payment.id
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        } 
      }
    )

  } catch (error) {
    console.error('Payment session error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        } 
      }
    )
  }
})