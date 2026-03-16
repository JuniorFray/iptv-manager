const express = require("express");
const cors = require("cors");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const cron = require("node-cron");
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

let qrCodeBase64 = null;
let clientReady = false;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
});

client.on("qr", async (qr) => {
  qrCodeBase64 = await qrcode.toDataURL(qr);
  clientReady = false;
  console.log("QR Code gerado");
});

client.on("ready", () => {
  clientReady = true;
  qrCodeBase64 = null;
  console.log("WhatsApp conectado!");
});

client.on("disconnected", () => {
  clientReady = false;
  console.log("WhatsApp desconectado");
});

client.initialize();

// ---- Helpers ----

const parseDate = (str) => {
  if (!str) return null;
  const [d, m, y] = str.split("/").map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
};

const diffDias = (dataStr) => {
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const data = parseDate(dataStr);
  if (!data) return null;
  return Math.round((data.getTime() - hoje.getTime()) / 86400000);
};

const formatarMensagem = (template, cliente) => {
  return template
    .replace(/\[NOME\]/g, cliente.nome || "")
    .replace(/\[VENCIMENTO\]/g, cliente.vencimento || "")
    .replace(/\[SERVIDOR\]/g, cliente.servidor || "")
    .replace(/\[VALOR\]/g, cliente.valor ? `R$ ${parseFloat(cliente.valor).toFixed(2).replace(".", ",")}` : "");
};

const salvarLog = async (clienteNome, telefone, gatilho, mensagem, status) => {
  await db.collection("logs_whatsapp").add({
    clienteNome, telefone, gatilho, mensagem, status,
    enviadoEm: admin.firestore.FieldValue.serverTimestamp(),
    data: new Date().toLocaleDateString("pt-BR"),
    hora: new Date().toLocaleTimeString("pt-BR"),
  });
};

// ---- Config padrão ----

const configPadrao = {
  horario: "09:00",
  ativo: true,
  regras: {
    dias7:   { ativo: true, mensagem: "Olá [NOME]! 👋 Sua assinatura do servidor [SERVIDOR] vence em 7 dias, no dia *[VENCIMENTO]*.\n\nRenove com antecedência para não perder o acesso! 😊" },
    dias4:   { ativo: true, mensagem: "Olá [NOME]! ⚠️ Sua assinatura do servidor [SERVIDOR] vence em 4 dias, no dia *[VENCIMENTO]*.\n\nNão deixe para a última hora, entre em contato para renovar!" },
    dia0:    { ativo: true, mensagem: "Olá [NOME]! 🚨 Sua assinatura do servidor [SERVIDOR] vence *HOJE*!\n\nRenove agora para não perder o acesso. Valor: *[VALOR]*" },
    pos1:    { ativo: true, mensagem: "Olá [NOME]! ❌ Sua assinatura do servidor [SERVIDOR] venceu ontem (*[VENCIMENTO]*).\n\nEntre em contato para regularizar e reativar seu acesso!" },
    pos3:    { ativo: true, mensagem: "Olá [NOME]! 🔴 Sua assinatura do servidor [SERVIDOR] está vencida há 3 dias (*[VENCIMENTO]*).\n\nRegularize seu acesso o quanto antes!" },
  }
};

const getConfig = async () => {
  const snap = await db.collection("config_whatsapp").doc("principal").get();
  if (!snap.exists) {
    await db.collection("config_whatsapp").doc("principal").set(configPadrao);
    return configPadrao;
  }
  return snap.data();
};

// ---- Envio automático ----

const executarEnvioAutomatico = async () => {
  console.log("Iniciando envio automático...");
  if (!clientReady) { console.log("WhatsApp não conectado, pulando envio."); return; }

  const config = await getConfig();
  if (!config.ativo) { console.log("Envio automático desativado."); return; }

  const snapshot = await db.collection("clientes").get();
  const clientes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

  for (const cliente of clientes) {
    if (!cliente.telefone) continue;
    const diff = diffDias(cliente.vencimento);
    if (diff === null) continue;

    const regrasMap = [
      { key: "dias7", diff: 7  },
      { key: "dias4", diff: 4  },
      { key: "dia0",  diff: 0  },
      { key: "pos1",  diff: -1 },
      { key: "pos3",  diff: -3 },
    ];

    for (const { key, diff: diffAlvo } of regrasMap) {
      if (diff !== diffAlvo) continue;
      const regra = config.regras?.[key];
      if (!regra?.ativo) continue;

      const mensagem = formatarMensagem(regra.mensagem, cliente);
      const numero = `55${cliente.telefone.replace(/\D/g, "")}@c.us`;

      try {
        await client.sendMessage(numero, mensagem);
        await salvarLog(cliente.nome, cliente.telefone, key, mensagem, "enviado");
        console.log(`Enviado para ${cliente.nome} (${key})`);
      } catch (err) {
        await salvarLog(cliente.nome, cliente.telefone, key, mensagem, "erro");
        console.error(`Erro ao enviar para ${cliente.nome}:`, err.message);
      }
    }
  }
  console.log("Envio automático concluído.");
};

// ---- Cron dinâmico ----

let cronJob = null;

const iniciarCron = async () => {
  const config = await getConfig();
  const [hora, minuto] = (config.horario || "09:00").split(":").map(Number);
  if (cronJob) cronJob.stop();
  cronJob = cron.schedule(`${minuto} ${hora} * * *`, executarEnvioAutomatico, { timezone: "America/Sao_Paulo" });
  console.log(`Cron agendado para ${config.horario}`);
};

iniciarCron();

// ---- Rotas ----

app.get("/status", (req, res) => {
  res.json({ qr: qrCodeBase64, ready: clientReady });
});

app.post("/send", async (req, res) => {
  const { phone, message } = req.body;
  if (!clientReady) return res.status(503).json({ error: "WhatsApp não conectado" });
  try {
    const numero = `55${phone.replace(/\D/g, "")}@c.us`;
    await client.sendMessage(numero, message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/send-automatico", async (req, res) => {
  await executarEnvioAutomatico();
  res.json({ success: true });
});

app.get("/config", async (req, res) => {
  const config = await getConfig();
  res.json(config);
});

app.post("/config", async (req, res) => {
  await db.collection("config_whatsapp").doc("principal").set(req.body, { merge: true });
  await iniciarCron();
  res.json({ success: true });
});

app.get("/logs", async (req, res) => {
  const snap = await db.collection("logs_whatsapp")
    .orderBy("enviadoEm", "desc")
    .limit(100)
    .get();
  const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  res.json(logs);
});

app.post("/logout", async (req, res) => {
  try {
    await client.logout();
    clientReady = false;
    qrCodeBase64 = null;
    res.json({ success: true });
    setTimeout(() => { client.initialize(); }, 3000);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => console.log("Servidor rodando na porta 3001"));




