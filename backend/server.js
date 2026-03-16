const express = require("express");
const cors = require("cors");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");

const app = express();
app.use(cors());
app.use(express.json());

let qrCodeBase64 = null;
let clientReady = false;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
});

client.on("qr", async (qr) => {
  clientReady = false;
  qrCodeBase64 = await qrcode.toDataURL(qr);
});

client.on("ready", () => {
  clientReady = true;
  qrCodeBase64 = null;
  console.log("WhatsApp conectado!");
});

client.on("disconnected", () => {
  clientReady = false;
  console.log("WhatsApp desconectado.");
  client.initialize();
});

client.initialize();

let ultimoQR = null;
app.get("/status", (req, res) => {
  if (clientReady) {
    ultimoQR = null;
    return res.json({ ready: true, qr: null });
  }
  if (qrCodeBase64 !== ultimoQR) ultimoQR = qrCodeBase64;
  res.json({ ready: false, qr: ultimoQR });
});

app.post("/enviar", async (req, res) => {
  const { telefone, mensagem } = req.body;
  if (!clientReady) return res.status(503).json({ erro: "WhatsApp nao conectado." });
  try {
    const numero = telefone.replace(/\D/g, "");
const chatId = numero.startsWith("55") ? numero + "@c.us" : "55" + numero + "@c.us";

    await client.sendMessage(chatId, mensagem);
    res.json({ sucesso: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.listen(3001, () => console.log("Backend rodando em http://localhost:3001"));
