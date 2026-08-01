const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

exports.createCheckoutSession = async (req, res) => {
  try {
    // If you send 'payload' directly from frontend, use req.body
    // If you send { bookingPayload: payload }, use req.body.bookingPayload
    const data = req.body.bookingPayload || req.body; 

    if (!data.totalAmount) {
      return res.status(400).json({ error: "Invalid booking data" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "inr",
          product_data: { 
            name: data.roomType || "Hotel Room Booking",
            description: `Stay for ${data.totalNights} night(s)`
          },
          unit_amount: Math.round(data.totalAmount * 100), 
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/bookingformpage`,
      // IMPORTANT: Store data here to retrieve it on the success page
      metadata: {
        room: data.room?.toString(),
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        mobileNo: data.mobileNo,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        totalAmount: data.totalAmount.toString()
      }
    });

    // Return the URL so the frontend can redirect
    res.status(200).json({ id: session.id, url: session.url });
  } catch (error) {
    console.error("Stripe Error:", error);
    res.status(500).json({ error: "Payment initiation failed" });
  }
};