import express from "express";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";

const app = express();
const PORT = 3000;

app.use(express.json());

// Disable caching for dynamic API responses to ensure real-time updates
app.use((req, res, next) => {
  if (req.url.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
  }
  next();
});

// Ensure data folder exists
const isNetlify = !!process.env.NETLIFY || !!process.env.NETLIFY_DEV;
const DATA_DIR = isNetlify ? path.join("/tmp", "data") : path.join(process.cwd(), "data");
const ORIGINAL_DATA_DIR = path.join(process.cwd(), "data");

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.error("Erro ao criar DATA_DIR:", e);
  }
}

// On Netlify, copy any existing data files from read-only project bundle to writable /tmp/data
if (isNetlify && fs.existsSync(ORIGINAL_DATA_DIR)) {
  try {
    const files = fs.readdirSync(ORIGINAL_DATA_DIR);
    for (const file of files) {
      const srcPath = path.join(ORIGINAL_DATA_DIR, file);
      const destPath = path.join(DATA_DIR, file);
      if (!fs.existsSync(destPath) && fs.statSync(srcPath).isFile()) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`Copiado ${file} para diretório temporário gravável: ${destPath}`);
      }
    }
  } catch (err) {
    console.error("Erro ao copiar arquivos originais para /tmp/data:", err);
  }
}

const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

// Initial orders empty for production
const INITIAL_ORDERS: any[] = [];

// Helper to load/save orders
function getOrders() {
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      const data = fs.readFileSync(ORDERS_FILE, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed.map((o: any) => {
          if (o && o.id) {
            o.id = String(o.id).replace(/^#/, "");
          }
          return o;
        });
      }
      return parsed;
    }
  } catch (err) {
    console.error("Error reading orders file:", err);
  }
  return INITIAL_ORDERS;
}

function saveOrders(orders: any[]) {
  try {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing orders file:", err);
  }
}

const USERS_FILE = path.join(DATA_DIR, "users.json");
const DEFAULT_LOCAL_USERS = [
  { email: "servicosdarin@gmail.com", password: "handvida2026", name: "Administrador", status: "Ativo" },
  { email: "admin@handvida.org", password: "1234", name: "Suporte", status: "Ativo" }
];

function getUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error("Error reading users file:", err);
  }
  return DEFAULT_LOCAL_USERS;
}

function saveUsers(users: any[]) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing users file:", err);
  }
}

// Helper to load/save integration config
function getConfig() {
  const defaults = {
    googleSheetsWebhookUrl: "https://script.google.com/macros/s/AKfycbws83fNFaGtVROVKu8Rf9Oy0IuBt4wggFTLno2i0mKKI3zwoaLwGr-bdbG1N1DzZhfO/exec",
    googleSpreadsheetId: "1kpdpXdw--duOxjuw61EoAQS30FG_uYJeyhc-cy7Eny0",
    autoSyncEnabled: true,
    mercadoPagoAccessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || "APP_USR-sandbox-test-key",
    mercadoPagoPublicKey: process.env.MERCADOPAGO_PUBLIC_KEY || "TEST-pub-key-123",
    emailNotifySender: process.env.EMAIL_SENDER || "notificacoes@handvida-aguaviva.com.br",
    smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
    smtpPort: parseInt(process.env.SMTP_PORT || "465"),
    smtpSecure: process.env.SMTP_SECURE === "true" || true,
    smtpUser: process.env.SMTP_USER || "",
    smtpPass: process.env.SMTP_PASS || ""
  };
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      const merged = { ...defaults, ...saved };
      if (merged.googleSpreadsheetId === "1-exemplo-planilha-solidaria-handebol-2026") {
        merged.googleSpreadsheetId = "1kpdpXdw--duOxjuw61EoAQS30FG_uYJeyhc-cy7Eny0";
      }
      if (!merged.googleSheetsWebhookUrl) {
        merged.googleSheetsWebhookUrl = "https://script.google.com/macros/s/AKfycbws83fNFaGtVROVKu8Rf9Oy0IuBt4wggFTLno2i0mKKI3zwoaLwGr-bdbG1N1DzZhfO/exec";
      }
      return merged;
    }
  } catch (e) {}
  return defaults;
}

function saveConfig(config: any) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch (e) {}
}

// Ensure initial save if file doesn't exist
if (!fs.existsSync(ORDERS_FILE)) {
  saveOrders(INITIAL_ORDERS);
}

// Helper to generate valid EMVCo BR Code (Pix Copy & Paste) with CRC16
function generatePixString(pixKey: string, amount: number, orderId: string): string {
  const amountStr = Number(amount || 50).toFixed(2);
  const cleanId = (orderId || "1001").replace(/\D/g, "") || "1001";
  const txId = `PED${cleanId}`.slice(0, 25);

  const gui = "0014br.gov.bcb.pix";
  const keyLen = pixKey.length < 10 ? `0${pixKey.length}` : `${pixKey.length}`;
  const f26Sub = `${gui}01${keyLen}${pixKey}`;
  const f26Len = f26Sub.length < 10 ? `0${f26Sub.length}` : `${f26Sub.length}`;
  const f26 = `26${f26Len}${f26Sub}`;

  const f52 = "52040000";
  const f53 = "5303986";
  const amtLen = amountStr.length < 10 ? `0${amountStr.length}` : `${amountStr.length}`;
  const f54 = `54${amtLen}${amountStr}`;
  const f58 = "5802BR";
  const name = "COLEGIO AGUA VIVA";
  const nameLen = name.length < 10 ? `0${name.length}` : `${name.length}`;
  const f59 = `59${nameLen}${name}`;
  const city = "SAO PAULO";
  const cityLen = city.length < 10 ? `0${city.length}` : `${city.length}`;
  const f60 = `60${cityLen}${city}`;

  const txIdLen = txId.length < 10 ? `0${txId.length}` : `${txId.length}`;
  const f62Sub = `05${txIdLen}${txId}`;
  const f62Len = f62Sub.length < 10 ? `0${f62Sub.length}` : `${f62Sub.length}`;
  const f62 = `62${f62Len}${f62Sub}`;

  const payload = `000201${f26}${f52}${f53}${f54}${f58}${f59}${f60}${f62}6304`;

  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  const crcHex = crc.toString(16).toUpperCase().padStart(4, "0");
  return payload + crcHex;
}

