import express from "express";
import cors from "cors";
import fs from "fs";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode";
import cron from "node-cron";
import admin from "firebase-admin";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

let qrCodeBase64 = null;
let clientReady = false;
let sock = null;

// ✅ Limpa a pasta de autenticação para forçar novo QR Code
const limparAuth = () => {
  const pasta = "auth_baileys";
  if (fs.existsSync(pasta)) {
    fs.rmSync(pasta, { recursive: true, force: true });
    console.log("Auth limpa, novo QR será gerado.");
  }
};

const conectar = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("auth_baileys");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ["Sistema TV", "Chrome", "1.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodeBase64 = await qrcode.toDataURL(qr);
      clientReady = false;
      console.log("QR Code gerado");
    }

    if (connection === "open") {
      clientReady = true;
      qrCodeBase64 = null;
      console.log("WhatsApp conectado!");
    }

    if (connection === "close") {
      clientReady = false;
      const motivo = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log("Desconectado. Motivo:", motivo);

      if (motivo === DisconnectReason.loggedOut) {
        // ✅ Limpa auth antes de reconectar para gerar novo QR
        limparAuth();
        setTimeout(conectar, 1000);
      } else {
        setTimeout(conectar, 5000);
      }
    }
  });
};

conectar();

// ---- Helpers ----

const parseDate = (str) => {
  if (!str) return null;
  const [d, m, y] = str.split("/").map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
};

const diffDias = (dataStr) => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const data = parseDate(dataStr);
  if (!data) return null;
  return Math.round((data.getTime() - hoje.getTime()) / 86400000);
};

const formatarMensagem = (template, cliente) => {
  return template
    .replace(/\[NOME\]/g, cliente.nome || "")
    .replace(/\[VENCIMENTO\]/g, cliente.vencimento || "")
    .replace(/\[SERVIDOR\]/g, cliente.servidor || "")
    .replace(
      /\[VALOR\]/g,
      cliente.valor
        ? `R$ ${parseFloat(cliente.valor).toFixed(2).replace(".", ",")}`
        : ""
    );
};

// Normaliza telefone para ter exatamente um 55 e o sufixo @s.whatsapp.net
const normalizarTelefone = (tel) => {
  let num = String(tel).replace(/\D/g, "");
  if (num.startsWith("5555")) num = num.substring(2);
  else if (!num.startsWith("55")) num = "55" + num;
  return `${num}@s.whatsapp.net`;
};

const salvarLog = async (clienteNome, telefone, gatilho, mensagem, status) => {
  await db.collection("logs_whatsapp").add({
    clienteNome,
    telefone,
    gatilho,
    mensagem,
    status,
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
    dias7: {
      ativo: true,
      mensagem:
        "Olá [NOME]! 👋 Sua assinatura do servidor [SERVIDOR] vence em 7 dias, no dia *[VENCIMENTO]*.\n\nRenove com antecedência para não perder o acesso! 😊",
    },
    dias4: {
      ativo: true,
      mensagem:
        "Olá [NOME]! ⚠️ Sua assinatura do servidor [SERVIDOR] vence em 4 dias, no dia *[VENCIMENTO]*.\n\nNão deixe para a última hora, entre em contato para renovar!",
    },
    dia0: {
      ativo: true,
      mensagem:
        "Olá [NOME]! 🚨 Sua assinatura do servidor [SERVIDOR] vence *HOJE*!\n\nRenove agora para não perder o acesso. Valor: *[VALOR]*",
    },
    pos1: {
      ativo: true,
      mensagem:
        "Olá [NOME]! ❌ Sua assinatura do servidor [SERVIDOR] venceu ontem (*[VENCIMENTO]*).\n\nEntre em contato para regularizar e reativar seu acesso!",
    },
    pos3: {
      ativo: true,
      mensagem:
        "Olá [NOME]! 🔴 Sua assinatura do servidor [SERVIDOR] está vencida há 3 dias (*[VENCIMENTO]*).\n\nRegularize seu acesso o quanto antes!",
    },
  },
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
  if (!clientReady) {
    console.log("WhatsApp não conectado, pulando.");
    return;
  }

  const config = await getConfig();
  if (!config.ativo) {
    console.log("Envio automático desativado.");
    return;
  }

  const snapshot = await db.collection("clientes").get();
  const clientes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

  const regrasMap = [
    { key: "dias7", diff: 7 },
    { key: "dias4", diff: 4 },
    { key: "dia0",  diff: 0 },
    { key: "pos1",  diff: -1 },
    { key: "pos3",  diff: -3 },
  ];

  for (const cliente of clientes) {
    if (!cliente.telefone) continue;
    const diff = diffDias(cliente.vencimento);
    if (diff === null) continue;

    for (const { key, diff: diffAlvo } of regrasMap) {
      if (diff !== diffAlvo) continue;
      const regra = config.regras?.[key];
      if (!regra?.ativo) continue;

      const mensagem = formatarMensagem(regra.mensagem, cliente);
      const numero = normalizarTelefone(cliente.telefone);

      try {
        await sock.sendMessage(numero, { text: mensagem });
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
  cronJob = cron.schedule(
    `${minuto} ${hora} * * *`,
    executarEnvioAutomatico,
    { timezone: "America/Sao_Paulo" }
  );
  console.log(`Cron agendado para ${config.horario}`);
};

iniciarCron();

// ---- Rotas ----

app.get("/status", (req, res) => {
  res.json({ qr: qrCodeBase64, ready: clientReady });
});

app.post("/send", async (req, res) => {
  const { phone, message } = req.body;
  if (!clientReady)
    return res.status(503).json({ error: "WhatsApp não conectado" });

  try {
    const numero = normalizarTelefone(phone);
    await sock.sendMessage(numero, { text: message });
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
  await db
    .collection("config_whatsapp")
    .doc("principal")
    .set(req.body, { merge: true });
  await iniciarCron();
  res.json({ success: true });
});

app.get("/logs", async (req, res) => {
  const snap = await db
    .collection("logs_whatsapp")
    .orderBy("enviadoEm", "desc")
    .limit(100)
    .get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
});

app.post("/logout", async (req, res) => {
  try {
    await sock.logout();
    clientReady = false;
    qrCodeBase64 = null;
    res.json({ success: true });
    // ✅ Removido o setTimeout(conectar) daqui — o evento connection.update
    // com DisconnectReason.loggedOut já cuida de limpar auth e reconectar
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => console.log("Servidor rodando na porta 3001"));