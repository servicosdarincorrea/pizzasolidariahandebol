import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";
import { Order, RestrictedUser } from "./types";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/spreadsheets");
provider.addScope("https://www.googleapis.com/auth/drive.file");

let cachedToken: string | null = null;

export async function connectGoogleSheets(): Promise<{ email: string | null; accessToken: string }> {
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential || !credential.accessToken) {
      throw new Error("Não foi possível obter o token de acesso do Google.");
    }
    cachedToken = credential.accessToken;
    return {
      email: result.user.email,
      accessToken: credential.accessToken,
    };
  } catch (err: any) {
    console.error("Erro no login do Google Sheets:", err);
    throw err;
  }
}

export function getCachedToken(): string | null {
  return cachedToken;
}

export async function createOrdersSpreadsheet(accessToken: string, orders: Order[]): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  // 1. Criar a planilha
  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        title: `Pedidos - Pizza Solidária Handebol Água Viva (${new Date().toLocaleDateString("pt-BR")})`,
      },
      sheets: [
        {
          properties: {
            title: "Pedidos",
          },
        },
        {
          properties: {
            title: "Usuarios",
          },
        },
      ],
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    console.error("Erro ao criar planilha:", errText);
    throw new Error("Falha ao criar planilha no Google Sheets. Verifique as permissões.");
  }

  const sheetData = await createRes.json();
  const spreadsheetId = sheetData.spreadsheetId;
  const spreadsheetUrl = sheetData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // 2. Preencher cabeçalhos e dados existentes de Pedidos
  await syncOrdersToSpreadsheet(accessToken, spreadsheetId, orders);

  // 3. Preencher cabeçalhos e dados de Usuários com padrão
  const defaultUsers: RestrictedUser[] = [
    { email: "servicosdarin@gmail.com", password: "handvida2026", name: "Administrador", status: "Ativo" },
    { email: "admin@handvida.org", password: "1234", name: "Suporte", status: "Ativo" }
  ];
  await syncUsersToSpreadsheet(accessToken, spreadsheetId, defaultUsers);

  return { spreadsheetId, spreadsheetUrl };
}

