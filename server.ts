import express from "express";
import path from "path";
import fs from "fs";
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
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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
      return JSON.parse(data);
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

// Helper to load/save integration config
function getConfig() {
  const defaults = {
    googleSheetsWebhookUrl: "",
    googleSpreadsheetId: "1-exemplo-planilha-solidaria-handebol-2026",
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
      return { ...defaults, ...saved };
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
        const matchId = oId === queryGeneral || oId === `#${queryGeneral}`;
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

    return res.json({ orders: filtered });
  }

  res.json({ orders });
});

// Get single order by ID
app.get("/api/orders/:id", (req, res) => {
  const orders = getOrders();
  const orderId = req.params.id.startsWith("#") ? req.params.id : `#${req.params.id}`;
  const order = orders.find((o: any) => o.id === orderId || o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ error: "Pedido não encontrado" });
  }
  res.json({ order });
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
    const orderId = `#${nextNum}`;
    
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
      pixCopyPaste: pixString
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

    res.status(201).json({ order: newOrder });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update order status (Admin or Payment confirmation)
app.patch("/api/orders/:id/status", (req, res) => {
  const orders = getOrders();
  const orderId = req.params.id.startsWith("#") ? req.params.id : `#${req.params.id}`;
  const index = orders.findIndex((o: any) => o.id === orderId || o.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: "Pedido não encontrado" });
  }

  const { status } = req.body;
  orders[index].status = status;
  saveOrders(orders);

  res.json({ order: orders[index] });
});

// Delete all orders (Admin cleanup)
app.delete("/api/orders", (req, res) => {
  saveOrders([]);
  res.json({ success: true, message: "Todos os pedidos foram removidos com sucesso." });
});

// Delete single order by ID
app.delete("/api/orders/:id", (req, res) => {
  const orders = getOrders();
  const orderId = req.params.id.startsWith("#") ? req.params.id : `#${req.params.id}`;
  const filtered = orders.filter((o: any) => o.id !== orderId && o.id !== req.params.id);
  saveOrders(filtered);
  res.json({ success: true });
});

// Simulate instant PIX approval (Great for user verification and demo!)
app.post("/api/payment/simulate-pix-approval/:id", (req, res) => {
  const orders = getOrders();
  const orderId = req.params.id.startsWith("#") ? req.params.id : `#${req.params.id}`;
  const index = orders.findIndex((o: any) => o.id === orderId || o.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: "Pedido não encontrado" });
  }

  const order = orders[index];
  order.status = "PAGO";
  order.paidAt = new Date().toISOString();
  saveOrders(orders);

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
          const orderIndex = orders.findIndex((o: any) => o.id === paymentData.external_reference);
          
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

// Notification simulation endpoint (Email & WhatsApp log)
app.post("/api/notify/send", async (req, res) => {
  const { orderId, type } = req.body;
  const orders = getOrders();
  const order = orders.find((o: any) => o.id === orderId);

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
              <p>Olá, <strong>${order.customerName}</strong>! Obrigado por apoiar nossos atletas do time de Handebol <strong>HandVida</strong>. Sua ajuda é fundamental para que eles alcancem novas competições!</p>
              
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
                <p style="margin: 5px 0 0 0;">Parceiro do time de Handebol HandVida. 100% da renda será revertida.</p>
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

startServer();
