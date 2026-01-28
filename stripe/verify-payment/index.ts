import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.12'
import Stripe from 'https://esm.sh/stripe@13.10.0'
import { corsHeaders } from '../_shared/cors.ts'

// Get Supabase client
const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
)

// Get secret key from environment variable
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
})

// Get Supabase client
const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
)

// Get secret key from environment variable
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
})

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { payment_id } = await req.json()
    console.log('Headers:', Object.fromEntries(req.headers.entries()))

    // Get payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_id);

    // Update payment record if payment is successful
    if (paymentIntent.status === 'succeeded') {
      const { error: paymentError } = await supabaseClient
        .from('tournament_payments')
        .update({
          status: 'paid',
          payment_date: new Date().toISOString(),
          payment_id: payment_id
        })
        .eq('payment_id', payment_id);

      if (paymentError) throw paymentError;
    }

    return new Response(
      JSON.stringify({ 
        isVerified: paymentIntent.status === 'succeeded',
        status: paymentIntent.status
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Payment verification error:', error)
    return new Response(
      JSON.stringify({ isVerified: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})