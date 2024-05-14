const express = require("express");
const app = express();
const { resolve } = require("path");
// Replace if using a different env file or config
const env = require("dotenv").config({ path: "./.env" });
let fetch;

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2022-08-01",
});
const bodyParser = require('body-parser');

app.use(express.static(process.env.STATIC_DIR));

(async () => {
  fetch = (await import('node-fetch')).default;
})();

// Настройка парсинга тела запроса для webhook
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (request, response) => {
  const sig = request.headers['stripe-signature'];
  const endpointSecret = "";

  let event;

  try {
    event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        const email = paymentIntent.receipt_email;

        
        if (!fetch) fetch = (await import('node-fetch')).default;

        console.log( "TEEEST" );
        // Отправка данных на Java бэкенд сервер
        const backendResponse = await fetch('http://localhost:8080/api/tickets/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: email,
            paymentIntentId: paymentIntent.id,
            amount: paymentIntent.amount,
            status: "paid"
          })
        });

        if (!backendResponse.ok) {
          throw new Error('Failed to send data to backend server');
        }

        const backendData = await backendResponse.json();
        console.log('Data sent to backend:', backendData);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
    response.json({ received: true });
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    response.status(400).send(`Webhook Error: ${err.message}`);
  }
});

app.get("/", (req, res) => {
  const path = resolve(process.env.STATIC_DIR + "/index.html");
  res.sendFile(path);
});

app.get("/config", (req, res) => {
  res.send({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  });
});

app.post("/create-payment-intent", async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      currency: "EUR",
      amount: 100, // Сумма в центах
      automatic_payment_methods: { enabled: true },
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (e) {
    console.error(e);
    res.status(400).send({ error: { message: e.message } });
  }
});

const PORT = process.env.PORT || 5252;
app.listen(PORT, () => console.log(`Node server listening at http://localhost:${PORT}`));