export async function syncOrdersToSpreadsheet(accessToken: string, spreadsheetId: string, orders: Order[], deletedIds: string[] = []): Promise<{ count: number; mergedOrders: Order[] }> {
  // 1. Recuperar os pedidos que já existem na planilha para fazer a mesclagem e evitar duplicados
  let existingOrders: Order[] = [];
  try {
    existingOrders = await getOrdersFromSpreadsheet(accessToken, spreadsheetId);
  } catch (err) {
    console.warn("Não foi possível recuperar os pedidos existentes para mesclagem, usando apenas dados locais:", err);
  }

  // Usar um Map para garantir que cada ID de pedido seja único (a chave é o ID do pedido)
  const mergedMap = new Map<string, Order>();

  // Normalizar IDs de exclusão para comparação robusta
  const cleanDeletedSet = new Set(deletedIds.map(id => String(id).replace(/^#/, "").trim().toLowerCase()));

  // Primeiro populamos com os pedidos que já estão na planilha
  for (const o of existingOrders) {
    if (o && o.id) {
      const cleanId = String(o.id).trim();
      const compareId = cleanId.replace(/^#/, "").toLowerCase();
      
      // Se este ID foi excluído pelo administrador, não adicionamos ele ao mapa
      if (cleanDeletedSet.has(compareId)) {
        continue;
      }

      if (cleanId) {
        mergedMap.set(cleanId, o);
      }
    }
  }

  // Depois mesclamos com os pedidos locais mais atualizados, levando todos os dados novos que não existem
  for (const o of orders) {
    if (o && o.id) {
      const cleanId = String(o.id).trim();
      if (cleanId) {
        const existing = mergedMap.get(cleanId);
        if (existing) {
          // Mescla inteligente: prioriza os campos locais do pedido mas preenche campos vazios com os da planilha
          mergedMap.set(cleanId, {
            ...existing, // Dados da planilha como base
            ...o,        // Sobrescreve com os dados locais mais recentes
            // Garante que não vamos perder campos aninhados ou strings caso um esteja nulo
            whatsapp: o.whatsapp || existing.whatsapp || "",
            email: o.email || existing.email || "",
            cpf: o.cpf || existing.cpf || "",
            items: o.items && o.items.length > 0 ? o.items : existing.items,
            studentName: o.studentName && o.studentName !== "Campanha Geral" ? o.studentName : existing.studentName || "Campanha Geral",
            studentTurma: o.studentTurma && o.studentTurma !== "Não informado" ? o.studentTurma : existing.studentTurma || "Não informado",
            createdAt: o.createdAt || existing.createdAt,
            paidAt: o.paidAt || existing.paidAt,
            pickupDate: o.pickupDate || existing.pickupDate,
            mpTransactionId: o.mpTransactionId || existing.mpTransactionId,
            pixCopyPaste: o.pixCopyPaste || existing.pixCopyPaste,
            qrCodeBase64: o.qrCodeBase64 || existing.qrCodeBase64,
            cardData: o.cardData || existing.cardData,
          });
        } else {
          mergedMap.set(cleanId, o);
        }
      }
    }
  }

  // REQUISITO: Se o pedido foi cancelado, remover da planilha
  for (const [id, o] of mergedMap.entries()) {
    if (o.status === "CANCELADO" || String(o.status).toUpperCase() === "CANCELADO") {
      mergedMap.delete(id);
    }
  }

  // Obter a lista final única de pedidos
  const finalOrders = Array.from(mergedMap.values());

  // Ordenar os pedidos de acordo com o número do pedido (ID numérico) para manter a planilha organizada
  finalOrders.sort((a, b) => {
    const numA = parseInt(String(a.id).replace(/\D/g, "")) || 0;
    const numB = parseInt(String(b.id).replace(/\D/g, "")) || 0;
    return numA - numB;
  });

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

  const rows = finalOrders.map((o) => {
    const itensSummary = o.items
      .map((i) => `${i.quantity}x ${i.name}`)
      .join("; ");

    return [
      String(o.id).replace(/^#/, ""),
      o.createdAt ? new Date(o.createdAt).toISOString() : new Date().toISOString(),
      o.customerName,
      o.whatsapp || "",
      `${o.studentName} (${o.studentTurma})`,
      o.paymentMethod,
      o.status,
      o.total ? Number(o.total).toFixed(2) : "0.00",
      itensSummary,
      o.email || "",
      o.cpf || "",
      JSON.stringify(o.items)
    ];
  });

  const values = [headers, ...rows];

  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Pedidos!A1?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        range: "Pedidos!A1",
        majorDimension: "ROWS",
        values,
      }),
    }
  );

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    console.error("Erro ao atualizar planilha:", errText);
    throw new Error("Falha ao salvar dados na planilha do Google Sheets.");
  }

  return {
    count: finalOrders.length,
    mergedOrders: finalOrders
  };
}

