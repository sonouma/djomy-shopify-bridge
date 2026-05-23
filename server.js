require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const CryptoJS = require("crypto-js");

const app = express();
app.use(express.json());

const {
  DJOMY_CLIENT_ID,
  DJOMY_CLIENT_SECRET,
  DJOMY_API_URL,
  SHOPIFY_STORE_URL,
} = process.env;

function getXApiKey() {
  const signature = CryptoJS.HmacSHA256(
    DJOMY_CLIENT_ID,
    DJOMY_CLIENT_SECRET
  ).toString(CryptoJS.enc.Hex);
  return `${DJOMY_CLIENT_ID}:${signature}`;
}

async function getJwtToken() {
  const res = await fetch(`${DJOMY_API_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: DJOMY_CLIENT_ID,
      clientSecret: DJOMY_CLIENT_SECRET,
    }),
  });
  const data = await res.json();
  return data.access_token;
}

app.get("/", (req, res) => {
  res.send("✅ Djomy-Shopify Bridge opérationnel !");
});

app.get("/pay", async (req, res) => {
  const { order_id, amount, currency = "GNF" } = req.query;
  if (!order_id || !amount) {
    return res.status(400).send("Paramètres manquants : order_id et amount requis.");
  }
  try {
    const token = await getJwtToken();
    const response = await fetch(`${DJOMY_API_URL}/v1/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-API-KEY": getXApiKey(),
      },
      body: JSON.stringify({
        amount: parseFloat(amount),
        currency,
        merchantPaymentReference: order_id,
        returnUrl: `${SHOPIFY_STORE_URL}/pages/paiement-confirme?order_id=${order_id}`,
        cancelUrl: `${SHOPIFY_STORE_URL}/cart`,
        metadata: { order_id },
      }),
    });
    const data = await response.json();
    if (data?.data?.providerRedirectUrl) {
      return res.redirect(data.data.providerRedirectUrl);
    } else {
      console.error("Réponse Djomy :", JSON.stringify(data));
      return res.status(500).send("Erreur lors de la création du paiement. Veuillez réessayer.");
    }
  } catch (err) {
    console.error("Erreur serveur :", err);
    return res.status(500).send("Erreur interne du serveur.");
  }
});

app.post("/webhook", async (req, res) => {
  const event = req.body;
  console.log("Webhook reçu :", JSON.stringify(event));
  if (event.eventType === "payment.success") {
    const orderId = event.data?.merchantPaymentReference;
    console.log(`Paiement réussi pour la commande : ${orderId}`);
  }
  if (event.eventType === "payment.failed") {
    const orderId = event.data?.merchantPaymentReference;
    console.log(`Paiement échoué pour la commande : ${orderId}`);
  }
  res.sendStatus(200);
});

// Route pour tester le token JWT
app.get("/get-token", async (req, res) => {
  try {
    const token = await getJwtToken();
    res.json({ access_token: token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
