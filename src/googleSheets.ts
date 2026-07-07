import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";
import { Order } from "./types";

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

  // 2. Preencher cabeçalhos e dados existentes
  await syncOrdersToSpreadsheet(accessToken, spreadsheetId, orders);

  return { spreadsheetId, spreadsheetUrl };
}

export async function syncOrdersToSpreadsheet(accessToken: string, spreadsheetId: string, orders: Order[]): Promise<number> {
  const headers = [
    "ID Pedido",
    "Data/Hora",
    "Nome Cliente",
    "WhatsApp",
    "Aluno / Turma Indicada",
    "Forma Pagamento",
    "Status Pedido",
    "Valor Total (R$)",
    "Itens Resumo"
  ];

  const rows = orders.map((o) => {
    const itensSummary = o.items
      .map((i) => `${i.quantity}x ${i.name}`)
      .join("; ");

    return [
      o.id,
      new Date(o.createdAt).toLocaleString("pt-BR"),
      o.customerName,
      o.whatsapp,
      `${o.studentName} (${o.studentTurma})`,
      o.paymentMethod,
      o.status,
      o.total.toFixed(2),
      itensSummary
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

  return orders.length;
}