export async function getOrdersFromSpreadsheet(accessToken: string, spreadsheetId: string): Promise<Order[]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Pedidos!A1:Z`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error("Erro ao recuperar planilha:", errText);
    throw new Error("Falha ao recuperar dados da planilha do Google Sheets. Verifique se o ID está correto.");
  }

  const data = await res.json();
  const values: string[][] = data.values;
  if (!values || values.length <= 1) {
    return [];
  }

  const headers = values[0];
  const rows = values.slice(1);

  // Encontrar os índices de cada coluna
  const idIdx = headers.indexOf("ID Pedido");
  const dateIdx = headers.indexOf("Data/Hora");
  const nameIdx = headers.indexOf("Nome Cliente");
  const waIdx = headers.indexOf("WhatsApp");
  const studentIdx = headers.indexOf("Aluno / Turma Indicada");
  const payIdx = headers.indexOf("Forma Pagamento");
  const statusIdx = headers.indexOf("Status Pedido");
  const totalIdx = headers.indexOf("Valor Total (R$)");
  const itemsSummaryIdx = headers.indexOf("Itens Resumo");
  const emailIdx = headers.indexOf("E-mail");
  const cpfIdx = headers.indexOf("CPF");
  const itemsJsonIdx = headers.indexOf("Itens JSON");

  return rows.map((row, index) => {
    const id = (idIdx !== -1 && row[idIdx] ? row[idIdx] : String(1001 + index)).replace(/^#/, "");
    const createdAt = dateIdx !== -1 && row[dateIdx] ? row[dateIdx] : new Date().toISOString();
    const customerName = nameIdx !== -1 && row[nameIdx] ? row[nameIdx] : "Cliente Sem Nome";
    const whatsapp = waIdx !== -1 && row[waIdx] ? row[waIdx] : "";
    const email = emailIdx !== -1 && row[emailIdx] ? row[emailIdx] : "";
    const cpf = cpfIdx !== -1 && row[cpfIdx] ? row[cpfIdx] : "";

    // Parse do aluno indicado e turma
    const studentCell = studentIdx !== -1 && row[studentIdx] ? row[studentIdx] : "";
    let studentName = "Campanha Geral";
    let studentTurma = "Não informado";
    if (studentCell.includes("(")) {
      const parts = studentCell.split("(");
      studentName = parts[0].trim();
      studentTurma = parts[1].replace(")", "").trim();
    } else {
      studentName = studentCell || "Campanha Geral";
    }

    const paymentMethod = (payIdx !== -1 && row[payIdx] === "CARTAO" ? "CARTAO" : "PIX") as "PIX" | "CARTAO";
    const status = (statusIdx !== -1 && row[statusIdx] ? row[statusIdx] : "AGUARDANDO_PAGAMENTO") as any;
    const total = totalIdx !== -1 && row[totalIdx] ? parseFloat(String(row[totalIdx]).replace(",", ".")) || 0 : 0;

    // Parse dos itens
    let items: any[] = [];
    if (itemsJsonIdx !== -1 && row[itemsJsonIdx]) {
      try {
        items = JSON.parse(row[itemsJsonIdx]);
      } catch (e) {
        items = [];
      }
    }

    if (items.length === 0 && itemsSummaryIdx !== -1 && row[itemsSummaryIdx]) {
      // Reconstrução de fallback a partir do resumo textual
      const summary = row[itemsSummaryIdx];
      const parts = summary.split(";");
      items = parts.map((part) => {
        const itemMatch = part.trim().match(/^(\d+)x\s+(.+)$/);
        if (itemMatch) {
          return {
            name: itemMatch[2],
            quantity: parseInt(itemMatch[1]),
            price: 0.05, // valor padrão de fallback
          };
        }
        return {
          name: part.trim(),
          quantity: 1,
          price: 0.05,
        };
      });
    }

    return {
      id,
      createdAt,
      customerName,
      whatsapp,
      email,
      cpf,
      studentName,
      studentTurma,
      paymentMethod,
      status,
      total,
      items,
      pickupDate: "21 de Agosto das 14h às 17h",
    };
  });
}

export async function syncUsersToSpreadsheet(accessToken: string, spreadsheetId: string, users: RestrictedUser[]): Promise<number> {
  const headers = ["E-mail", "Senha", "Nome", "Status"];
  const rows = users.map((u) => [
    u.email,
    u.password || "",
    u.name,
    u.status
  ]);

  const values = [headers, ...rows];

  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Usuarios!A1?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        range: "Usuarios!A1",
        majorDimension: "ROWS",
        values,
      }),
    }
  );

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    console.error("Erro ao sincronizar usuários:", errText);
    throw new Error("Falha ao salvar usuários na planilha do Google Sheets.");
  }

  return users.length;
}

export async function getUsersFromSpreadsheet(accessToken: string, spreadsheetId: string): Promise<RestrictedUser[]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Usuarios!A1:Z`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error("Erro ao recuperar usuários da planilha:", errText);
    return [];
  }

  const data = await res.json();
  const values: string[][] = data.values;
  if (!values || values.length <= 1) {
    return [];
  }

  const headers = values[0];
  const rows = values.slice(1);

  const emailIdx = headers.indexOf("E-mail");
  const passIdx = headers.indexOf("Senha");
  const nameIdx = headers.indexOf("Nome");
  const statusIdx = headers.indexOf("Status");

  return rows
    .map((row, index) => {
      return {
        email: emailIdx !== -1 && row[emailIdx] ? row[emailIdx] : "",
        password: passIdx !== -1 && row[passIdx] ? row[passIdx] : "",
        name: nameIdx !== -1 && row[nameIdx] ? row[nameIdx] : `Usuário ${index + 1}`,
        status: (statusIdx !== -1 && row[statusIdx] === "Inativo" ? "Inativo" : "Ativo") as "Ativo" | "Inativo",
      };
    })
    .filter((u) => u.email);
}