// Helper to keep the Google Sheets database fully in sync on any status updates or deletions
async function syncAllToGoogleSheetsBackend(config: any, orders: any[]) {
  if (!config.googleSpreadsheetId || !config.googleAccessToken) return;
  try {
    const headers = [
      "ID Pedido",
      "Data/Hora",
      "Nome Cliente",
      "WhatsApp",
      "Aluno / Turma Indicada",
      "Forma Pagamento",
      "Status Pedido",
      "Valor Total (R$)",
      "Itens Resumo",
      "E-mail",
      "CPF",
      "Itens JSON"
    ];

    // Ordenar os pedidos de acordo com o número do pedido (ID numérico)
    const sortedOrders = [...orders].sort((a, b) => {
      const numA = parseInt(String(a.id).replace(/\D/g, "")) || 0;
      const numB = parseInt(String(b.id).replace(/\D/g, "")) || 0;
      return numA - numB;
    });

    const rows = sortedOrders.map((o) => {
      const itensSummary = o.items
        .map((i: any) => `${i.quantity}x ${i.name}`)
        .join("; ");

      return [
        String(o.id).replace(/^#/, ""),
        o.createdAt ? new Date(o.createdAt).toISOString() : new Date().toISOString(),
        o.customerName,
        o.whatsapp || "",
        `${o.studentName} (${o.studentTurma})`,
        o.paymentMethod,
        o.status,
        o.total.toFixed(2),
        itensSummary,
        o.email || "",
        o.cpf || "",
        JSON.stringify(o.items)
      ];
    });

    const values = [headers, ...rows];

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${config.googleSpreadsheetId}/values/Pedidos!A1?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${config.googleAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          range: "Pedidos!A1",
          majorDimension: "ROWS",
          values,
        }),
      }
    );
    if (!res.ok) {
      console.error("Erro na re-sincronização automática com Google Sheets:", await res.text());
    } else {
      console.log("✅ Planilha Google Sheets re-sincronizada com sucesso!");
    }
  } catch (err) {
    console.error("Erro na re-sincronização automática com Google Sheets:", err);
  }
}

// ========================
// API ENDPOINTS
// ========================

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "Pizza Solidária Handebol Água Viva" });
});

// Get all orders (with optional search query by cpf, code, or general query)
app.get("/api/orders", (req, res) => {
  const orders = getOrders();
  const { cpf, code, q } = req.query;
  
  if (cpf || code || q) {
    const queryCpf = String(cpf || "").replace(/\D/g, "");
    const queryCode = String(code || "").trim().toLowerCase();
    const queryGeneral = String(q || "").trim().toLowerCase();
    const cleanGeneralDigits = queryGeneral.replace(/\D/g, "");

    const filtered = orders.filter((o: any) => {
      let matchCpf = false;
      if (queryCpf) {
        const orderCpfDigits = (o.cpf || "").replace(/\D/g, "");
        matchCpf = orderCpfDigits === queryCpf || (queryCpf.length >= 3 && orderCpfDigits.includes(queryCpf));
      }

      let matchCode = false;
      if (queryCode) {
        const oId = String(o.id).toLowerCase();
        matchCode = oId === queryCode || oId === `#${queryCode}` || oId.replace("#", "") === queryCode.replace("#", "");
      }

      let matchGeneral = false;
      if (queryGeneral) {
        const oId = String(o.id).toLowerCase();
        const orderCpfDigits = (o.cpf || "").replace(/\D/g, "");
        const matchId = oId.replace(/^#/, "") === queryGeneral.replace(/^#/, "");
        const matchCpfGen = cleanGeneralDigits.length >= 3 && orderCpfDigits && orderCpfDigits.includes(cleanGeneralDigits);
        const matchName = String(o.customerName || "").toLowerCase().includes(queryGeneral);
        matchGeneral = matchId || matchCpfGen || matchName;
      }

      if (cpf && code) return matchCpf && matchCode;
      if (cpf) return matchCpf;
      if (code) return matchCode;
      if (q) return matchGeneral;
      return true;
    });

    // Sort filtered orders by order number (numeric)
    const sortedFiltered = filtered.sort((a: any, b: any) => {
      const numA = parseInt(String(a.id).replace(/\D/g, "")) || 0;
      const numB = parseInt(String(b.id).replace(/\D/g, "")) || 0;
      return numA - numB;
    });

    return res.json({ orders: sortedFiltered });
  }

  // Sort all orders by order number (numeric)
  const sortedAll = orders.sort((a: any, b: any) => {
    const numA = parseInt(String(a.id).replace(/\D/g, "")) || 0;
    const numB = parseInt(String(b.id).replace(/\D/g, "")) || 0;
    return numA - numB;
  });

  res.json({ orders: sortedAll });
});

// Get single order by ID
app.get("/api/orders/:id", async (req, res) => {
  const orders = getOrders();
  const targetId = req.params.id.replace(/^#/, "");
  const index = orders.findIndex((o: any) => String(o.id).replace(/^#/, "") === targetId);
  if (index === -1) {
    return res.status(404).json({ error: "Pedido não encontrado" });
  }

  const order = orders[index];
  const config = getConfig();
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || config.mercadoPagoAccessToken || config.mercadoPagoToken;

  // Se o pedido está pendente e temos um ID de pagamento do Mercado Pago e token de acesso
  if (order.status !== "PAGO" && order.mpPaymentId && accessToken && accessToken.startsWith("APP_USR-")) {
    try {
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${order.mpPaymentId}`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (mpRes.ok) {
        const paymentData = await mpRes.json();
        if (paymentData.status === "approved") {
          order.status = "PAGO";
          order.paidAt = new Date().toISOString();
          saveOrders(orders);
          console.log(`✅ [Polling] Pedido ${order.id} aprovado automaticamente via Pix verificado!`);
          
          // Sincroniza em tempo real com Google Sheets
          syncAllToGoogleSheetsBackend(config, orders);
        }
      }
    } catch (err) {
      console.error("Erro ao verificar status do pagamento no Mercado Pago via Polling:", err);
    }
  }

  res.json({ order: orders[index] });
});

// Create order
app.post("/api/orders", async (req, res) => {
  try {
    const orders = getOrders();
    const config = getConfig();
    let nextNum = 1001;
    if (orders.length > 0) {
      const maxId = Math.max(...orders.map((o: any) => parseInt(String(o.id).replace(/\D/g, "")) || 0));
      nextNum = maxId > 0 ? maxId + 1 : 1001 + orders.length;
    }
    const orderId = String(nextNum);
    
    const { items, customerName, cpf, studentTurma, studentName, email, whatsapp, paymentMethod, cardData, total } = req.body;
    
    if (!items || !items.length || !customerName) {
      return res.status(400).json({ error: "Dados incompletos no pedido" });
    }

    let processedCardData = undefined;
    if (paymentMethod === "CARTAO" && cardData) {
      const cleanNum = (cardData.cardNumber || "").replace(/\D/g, "");
      const last4 = cleanNum.slice(-4) || "XXXX";
      processedCardData = {
        cardNumberMasked: `•••• •••• •••• ${last4}`,
        cardHolder: (cardData.cardHolder || "").toUpperCase(),
        installments: "1",
        cardType: cardData.cardType || "CREDITO"
      };
    }

    const totalAmount = Number(total) || items.reduce((acc: number, i: any) => acc + (i.price * i.quantity), 0);
    const pixString = generatePixString("servicosdarin@gmail.com", totalAmount, orderId);

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || config.mercadoPagoAccessToken || config.mercadoPagoToken;
    let mpPaymentId: string | undefined = undefined;
    let finalPixString = pixString;

    if (paymentMethod === "PIX" && accessToken && accessToken.startsWith("APP_USR-")) {
      try {
        const response = await fetch("https://api.mercadopago.com/v1/payments", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "X-Idempotency-Key": `${orderId}-${Date.now()}`
          },
          body: JSON.stringify({
            transaction_amount: Number(totalAmount),
            description: `Pedido de Pizzas Hand Vida ${orderId}`,
            payment_method_id: "pix",
            external_reference: orderId,
            payer: {
              email: email || "comprador@handvida.org",
              first_name: customerName?.split(" ")[0] || "Cliente",
              last_name: customerName?.split(" ").slice(1).join(" ") || "Solidário"
            }
          })
        });

        const mpData = await response.json();
        if (response.ok && mpData.point_of_interaction?.transaction_data) {
          const txData = mpData.point_of_interaction.transaction_data;
          mpPaymentId = String(mpData.id);
          finalPixString = txData.qr_code;
          console.log(`✅ Criado pagamento PIX no Mercado Pago com ID: ${mpPaymentId}`);
        } else {
          console.warn("Mercado Pago API retornou erro ao criar pagamento, usando fallback simulado:", mpData);
        }
      } catch (err) {
        console.error("Erro ao falar com Mercado Pago API para gerar pagamento real:", err);
      }
    }

    const newOrder = {
      id: orderId,
      items,
      total: totalAmount,
      customerName,
      cpf: cpf || "Não informado",
      studentTurma: studentTurma || "Não informado",
      studentName: studentName || "Campanha Geral",
      email: email || "nao-informado@colagua.com.br",
      whatsapp: whatsapp || "(00) 00000-0000",
      paymentMethod: paymentMethod || "PIX",
      cardData: processedCardData,
      status: paymentMethod === "PIX" ? "AGUARDANDO_PAGAMENTO" : "PROCESSANDO",
      createdAt: new Date().toISOString(),
      pickupDate: "21 de Agosto das 14h às 17h",
      mpTransactionId: `tx_${Date.now()}`,
      mpPaymentId,
      pixCopyPaste: finalPixString
    };

    orders.unshift(newOrder);
    saveOrders(orders);

    // If auto sync with Google Sheets webhook is enabled
    if (config.googleSheetsWebhookUrl && config.autoSyncEnabled) {
      try {
        await fetch(config.googleSheetsWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newOrder)
        });
      } catch (webhookErr) {
        console.error("Erro ao notificar webhook Google Sheets:", webhookErr);
      }
    }

    // Direct Google Sheets API append if spreadsheetId and token are set (Real-time DB sync)
    if (config.googleSpreadsheetId && config.googleAccessToken) {
      try {
        const itensSummary = newOrder.items
          .map((i: any) => `${i.quantity}x ${i.name}`)
          .join("; ");

        const row = [
          newOrder.id,
          new Date(newOrder.createdAt).toISOString(),
          newOrder.customerName,
          newOrder.whatsapp,
          `${newOrder.studentName} (${newOrder.studentTurma})`,
          newOrder.paymentMethod,
          newOrder.status,
          newOrder.total.toFixed(2),
          itensSummary,
          newOrder.email,
          newOrder.cpf,
          JSON.stringify(newOrder.items)
        ];

        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${config.googleSpreadsheetId}/values/Pedidos!A:A:append?valueInputOption=USER_ENTERED`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.googleAccessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              range: "Pedidos!A:A",
              majorDimension: "ROWS",
              values: [row],
            }),
          }
        );
      } catch (sheetsErr) {
        console.error("Erro na sincronização direta em tempo real com Google Sheets:", sheetsErr);
      }
    }

    res.status(201).json({ order: newOrder });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update order status (Admin or Payment confirmation)
app.patch("/api/orders/:id/status", (req, res) => {
  const orders = getOrders();
  const targetId = req.params.id.replace(/^#/, "");
  const index = orders.findIndex((o: any) => String(o.id).replace(/^#/, "") === targetId);
  
  if (index === -1) {
    return res.status(404).json({ error: "Pedido não encontrado" });
  }

  const { status } = req.body;
  orders[index].status = status;
  saveOrders(orders);

  const config = getConfig();
  syncAllToGoogleSheetsBackend(config, orders);

  res.json({ order: orders[index] });
});

// Delete all orders (Admin cleanup)
app.delete("/api/orders", (req, res) => {
  saveOrders([]);
  const config = getConfig();
  syncAllToGoogleSheetsBackend(config, []);
  res.json({ success: true, message: "Todos os pedidos foram removidos com sucesso." });
});

// Delete single order by ID
app.delete("/api/orders/:id", (req, res) => {
  const orders = getOrders();
  const targetId = req.params.id.replace(/^#/, "");
  const filtered = orders.filter((o: any) => String(o.id).replace(/^#/, "") !== targetId);
  saveOrders(filtered);
  const config = getConfig();
  syncAllToGoogleSheetsBackend(config, filtered);
  res.json({ success: true });
});

// Simulate instant PIX approval (Great for user verification and demo!)
app.post("/api/payment/simulate-pix-approval/:id", (req, res) => {
  const orders = getOrders();
  const targetId = req.params.id.replace(/^#/, "");
  const index = orders.findIndex((o: any) => String(o.id).replace(/^#/, "") === targetId);
  
  if (index === -1) {
    return res.status(404).json({ error: "Pedido não encontrado" });
  }

  const order = orders[index];
  order.status = "PAGO";
  order.paidAt = new Date().toISOString();
  saveOrders(orders);

  const config = getConfig();
  syncAllToGoogleSheetsBackend(config, orders);

  const msg = order.paymentMethod === "CARTAO" 
    ? "Pagamento no Cartão de Crédito aprovado com sucesso!" 
    : "Pagamento aprovado via Mercado Pago PIX Instantâneo!";

  res.json({ success: true, order, message: msg });
});

// Mercado Pago Checkout preference / QR Code generator (Support Real API or Fallback EMVCo Simulation)
app.post("/api/payment/mercadopago/checkout", async (req, res) => {
  const { orderId, total, customerName, email, items } = req.body;
  const config = getConfig();
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || config.mercadoPagoToken;

  // 1. If real Mercado Pago Access Token is configured, call official REST API v1/payments
  if (accessToken && accessToken.startsWith("APP_USR-")) {
    try {
      const response = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": `${orderId}-${Date.now()}`
        },
        body: JSON.stringify({
          transaction_amount: Number(total || 50),
          description: `Pedido de Pizzas Hand Vida ${orderId}`,
          payment_method_id: "pix",
          external_reference: orderId,
          payer: {
            email: email || "comprador@handvida.org",
            first_name: customerName?.split(" ")[0] || "Cliente",
            last_name: customerName?.split(" ").slice(1).join(" ") || "Solidário"
          }
        })
      });

      const data = await response.json();
      if (response.ok && data.point_of_interaction?.transaction_data) {
        const txData = data.point_of_interaction.transaction_data;
        return res.json({
          success: true,
          paymentMethod: "PIX",
          mpPaymentId: data.id,
          qrCodeBase64: txData.qr_code_base64,
          pixCopyPaste: txData.qr_code,
          ticketUrl: txData.ticket_url,
          expiresInSeconds: 86400,
          status: data.status
        });
      }
      console.warn("Mercado Pago API falhou ou retornou erro, usando fallback:", data);
    } catch (err) {
      console.error("Erro na comunicação com Mercado Pago API:", err);
    }
  }

  // 2. Fallback: Generate clean EMVCo / BR Code PIX payload for immediate instant testing
  const pixCopyPaste = generatePixString("servicosdarin@gmail.com", Number(total || 50), orderId);

  res.json({
    success: true,
    paymentMethod: "PIX",
    qrCodeBase64: null, // Client renders SVG/HTML canvas QR directly
    pixCopyPaste,
    checkoutUrl: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=sim_${orderId.replace("#", "")}`,
    expiresInSeconds: 1800,
    status: "pending"
  });
});

// Mercado Pago Webhook / Notificação IPN para atualização em tempo real
app.post("/api/webhooks/mercadopago", async (req, res) => {
  const { action, data } = req.body;
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || getConfig().mercadoPagoToken;

  console.log("🔔 [Mercado Pago Webhook] Recebido:", { action, id: data?.id });

  if (action === "payment.updated" || action === "payment.created" || req.query.topic === "payment") {
    const paymentId = data?.id || req.query.id;
    if (paymentId && accessToken) {
      try {
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { "Authorization": `Bearer ${accessToken}` }
        });
        const paymentData = await mpRes.json();
        
        if (paymentData.status === "approved" && paymentData.external_reference) {
          const orders = getOrders();
          const orderIndex = orders.findIndex((o: any) => String(o.id).replace(/^#/, "") === String(paymentData.external_reference).replace(/^#/, ""));
          
          if (orderIndex !== -1 && orders[orderIndex].status !== "PAGO") {
            orders[orderIndex].status = "PAGO";
            orders[orderIndex].paidAt = new Date().toISOString();
            saveOrders(orders);
            console.log(`✅ [Webhook] Pedido ${paymentData.external_reference} aprovado automaticamente via Pix!`);
          }
        }
      } catch (err) {
        console.error("Erro ao processar webhook do Mercado Pago:", err);
      }
    }
  }

  res.status(200).send("OK");
});

// Google Sheets Webhook - Recebe atualizações em tempo real vindas da planilha (Edição de células)
app.post("/api/webhooks/sheets", (req, res) => {
  const { id, status, customerName, whatsapp, studentName, paymentMethod, total } = req.body;
  
  if (!id) {
    return res.status(400).json({ error: "O campo 'id' é obrigatório para identificar o pedido." });
  }

  const orders = getOrders();
  const cleanId = String(id).replace(/^#/, "").trim();
  const index = orders.findIndex((o: any) => String(o.id).replace(/^#/, "").trim() === cleanId);

  if (index !== -1) {
    // Atualiza apenas os campos que forem enviados na requisição
    if (status) {
      orders[index].status = String(status).trim().toUpperCase();
    }
    if (customerName) {
      orders[index].customerName = String(customerName).trim();
    }
    if (whatsapp) {
      orders[index].whatsapp = String(whatsapp).trim();
    }
    if (paymentMethod) {
      orders[index].paymentMethod = String(paymentMethod).trim().toUpperCase();
    }
    if (total !== undefined) {
      const parsedTotal = parseFloat(String(total).replace(/[^\d.,]/g, "").replace(",", "."));
      if (!isNaN(parsedTotal)) {
        orders[index].total = parsedTotal;
      }
    }
    if (studentName) {
      const nameStr = String(studentName).trim();
      const match = nameStr.match(/^(.*?)\s*\((.*?)\)$/);
      if (match) {
        orders[index].studentName = match[1].trim();
        orders[index].studentTurma = match[2].trim();
      } else {
        orders[index].studentName = nameStr;
      }
    }

    saveOrders(orders);
    console.log(`[Google Sheets Webhook] Pedido #${id} atualizado localmente via Planilha!`);
    return res.json({ success: true, message: `Pedido #${id} atualizado com sucesso!` });
  }

  console.warn(`[Google Sheets Webhook] Pedido #${id} não encontrado para atualização.`);
  res.status(404).json({ error: `Pedido #${id} não encontrado.` });
});

// Notification simulation endpoint (Email & WhatsApp log)
app.post("/api/notify/send", async (req, res) => {
  const { orderId, type } = req.body;
  const orders = getOrders();
  const order = orders.find((o: any) => String(o.id).replace(/^#/, "") === String(orderId).replace(/^#/, ""));

  if (!order) return res.status(404).json({ error: "Pedido não encontrado" });

  const config = getConfig();
  let emailSent = false;
  let emailError = "";

  if (type === "email") {
    const isSmtpConfigured = config.smtpUser && config.smtpPass;
    if (isSmtpConfigured) {
      try {
        const transporter = nodemailer.createTransport({
          host: config.smtpHost,
          port: Number(config.smtpPort),
          secure: config.smtpSecure,
          auth: {
            user: config.smtpUser,
            pass: config.smtpPass
          }
        });

        const itemsHtml = order.items.map((i: any) => `
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 10px; font-weight: bold; color: #0d2149;">${i.quantity}x</td>
            <td style="padding: 10px; color: #333;">${i.name}</td>
            <td style="padding: 10px; text-align: right; font-family: monospace; color: #0d2149; font-weight: bold;">R$ ${(i.price * i.quantity).toFixed(2).replace(".", ",")}</td>
          </tr>
        `).join("");

        const statusLabel = order.status === "PAGO" ? "PAGO / CONFIRMADO" : "AGUARDANDO PAGAMENTO";
        const statusColor = order.status === "PAGO" ? "#10B981" : "#F59E0B";

        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #000; box-shadow: 5px 5px 0px #000; border-radius: 6px; overflow: hidden; background-color: #fff;">
            <div style="background-color: #0d2149; color: #fff; padding: 25px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px;">Colégio Água Viva</h1>
              <p style="margin: 5px 0 0 0; font-size: 14px; color: #67e8f9; text-transform: uppercase; font-weight: bold;">Campanha Pizza Solidária Handebol</p>
            </div>
            
            <div style="padding: 25px; color: #333; line-height: 1.6;">
              <h2 style="margin-top: 0; color: #0d2149;">Pedido Confirmado com Sucesso!</h2>
              <p>Olá, <strong>${order.customerName}</strong>! Obrigado por apoiar nossos atletas do time de Handebol <strong>HandVIDA</strong>. Sua ajuda é fundamental para que eles alcancem novas competições!</p>
              
              <div style="background-color: #f3f4f6; border-left: 4px solid #0d2149; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; font-size: 12px; color: #6b7280; font-weight: bold; text-transform: uppercase;">Código do Pedido</p>
                <p style="margin: 0; font-size: 22px; font-weight: bold; color: #0d2149;">${order.id}</p>
              </div>

              <div style="background-color: ${statusColor}; color: #fff; padding: 10px 15px; border-radius: 4px; font-weight: bold; text-align: center; margin-bottom: 25px;">
                Status do Pagamento: ${statusLabel}
              </div>

              <h3 style="border-bottom: 2px solid #0d2149; padding-bottom: 8px; color: #0d2149; margin-top: 30px;">Detalhes da Retirada</h3>
              <table style="width: 100%; margin-bottom: 25px;">
                <tr>
                  <td style="padding: 5px 0; font-weight: bold; width: 120px;">Data:</td>
                  <td style="padding: 5px 0;">21 de Agosto (Quinta-feira)</td>
                </tr>
                <tr>
                  <td style="padding: 5px 0; font-weight: bold;">Horário:</td>
                  <td style="padding: 5px 0;">Das 14h às 17h</td>
                </tr>
                <tr>
                  <td style="padding: 5px 0; font-weight: bold;">Local:</td>
                  <td style="padding: 5px 0;">Colégio Água Viva</td>
                </tr>
              </table>

              <h3 style="border-bottom: 2px solid #0d2149; padding-bottom: 8px; color: #0d2149;">Resumo do Pedido</h3>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                <thead>
                  <tr style="background-color: #f3f4f6; font-weight: bold; border-bottom: 2px solid #000;">
                    <th style="padding: 10px; text-align: left;">Qtd</th>
                    <th style="padding: 10px; text-align: left;">Item</th>
                    <th style="padding: 10px; text-align: right;">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                  <tr style="font-size: 16px; font-weight: bold;">
                    <td colspan="2" style="padding: 15px 10px; text-align: right;">Total Pago:</td>
                    <td style="padding: 15px 10px; text-align: right; color: #0d2149; font-family: monospace;">R$ ${order.total.toFixed(2).replace(".", ",")}</td>
                  </tr>
                </tbody>
              </table>

              ${order.status !== "PAGO" && order.paymentMethod === "PIX" ? `
                <div style="background-color: #fffbeb; border: 1px solid #fef3c7; padding: 15px; border-radius: 6px; margin: 25px 0;">
                  <strong style="color: #b45309; display: block; margin-bottom: 5px;">Aguardando Pagamento PIX</strong>
                  <p style="margin: 0; font-size: 13px; color: #78350f;">Se você ainda não realizou o pagamento, copie o código PIX Copia e Cola disponível no site para concluir a compra e validar seu pedido.</p>
                </div>
              ` : ""}

              <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #6b7280; text-align: center;">
                <p style="margin: 0;">Este é um e-mail automático enviado em nome do Colégio Água Viva.</p>
                <p style="margin: 5px 0 0 0;">Parceiro do time de Handebol HandVIDA. 100% da renda será revertida para o Colégio Água Viva.</p>
              </div>
            </div>
          </div>
        `;

        await transporter.sendMail({
          from: `"${config.emailNotifySender.split("@")[0]}" <${config.smtpUser}>`,
          to: order.email,
          subject: `🍕 Confirmação de Pedido ${order.id} - Pizza Solidária Handebol Água Viva`,
          html: emailHtml
        });
        emailSent = true;
      } catch (err: any) {
        console.error("Erro ao enviar e-mail via SMTP:", err);
        emailError = err.message;
      }
    } else {
      console.log("ℹ️ SMTP não está totalmente configurado. O e-mail simulado seria enviado para:", order.email);
    }
  }

  res.json({
    success: true,
    sentTo: type === "email" ? order.email : order.whatsapp,
    timestamp: new Date().toISOString(),
    realEmailSent: emailSent,
    smtpConfigured: !!(config.smtpUser && config.smtpPass),
    emailError: emailError || undefined,
    previewMessage: `Olá ${order.customerName}! Seu pedido ${order.id} foi confirmado com sucesso. Retirada em 21 de Agosto das 14h às 17h no Colégio Água Viva.`
  });
});

// Google Sheets configuration endpoints
app.get("/api/sheets/config", (req, res) => {
  res.json(getConfig());
});

app.post("/api/sheets/config", (req, res) => {
  const current = getConfig();
  const updated = { ...current, ...req.body };
  saveConfig(updated);
  res.json({ success: true, config: updated });
});

// Google Sheets sync / webhook trigger manually
app.post("/api/sheets/sync", async (req, res) => {
  const config = getConfig();
  const orders = getOrders();

  if (config.googleSheetsWebhookUrl) {
    try {
      await fetch(config.googleSheetsWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "FULL_SYNC", orders })
      });
      return res.json({ success: true, syncedCount: orders.length, destination: "Google Sheets Webhook URL" });
    } catch (err: any) {
      return res.status(500).json({ error: `Falha ao conectar com webhook: ${err.message}` });
    }
  }

  res.json({ 
    success: true, 
    syncedCount: orders.length, 
    destination: "Sincronização Interna Pronta",
    message: "Planilha interna atualizada. Configure uma URL de Apps Script / Webhook ou baixe o CSV diretamente."
  });
});

// Import orders from Google Sheets to override or merge local cache
app.post("/api/sheets/import", (req, res) => {
  try {
    const { orders } = req.body;
    if (!Array.isArray(orders)) {
      return res.status(400).json({ error: "Lista de pedidos inválida" });
    }
    saveOrders(orders);
    res.json({ success: true, count: orders.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Drive Backup Endpoint - Zips the site codebase and uploads to Google Drive using the active user's accessToken
app.post("/api/drive/backup", async (req, res) => {
  try {
    const config = getConfig();
    const authHeader = req.headers.authorization;
    let accessToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
    
    if (!accessToken) {
      accessToken = req.body.token || config.googleAccessToken;
    }

    if (!accessToken) {
      return res.status(401).json({ error: "Não autorizado. Conecte-se ao Google primeiro." });
    }

    const filePath = "/tmp/backup_pizza_solidaria.tar.gz";

    // Create tarball excluding node_modules, dist, and .git directories
    exec('tar -czf /tmp/backup_pizza_solidaria.tar.gz --exclude="node_modules" --exclude="dist" --exclude=".git" .', async (error, stdout, stderr) => {
      if (error) {
        console.error("Erro ao criar tarball de backup:", error);
        return res.status(500).json({ error: `Falha ao empacotar os arquivos: ${error.message}` });
      }

      try {
        if (!fs.existsSync(filePath)) {
          return res.status(500).json({ error: "Arquivo de backup não foi gerado pelo sistema." });
        }

        const fileBuffer = fs.readFileSync(filePath);
        const dateStr = new Date().toISOString().split("T")[0];
        const randomStr = Math.floor(1000 + Math.random() * 9000);
        const fileName = `backup_pizza_solidaria_${dateStr}_${randomStr}.tar.gz`;

        const boundary = "backup_multipart_boundary";
        const metadata = JSON.stringify({
          name: fileName,
          mimeType: "application/gzip",
          description: `Backup do código-fonte e banco de dados do site Pizza Solidária feito em ${new Date().toLocaleString("pt-BR")}`,
        });

        const metadataPart = [
          `--${boundary}\r\n`,
          "Content-Type: application/json; charset=UTF-8\r\n\r\n",
          `${metadata}\r\n`
        ].join("");

        const mediaPartHeader = [
          `--${boundary}\r\n`,
          "Content-Type: application/gzip\r\n\r\n"
        ].join("");

        const mediaPartFooter = `\r\n--${boundary}--`;

        const bodyBuffer = Buffer.concat([
          Buffer.from(metadataPart, "utf-8"),
          Buffer.from(mediaPartHeader, "utf-8"),
          fileBuffer,
          Buffer.from(mediaPartFooter, "utf-8")
        ]);

        const driveRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
            "Content-Length": String(bodyBuffer.length),
          },
          body: bodyBuffer,
        });

        // Safe cleanup of temporary file
        try {
          fs.unlinkSync(filePath);
        } catch (cleanupErr) {
          console.error("Erro ao limpar arquivo temporário:", cleanupErr);
        }

        if (!driveRes.ok) {
          const errText = await driveRes.text();
          console.error("Erro no upload para o Google Drive:", errText);
          return res.status(driveRes.status).json({ error: `Erro na API do Google Drive: ${errText}` });
        }

        const driveData = await driveRes.json();
        return res.json({ 
          success: true, 
          fileName, 
          fileId: driveData.id,
          message: "Backup criado e enviado ao Google Drive com sucesso!" 
        });
      } catch (err: any) {
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (e) {}
        }
        console.error("Erro no processamento do backup:", err);
        return res.status(500).json({ error: err.message });
      }
    });
  } catch (err: any) {
    console.error("Erro geral no endpoint de backup:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Admin Login checking against static list or live Google Sheets list
app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    }

    // Check against local users (this includes fallback users + any users saved locally)
    const localUsers = getUsers();
    const localMatch = localUsers.find(
      (u: any) => u.email.toLowerCase() === email.toLowerCase() && u.password === password && u.status === "Ativo"
    );

    if (localMatch) {
      return res.json({ success: true, user: { email: localMatch.email, name: localMatch.name } });
    }

    // If Google Sheets is integrated, try fetching from Google Sheets to authenticate
    const config = getConfig();
    if (config.googleSpreadsheetId && config.googleAccessToken) {
      try {
        const sheetsRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${config.googleSpreadsheetId}/values/Usuarios!A1:Z`,
          {
            headers: {
              Authorization: `Bearer ${config.googleAccessToken}`,
            },
          }
        );

        if (sheetsRes.ok) {
          const data = await sheetsRes.json();
          const values: string[][] = data.values;
          if (values && values.length > 1) {
            const headers = values[0];
            const rows = values.slice(1);

            const emailIdx = headers.indexOf("E-mail");
            const passIdx = headers.indexOf("Senha");
            const nameIdx = headers.indexOf("Nome");
            const statusIdx = headers.indexOf("Status");

            if (emailIdx !== -1 && passIdx !== -1) {
              const sheetMatch = rows.find((row) => {
                const uEmail = row[emailIdx] || "";
                const uPass = row[passIdx] || "";
                const uStatus = statusIdx !== -1 ? row[statusIdx] || "Ativo" : "Ativo";

                return (
                  uEmail.toLowerCase() === email.toLowerCase() &&
                  uPass === password &&
                  uStatus === "Ativo"
                );
              });

              if (sheetMatch) {
                const name = nameIdx !== -1 ? sheetMatch[nameIdx] || "Usuário" : "Usuário";
                return res.json({ success: true, user: { email, name } });
              }
            }
          }
        }
      } catch (sheetsErr) {
        console.error("Erro ao autenticar usando planilha Google Sheets:", sheetsErr);
      }
    }

    return res.status(401).json({ error: "E-mail ou senha incorretos." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch active users list from Google Sheets or fallback to defaults
app.get("/api/sheets/users", async (req, res) => {
  const config = getConfig();
  const localUsers = getUsers();

  if (!config.googleSpreadsheetId || !config.googleAccessToken || config.googleSpreadsheetId.includes("exemplo")) {
    return res.json({
      success: true,
      source: "local",
      users: localUsers
    });
  }

  try {
    const sheetsRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${config.googleSpreadsheetId}/values/Usuarios!A1:Z`,
      {
        headers: {
          Authorization: `Bearer ${config.googleAccessToken}`,
        },
      }
    );

    if (!sheetsRes.ok) {
      console.warn("Aba 'Usuarios' nao encontrada ou sem permissao no Sheets, retornando usuarios locais.");
      return res.json({ success: true, source: "local_fallback", users: localUsers });
    }

    const data = await sheetsRes.json();
    const values: string[][] = data.values;
    if (!values || values.length <= 1) {
      return res.json({ success: true, source: "google", users: localUsers });
    }

    const headers = values[0];
    const rows = values.slice(1);

    const emailIdx = headers.indexOf("E-mail");
    const passIdx = headers.indexOf("Senha");
    const nameIdx = headers.indexOf("Nome");
    const statusIdx = headers.indexOf("Status");

    const sheetUsers = rows.map((row, index) => ({
      email: emailIdx !== -1 && row[emailIdx] ? row[emailIdx] : "",
      password: passIdx !== -1 && row[passIdx] ? row[passIdx] : "",
      name: nameIdx !== -1 && row[nameIdx] ? row[nameIdx] : `Usuário ${index + 1}`,
      status: (statusIdx !== -1 && row[statusIdx] === "Inativo" ? "Inativo" : "Ativo") as "Ativo" | "Inativo"
    })).filter(u => u.email);

    // Merge Google Sheets users with local users, prioritizing Sheets
    const mergedMap = new Map<string, any>();
    for (const u of localUsers) {
      mergedMap.set(u.email.toLowerCase(), u);
    }
    for (const u of sheetUsers) {
      mergedMap.set(u.email.toLowerCase(), u);
    }
    const finalUsers = Array.from(mergedMap.values());
    
    // Save merged list locally to stay in sync
    saveUsers(finalUsers);

    res.json({ success: true, source: "google", users: finalUsers });
  } catch (err: any) {
    console.error("Erro ao obter dados do Google Sheets, usando padrao local:", err);
    res.json({ success: true, source: "local_fallback_error", users: localUsers });
  }
});

// Save/overwrite active users list to Google Sheets "Usuarios" sheet tab and local JSON
app.post("/api/sheets/users/save", async (req, res) => {
  const { users } = req.body;
  if (!Array.isArray(users)) {
    return res.status(400).json({ error: "Lista de usuários inválida." });
  }

  // Always save locally first so we have offline/local persistence
  saveUsers(users);

  const config = getConfig();
  if (!config.googleSpreadsheetId || !config.googleAccessToken || config.googleSpreadsheetId.includes("exemplo")) {
    // If sheets is not connected, it's fine! We successfully saved locally.
    return res.json({ success: true, message: "Usuários salvos localmente com sucesso!" });
  }

  try {
    const headers = ["E-mail", "Senha", "Nome", "Status"];
    const rows = users.map((u: any) => [
      u.email,
      u.password || "",
      u.name,
      u.status
    ]);

    const values = [headers, ...rows];

    const sheetsRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${config.googleSpreadsheetId}/values/Usuarios!A1?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${config.googleAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          range: "Usuarios!A1",
          majorDimension: "ROWS",
          values,
        }),
      }
    );

    if (!sheetsRes.ok) {
      const errText = await sheetsRes.text();
      throw new Error(`Erro na API Google Sheets: ${errText}`);
    }

    res.json({ success: true, message: "Usuários salvos com sucesso na planilha e localmente!" });
  } catch (err: any) {
    // Return success but warning that google sheets write failed
    res.json({ success: true, warning: `Salvo localmente, mas erro ao salvar no Google Sheets: ${err.message}` });
  }
});

// Google Sheets formatted CSV export
app.get("/api/sheets/export.csv", (req, res) => {
  const orders = getOrders();
  
  const headers = [
    "ID Pedido",
    "Data Hora",
    "Cliente",
    "Série/Turma",
    "Aluno Vendedor",
    "Itens Resumo",
    "Qtd Total Pizzas",
    "Valor Total (R$)",
    "Método Pagamento",
    "Status Pagamento",
    "WhatsApp",
    "E-mail"
  ];

  const rows = orders.map((o: any) => {
    const totalPizzas = o.items.reduce((sum: number, i: any) => sum + i.quantity, 0);
    const itemsText = o.items.map((i: any) => `${i.quantity}x ${i.name}`).join("; ");
    return [
      `"${o.id}"`,
      `"${new Date(o.createdAt).toLocaleString("pt-BR")}"`,
      `"${o.customerName}"`,
      `"${o.studentTurma}"`,
      `"${o.studentName}"`,
      `"${itemsText}"`,
      totalPizzas,
      o.total.toFixed(2).replace(".", ","),
      `"${o.paymentMethod}"`,
      `"${o.status}"`,
      `"${o.whatsapp}"`,
      `"${o.email}"`
    ].join(",");
  });

  const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="Planilha_Pizzas_Solidarias_Handebol.csv"');
  res.send(csvContent);
});

// Start Vite middleware or static serve
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor Pizza Solidária rodando em http://0.0.0.0:${PORT}`);
  });
}

if (!process.env.NETLIFY && !process.env.NETLIFY_DEV) {
  startServer();
}

export { app };
