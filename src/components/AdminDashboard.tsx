import React, { useState, useEffect, useRef } from "react";
import { Order, IntegrationConfig, RestrictedUser } from "../types";
import { connectGoogleSheets, createOrdersSpreadsheet, syncOrdersToSpreadsheet, getOrdersFromSpreadsheet } from "../googleSheets";
import { 
  Lock, Key, RefreshCw, Download, FileSpreadsheet, CheckCircle, 
  Clock, Search, DollarSign, ShoppingBag, Users, ExternalLink, 
  Mail, MessageCircle, Sliders, ShieldAlert, ArrowLeft, Trash2,
  HelpCircle, Copy, Check, Code, HardDrive
} from "lucide-react";

interface AdminDashboardProps {
  onBack: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const [authenticated, setAuthenticated] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [activeTab, setActiveTab] = useState<"ORDERS" | "SHEETS" | "MERCADOPAGO" | "EMAIL" | "USERS">("ORDERS");

  // State for restricted users retrieved from Google Sheets
  const [restrictedUsers, setRestrictedUsers] = useState<RestrictedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [savingUsers, setSavingUsers] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");

  const [config, setConfig] = useState<IntegrationConfig>({
    googleSheetsWebhookUrl: "https://script.google.com/macros/s/AKfycbws83fNFaGtVROVKu8Rf9Oy0IuBt4wggFTLno2i0mKKI3zwoaLwGr-bdbG1N1DzZhfO/exec",
    googleSpreadsheetId: "1kpdpXdw--duOxjuw61EoAQS30FG_uYJeyhc-cy7Eny0",
    autoSyncEnabled: true,
    mercadoPagoAccessToken: "APP_USR-sandbox-test-key",
    mercadoPagoPublicKey: "TEST-pub-key-123",
    emailNotifySender: "notificacoes@handvida-aguaviva.com.br",
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: "",
    smtpPass: "",
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [showScriptGuide, setShowScriptGuide] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  const [googleEmail, setGoogleEmail] = useState<string | null>(() => localStorage.getItem("av_google_email"));
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [linkSheetInput, setLinkSheetInput] = useState("");
  const [linkingSheet, setLinkingSheet] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [createdSheetInfo, setCreatedSheetInfo] = useState<{ spreadsheetId: string; spreadsheetUrl: string } | null>(() => {
    const saved = localStorage.getItem("av_google_sheet_info");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.spreadsheetId && parsed.spreadsheetId !== "1-exemplo-planilha-solidaria-handebol-2026") {
          return parsed;
        }
      } catch (e) {}
    }
    return {
      spreadsheetId: "1kpdpXdw--duOxjuw61EoAQS30FG_uYJeyhc-cy7Eny0",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1kpdpXdw--duOxjuw61EoAQS30FG_uYJeyhc-cy7Eny0/edit"
    };
  });

  const [showCreateConfirm, setShowCreateConfirm] = useState(false);
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);
  const [showRetrieveConfirm, setShowRetrieveConfirm] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupResult, setBackupResult] = useState<{ success: boolean; fileName?: string; fileId?: string; error?: string } | null>(null);
  const [showBackupConfirm, setShowBackupConfirm] = useState(false);

  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState(true);
  const [lastAutoSyncTime, setLastAutoSyncTime] = useState<Date | null>(null);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [autoSyncCountdown, setAutoSyncCountdown] = useState(60);

  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [clearSecretCode, setClearSecretCode] = useState("");
  const [clearSecretError, setClearSecretError] = useState("");

  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [deletedOrderIds, setDeletedOrderIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("av_deleted_order_ids");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const deletedOrderIdsRef = useRef(deletedOrderIds);
  useEffect(() => {
    deletedOrderIdsRef.current = deletedOrderIds;
  }, [deletedOrderIds]);

  const siteUrlBase = typeof window !== "undefined" ? window.location.origin : "https://seusite.com";
  const appsScriptCode = `function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    
    // Garantir que a planilha tenha cabeçalhos se estiver vazia
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
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
      ]);
    }
    
    // Sincronização em lote (quando clica em Forçar Sincronização)
    if (data.action === "FULL_SYNC" && Array.isArray(data.orders)) {
      sheet.clearContents();
      sheet.appendRow([
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
      ]);
      data.orders.forEach(function(o) {
        var itensSummary = "";
        if (Array.isArray(o.items)) {
          itensSummary = o.items.map(function(i) { return i.quantity + "x " + i.name; }).join("; ");
        }
        sheet.appendRow([
          o.id,
          o.createdAt,
          o.customerName,
          o.whatsapp || "",
          o.studentName + " (" + o.studentTurma + ")",
          o.paymentMethod,
          o.status,
          o.total,
          itensSummary,
          o.email || "",
          o.cpf || "",
          JSON.stringify(o.items || [])
        ]);
      });
      return ContentService.createTextOutput(JSON.stringify({ status: "success", count: data.orders.length }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Novo pedido recebido em tempo real
    var itensSummary = "";
    if (Array.isArray(data.items)) {
      itensSummary = data.items.map(function(i) { return i.quantity + "x " + i.name; }).join("; ");
    }
    sheet.appendRow([
      data.id,
      data.createdAt,
      data.customerName,
      data.whatsapp || "",
      data.studentName + " (" + data.studentTurma + ")",
      data.paymentMethod,
      data.status,
      data.total,
      itensSummary,
      data.email || "",
      data.cpf || "",
      JSON.stringify(data.items || [])
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 🚀 ENVIAR ATUALIZAÇÕES DA PLANILHA PARA O SITE EM TEMPO REAL!
// Quando você alterar qualquer célula na planilha (ex: mudar Status de "PENDENTE" para "PAGO"),
// este gatilho enviará automaticamente a atualização de volta para o site!
//
// COMO CONFIGURAR:
// 1. No painel do Google Apps Script (onde colou este código), clique no ícone de Relógio (Gatilhos / Triggers) no menu esquerdo.
// 2. Clique no botão azul "+ Adicionar Gatilho" (canto inferior direito).
// 3. Em "Escolha a função para executar", selecione: onEditTrigger
// 4. Em "Selecione a origem do evento", escolha: Da planilha (From spreadsheet)
// 5. Em "Selecione o tipo de evento", escolha: Ao editar (On edit)
// 6. Clique em Salvar e conceda permissões se solicitado.
function onEditTrigger(e) {
  try {
    var range = e.range;
    var sheet = range.getSheet();
    var row = range.getRow();
    
    // Ignorar edições no cabeçalho (linha 1)
    if (row <= 1) return;
    
    // ID do Pedido está na coluna A (Coluna 1)
    var orderId = sheet.getRange(row, 1).getValue();
    if (!orderId) return;
    
    var numCols = sheet.getLastColumn();
    var rowValues = sheet.getRange(row, 1, 1, numCols).getValues()[0];
    
    var payload = {
      id: orderId,
      createdAt: rowValues[1],
      customerName: rowValues[2],
      whatsapp: rowValues[3],
      studentName: rowValues[4], // Aluno/Turma
      paymentMethod: rowValues[5],
      status: rowValues[6],
      total: rowValues[7]
    };
    
    var siteUrl = "${siteUrlBase}/api/webhooks/sheets";
    
    var options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "Accept": "application/json"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    var response = UrlFetchApp.fetch(siteUrl, options);
    Logger.log("Resposta do site: " + response.getContentText());
  } catch (err) {
    Logger.log("Erro no gatilho onEditTrigger: " + err.toString());
  }
}
`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(appsScriptCode);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 3000);
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders?t=${Date.now()}`);
      const data = await res.json();
      if (data.orders) setOrders(data.orders);
    } catch (e) {
      console.error("Erro ao carregar pedidos:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/sheets/config");
      const data = await res.json();
      if (data) {
        setConfig(data);
        if (data.googleAccessToken) {
          setGoogleToken(data.googleAccessToken);
        }
        if (data.googleEmail) {
          setGoogleEmail(data.googleEmail);
          localStorage.setItem("av_google_email", data.googleEmail);
        }
        if (data.googleSpreadsheetId && !data.googleSpreadsheetId.includes("exemplo")) {
          const info = {
            spreadsheetId: data.googleSpreadsheetId,
            spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${data.googleSpreadsheetId}/edit`
          };
          setCreatedSheetInfo(info);
          localStorage.setItem("av_google_sheet_info", JSON.stringify(info));
        }
      }
    } catch (e) {}
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/sheets/users");
      const data = await res.json();
      if (data.users) setRestrictedUsers(data.users);
    } catch (err) {
      console.error("Erro ao carregar usuários:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleSaveUsers = async (updatedUsers: RestrictedUser[]) => {
    setSavingUsers(true);
    try {
      const res = await fetch("/api/sheets/users/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users: updatedUsers })
      });
      const data = await res.json();
      if (res.ok) {
        setRestrictedUsers(updatedUsers);
        alert("Lista de usuários atualizada com sucesso na planilha Google Sheets!");
        // Auto synchronization of users
        await fetchUsers();
      } else {
        alert("Erro ao salvar usuários: " + data.error);
      }
    } catch (err) {
      alert("Falha de conexão ao salvar usuários.");
    } finally {
      setSavingUsers(false);
    }
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword || !newUserName) {
      alert("Por favor, preencha todos os campos do usuário.");
      return;
    }
    const userExists = restrictedUsers.some(u => u.email.toLowerCase() === newUserEmail.toLowerCase());
    if (userExists) {
      alert("Este e-mail de usuário já está cadastrado.");
      return;
    }

    const updated = [
      ...restrictedUsers,
      { email: newUserEmail.trim(), password: newUserPassword, name: newUserName.trim(), status: "Ativo" as const }
    ];
    handleSaveUsers(updated);
    setNewUserEmail("");
    setNewUserName("");
    setNewUserPassword("");
  };

  const handleToggleUserStatus = (emailToToggle: string) => {
    const updated = restrictedUsers.map(u => {
      if (u.email === emailToToggle) {
        return { ...u, status: u.status === "Ativo" ? "Inativo" as const : "Ativo" as const };
      }
      return u;
    });
    handleSaveUsers(updated);
  };

  const handleDeleteUser = (emailToDelete: string) => {
    setUserToDelete(emailToDelete);
  };

  const executeDeleteUser = (emailToDelete: string) => {
    const updated = restrictedUsers.filter(u => u.email !== emailToDelete);
    handleSaveUsers(updated);
    setUserToDelete(null);
  };

  useEffect(() => {
    if (authenticated) {
      fetchOrders();
      fetchConfig();
      fetchUsers();
      // Auto-poll orders every 15 seconds for real-time monitoring
      const interval = setInterval(fetchOrders, 15000);
      return () => clearInterval(interval);
    }
  }, [authenticated]);

  // Refs to always access the latest values inside the interval without restarting it
  const ordersRef = useRef(orders);
  const googleTokenRef = useRef(googleToken);
  const createdSheetInfoRef = useRef(createdSheetInfo);
  const isAutoSyncEnabledRef = useRef(isAutoSyncEnabled);
  const isAutoSyncingRef = useRef(isAutoSyncing);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    googleTokenRef.current = googleToken;
  }, [googleToken]);

  useEffect(() => {
    createdSheetInfoRef.current = createdSheetInfo;
  }, [createdSheetInfo]);

  useEffect(() => {
    isAutoSyncEnabledRef.current = isAutoSyncEnabled;
  }, [isAutoSyncEnabled]);

  useEffect(() => {
    isAutoSyncingRef.current = isAutoSyncing;
  }, [isAutoSyncing]);

  // Automatic sync countdown and sync interval (every 60 seconds)
  useEffect(() => {
    if (!authenticated) return;

    const interval = setInterval(() => {
      // If we don't have sheet info or token, or auto-sync is disabled, pause and reset countdown
      if (
        !googleTokenRef.current ||
        !createdSheetInfoRef.current ||
        !isAutoSyncEnabledRef.current
      ) {
        setAutoSyncCountdown(60);
        return;
      }

      if (isAutoSyncingRef.current) {
        return;
      }

      setAutoSyncCountdown((prev) => {
        if (prev <= 1) {
          // Trigger the sync!
          (async () => {
            setIsAutoSyncing(true);
            try {
              const result = await syncOrdersToSpreadsheet(
                googleTokenRef.current!,
                createdSheetInfoRef.current!.spreadsheetId,
                ordersRef.current,
                deletedOrderIdsRef.current
              );

              // Duplicidades verificadas com ID como chave. Sincroniza dados novos de volta para o banco de dados local.
              const finalLocalMap = new Map<string, Order>();
              for (const o of result.mergedOrders) {
                finalLocalMap.set(o.id, o);
              }
              // Preserva os pedidos cancelados localmente (removidos da planilha, mantidos na base local)
              for (const o of ordersRef.current) {
                if (o.status === "CANCELADO" || String(o.status).toUpperCase() === "CANCELADO") {
                  finalLocalMap.set(o.id, o);
                } else {
                  const existing = finalLocalMap.get(o.id);
                  if (existing) {
                    finalLocalMap.set(o.id, { ...existing, ...o });
                  } else {
                    finalLocalMap.set(o.id, o);
                  }
                }
              }
              const updatedLocalOrders = Array.from(finalLocalMap.values());
              
              try {
                const saveRes = await fetch("/api/sheets/import", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ orders: updatedLocalOrders })
                });
                if (saveRes.ok) {
                  setOrders(updatedLocalOrders);
                }
              } catch (e) {
                console.error("Erro ao atualizar base de dados local com pedidos sincronizados:", e);
              }

              setLastAutoSyncTime(new Date());
              setSheetError(null);
            } catch (err: any) {
              console.error("Erro na sincronização automática de 60s:", err);
              // Set a non-intrusive warning on the sheets integration screen
              setSheetError(`Erro na sincronização automática: ${err.message || err}`);
            } finally {
              setIsAutoSyncing(false);
            }
          })();
          return 60; // Reset countdown
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [authenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !password) {
      setError("Preencha o e-mail e a senha.");
      return;
    }
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAuthenticated(true);
        setError("");
      } else {
        setError(data.error || "E-mail ou senha incorretos.");
      }
    } catch (err) {
      setError("Falha ao se conectar com o servidor.");
    }
  };

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchOrders();
      }
    } catch (e) {}
  };

  const handleDeleteOrder = (orderId: string) => {
    setOrderToDelete(orderId);
  };

  const executeDeleteOrder = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { method: "DELETE" });
      if (res.ok) {
        // Salva o ID deletado para evitar que ele ressuscite na sincronização futura com a planilha
        const updatedDeleted = [...deletedOrderIds, orderId];
        setDeletedOrderIds(updatedDeleted);
        localStorage.setItem("av_deleted_order_ids", JSON.stringify(updatedDeleted));

        // Atualiza a lista de pedidos localmente
        await fetchOrders();

        // REQUISITO: "se o pedido for excluído, executar a atualização da planilha."
        if (googleToken && createdSheetInfo) {
          try {
            const updatedOrders = orders.filter(o => o.id !== orderId);
            await syncOrdersToSpreadsheet(googleToken, createdSheetInfo.spreadsheetId, updatedOrders, updatedDeleted);
          } catch (syncErr) {
            console.error("Erro ao sincronizar exclusão com Google Sheets:", syncErr);
          }
        }
      }
    } catch (e) {
      console.error("Erro ao excluir pedido:", e);
    } finally {
      setOrderToDelete(null);
    }
  };

  const handleClearAllOrders = () => {
    setClearSecretCode("");
    setClearSecretError("");
    setShowClearConfirmModal(true);
  };

  const handleConfirmClearSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    if (clearSecretCode.trim().toLowerCase() !== "x256803x") {
      setClearSecretError("Código secreto incorreto! A exclusão foi cancelada.");
      return;
    }
    try {
      const res = await fetch("/api/orders", { method: "DELETE" });
      if (res.ok) {
        setShowClearConfirmModal(false);
        setClearSecretCode("");
        setClearSecretError("");
        fetchOrders();
      }
    } catch (e) {}
  };

  const handleManualSync = async () => {
    setSyncStatus("Sincronizando...");
    try {
      const res = await fetch("/api/sheets/sync", { method: "POST" });
      const data = await res.json();
      setSyncStatus(`✅ ${data.syncedCount} pedidos sincronizados! (${data.destination})`);
      setTimeout(() => setSyncStatus(""), 4000);
    } catch (e) {
      setSyncStatus("❌ Erro na sincronização.");
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await fetch("/api/sheets/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      alert("Configurações salvas com sucesso!");
    } catch (e) {}
    setSavingConfig(false);
  };

  const handleConnectGoogle = async () => {
    try {
      setSyncStatus("Conectando com o Google...");
      const { email, accessToken } = await connectGoogleSheets();
      if (email) {
        setGoogleEmail(email);
        localStorage.setItem("av_google_email", email);
      }
      setGoogleToken(accessToken);

      // Save token to server config so server-side can also auto sync in real-time
      try {
        await fetch("/api/sheets/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...config, googleAccessToken: accessToken, googleEmail: email || "" })
        });
        setConfig(prev => ({ ...prev, googleAccessToken: accessToken, googleEmail: email || "" }));
      } catch (tokenErr) {
        console.error("Erro ao enviar token para o servidor:", tokenErr);
      }

      setSyncStatus(`✅ Google Conectado (${email || "Autenticado"})!`);
      fetchUsers();
      setTimeout(() => setSyncStatus(""), 4000);
    } catch (err: any) {
      console.error(err);
      const isPopupBlocked = err?.code === "auth/popup-blocked" || String(err).includes("popup");
      if (isPopupBlocked) {
        alert(
          "O pop-up de login foi bloqueado pelo seu navegador!\n\n" +
          "Como este aplicativo está rodando dentro de uma pré-visualização (iframe), o navegador restringe janelas pop-up por segurança.\n\n" +
          "Solução:\n" +
          "1. Clique no botão de expandir (ícone com seta saindo de um quadrado) no canto superior direito para abrir o aplicativo em uma NOVA ABA.\n" +
          "2. Lá na nova aba, tente conectar novamente e funcionará perfeitamente!"
        );
      } else {
        alert(
          "Erro na conexão com o Google: " + (err?.message || err) + "\n\n" +
          "Dica: Abra o aplicativo em uma NOVA ABA clicando no botão do canto superior direito do painel para evitar restrições de iframe."
        );
      }
      setSyncStatus("");
    }
  };

  const handleBackupToGoogleDrive = async (bypassConfirm = false) => {
    if (!googleToken) {
      setSheetError("Por favor, clique em 'Conectar Google Sheets' primeiro para autenticar!");
      return;
    }
    if (bypassConfirm !== true) {
      setShowBackupConfirm(true);
      return;
    }
    setShowBackupConfirm(false);
    setBackupResult(null);
    setIsBackingUp(true);
    setSyncStatus("Preparando backup e compactando arquivos...");

    try {
      const res = await fetch("/api/drive/backup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${googleToken}`
        }
      });

      let data: any = {};
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        // Extract title or body from HTML if possible
        const titleMatch = text.match(/<title>(.*?)<\/title>/i);
        const errorMsg = titleMatch ? titleMatch[1] : "Erro de servidor (HTML retornado)";
        throw new Error(`${errorMsg} (${res.status})`);
      }

      if (!res.ok) {
        throw new Error(data.error || "Erro desconhecido ao processar backup.");
      }

      setBackupResult({
        success: true,
        fileName: data.fileName,
        fileId: data.fileId
      });
      setSyncStatus("🎉 Backup enviado ao Google Drive com sucesso!");
    } catch (err: any) {
      console.error(err);
      setBackupResult({
        success: false,
        error: err.message || "Erro na conexão com o servidor."
      });
      setSyncStatus("❌ Falha ao enviar o backup.");
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleCreateGoogleSheet = async (bypassConfirm = false) => {
    if (!googleToken) {
      setSheetError("Por favor, clique em 'Conectar Google Sheets' primeiro para autenticar!");
      return;
    }
    if (bypassConfirm !== true) {
      setShowCreateConfirm(true);
      return;
    }
    setShowCreateConfirm(false);
    setSheetError(null);
    setCreatingSheet(true);
    setSyncStatus("Criando planilha no seu Google Drive...");
    try {
      const info = await createOrdersSpreadsheet(googleToken, orders);
      setCreatedSheetInfo(info);
      localStorage.setItem("av_google_sheet_info", JSON.stringify(info));

      // Save spreadsheet ID and token to server config too!
      try {
        await fetch("/api/sheets/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...config, googleSpreadsheetId: info.spreadsheetId, googleAccessToken: googleToken })
        });
        setConfig(prev => ({ ...prev, googleSpreadsheetId: info.spreadsheetId, googleAccessToken: googleToken }));
      } catch (confErr) {}

      setSyncStatus("🎉 Planilha Criada e Sincronizada no seu Google Sheets!");
      fetchUsers();
    } catch (err: any) {
      console.error(err);
      setSheetError("Erro ao criar planilha: " + (err.message || err));
      setSyncStatus("❌ Erro ao criar planilha no Google.");
    } finally {
      setCreatingSheet(false);
    }
  };

  const handleLinkExistingSheet = async (inputIdOrUrl: string) => {
    if (!googleToken) {
      setSheetError("Por favor, clique em 'Conectar Google Sheets' primeiro para autenticar!");
      return;
    }
    if (!inputIdOrUrl) {
      setSheetError("Por favor, insira o ID ou URL da planilha!");
      return;
    }

    // Extrair ID da URL se necessário
    let id = inputIdOrUrl.trim();
    if (id.includes("docs.google.com/spreadsheets")) {
      const match = id.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match) {
        id = match[1];
      }
    }

    if (!id) {
      setSheetError("ID da planilha inválido ou não detectado na URL.");
      return;
    }

    setSheetError(null);
    setLinkingSheet(true);
    setSyncStatus("Vinculando planilha existente...");
    try {
      // 1. Tenta recuperar os pedidos da planilha para validar se temos acesso e se ela é válida
      const importedOrders = await getOrdersFromSpreadsheet(googleToken, id);
      
      const info = {
        spreadsheetId: id,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${id}/edit`
      };
      
      setCreatedSheetInfo(info);
      localStorage.setItem("av_google_sheet_info", JSON.stringify(info));

      // 2. Salva o ID da planilha e o token nas configurações do servidor
      try {
        await fetch("/api/sheets/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...config, googleSpreadsheetId: id, googleAccessToken: googleToken })
        });
        setConfig(prev => ({ ...prev, googleSpreadsheetId: id, googleAccessToken: googleToken }));
      } catch (confErr) {}

      // 3. Sincroniza
      setSyncStatus(`🎉 Planilha vinculada com sucesso! Recuperados ${importedOrders.length} pedidos.`);
      
      // Se houver pedidos importados, atualiza a lista local
      if (importedOrders.length > 0) {
        try {
          const saveRes = await fetch("/api/sheets/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orders: importedOrders })
          });
          if (saveRes.ok) {
            await fetchOrders();
          }
        } catch (importErr) {}
      }
      
      fetchUsers();
      setLinkSheetInput("");
      setShowLinkInput(false);
    } catch (err: any) {
      console.error(err);
      setSheetError("Erro ao vincular planilha: " + (err.message || "Certifique-se de que a conta Google conectada tem acesso à planilha com esse ID/URL e que a aba 'Pedidos' existe."));
      setSyncStatus("❌ Falha ao vincular planilha existente.");
    } finally {
      setLinkingSheet(false);
    }
  };

  const handleSyncToDirectSheet = async (bypassConfirm = false) => {
    if (!googleToken || !createdSheetInfo) {
      setSheetError("Você precisa autenticar no Google e ter uma planilha criada!");
      return;
    }
    if (bypassConfirm !== true) {
      setShowSyncConfirm(true);
      return;
    }
    setShowSyncConfirm(false);
    setSheetError(null);
    setSyncStatus("Sincronizando com a Planilha Oficial...");
    try {
      const result = await syncOrdersToSpreadsheet(googleToken, createdSheetInfo.spreadsheetId, orders, deletedOrderIds);
      
      // Duplicidades verificadas com ID como chave. Sincroniza dados novos de volta para o banco de dados local.
      const finalLocalMap = new Map<string, Order>();
      for (const o of result.mergedOrders) {
        finalLocalMap.set(o.id, o);
      }
      // Preserva os pedidos cancelados localmente (removidos da planilha, mantidos na base local)
      for (const o of orders) {
        if (o.status === "CANCELADO" || String(o.status).toUpperCase() === "CANCELADO") {
          finalLocalMap.set(o.id, o);
        } else {
          const existing = finalLocalMap.get(o.id);
          if (existing) {
            finalLocalMap.set(o.id, { ...existing, ...o });
          } else {
            finalLocalMap.set(o.id, o);
          }
        }
      }
      const updatedLocalOrders = Array.from(finalLocalMap.values());
      
      try {
        const saveRes = await fetch("/api/sheets/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orders: updatedLocalOrders })
        });
        if (saveRes.ok) {
          setOrders(updatedLocalOrders);
        }
      } catch (e) {
        console.error("Erro ao atualizar base de dados local na sincronização forçada:", e);
      }

      setSyncStatus(`✅ ${result.count} pedidos sincronizados no seu Google Sheets (duplicidades e cancelados processados)!`);
      setTimeout(() => setSyncStatus(""), 4000);
    } catch (err: any) {
      console.error(err);
      setSheetError("Erro na sincronização: " + (err.message || err));
      setSyncStatus("❌ Falha na sincronização.");
    }
  };

  const handleRetrieveFromSheet = async (bypassConfirm = false) => {
    if (!googleToken || !createdSheetInfo) {
      setSheetError("Você precisa autenticar no Google e ter uma planilha criada primeiro!");
      return;
    }
    if (bypassConfirm !== true) {
      setShowRetrieveConfirm(true);
      return;
    }
    setShowRetrieveConfirm(false);
    setSheetError(null);
    setSyncStatus("Recuperando dados da planilha...");
    try {
      const importedOrders = await getOrdersFromSpreadsheet(googleToken, createdSheetInfo.spreadsheetId);
      
      // Send imported orders to backend to save them as the official database
      const res = await fetch("/api/sheets/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: importedOrders })
      });
      
      if (res.ok) {
        setOrders(importedOrders);
        setSyncStatus(`✅ ${importedOrders.length} pedidos recuperados da planilha com sucesso!`);
      } else {
        throw new Error("Erro ao salvar os pedidos recuperados no servidor.");
      }
      setTimeout(() => setSyncStatus(""), 4000);
    } catch (err: any) {
      console.error(err);
      setSheetError("Erro ao recuperar pedidos da planilha: " + (err.message || err));
      setSyncStatus("❌ Falha ao recuperar dados da planilha.");
    }
  };

  const filteredOrders = orders
    .filter((o) => {
      const matchesSearch = 
        o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.cpf && o.cpf.toLowerCase().includes(searchQuery.toLowerCase())) ||
        o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.studentTurma.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "ALL" || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const numA = parseInt(String(a.id).replace(/\D/g, "")) || 0;
      const numB = parseInt(String(b.id).replace(/\D/g, "")) || 0;
      return numA - numB;
    });

  const totalArrecadado = orders
    .filter((o) => o.status === "PAGO")
    .reduce((sum, o) => sum + Number(o.total || 0), 0);

  const totalPizzasVendidas = orders
    .filter((o) => o.status === "PAGO")
    .reduce((sum, o) => sum + o.items.reduce((iSum, i) => iSum + Number(i.quantity || 0), 0), 0);

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto pt-16 pb-32 px-4">
        <div className="bg-white border-brutal shadow-brutal p-8 rounded text-center">
          <div className="w-16 h-16 bg-primary-deep text-white rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-black">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="font-display font-black text-2xl uppercase tracking-tight text-black mb-2">
            Área Restrita
          </h1>
          <p className="text-gray-600 font-sans text-sm mb-6">
            Digite a senha de administrador para acompanhar os pedidos em tempo real e gerenciar integrações.
          </p>

          <form onSubmit={handleLogin} className="space-y-4 text-left">
            <div>
              <label className="block font-mono font-bold text-xs text-gray-700 mb-1">
                E-MAIL DO ADMINISTRADOR
              </label>
              <input
                type="email"
                placeholder="exemplo@gmail.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full px-4 py-3 border-2 border-black font-mono text-xs focus:outline-none focus:bg-cyan-50/50 shadow-brutal-sm"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block font-mono font-bold text-xs text-gray-700 mb-1">
                SENHA DE ACESSO
              </label>
              <input
                type="password"
                placeholder="Digite sua senha..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border-2 border-black font-mono text-xs focus:outline-none focus:bg-cyan-50/50 shadow-brutal-sm"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-tertiary-red text-tertiary-red p-2.5 rounded font-mono text-xs font-bold text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-secondary-cyan text-black py-3.5 rounded font-mono font-bold text-sm uppercase tracking-wider border-2 border-black shadow-brutal-sm hover:bg-secondary-cyan/90 transition-all"
            >
              ACESSAR PAINEL
            </button>
          </form>

          <button
            onClick={onBack}
            className="mt-6 font-mono text-xs text-gray-500 hover:text-black flex items-center justify-center gap-1 mx-auto"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar para o catálogo</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pt-6 pb-32 px-4">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-primary-deep text-white p-5 rounded border-2 border-black shadow-brutal mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-tertiary-red text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-black uppercase">
              Área Restrita
            </span>
            <span className="text-secondary-cyan font-mono text-xs">● TEMPO REAL ATIVO</span>
          </div>
          <h1 className="font-display font-black text-2xl sm:text-3xl uppercase tracking-tight">
            Painel de Pedidos - Handebol Água Viva
          </h1>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            onClick={fetchOrders}
            className="bg-white text-black px-3.5 py-2 rounded font-mono text-xs font-bold border-2 border-black shadow-brutal-sm flex items-center gap-1.5 hover:bg-gray-100 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span>Atualizar</span>
          </button>
          <button
            onClick={onBack}
            className="bg-secondary-cyan text-black px-4 py-2 rounded font-mono text-xs font-bold border-2 border-black shadow-brutal-sm hover:bg-secondary-cyan/90 transition-all"
          >
            Sair do Painel
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
        <div className="bg-white border-2 border-black shadow-brutal p-5 rounded">
          <div className="flex items-center justify-between text-gray-500 mb-2 font-mono text-xs font-bold uppercase">
            <span>TOTAL ARRECADADO (PAGOS)</span>
            <DollarSign className="w-5 h-5 text-green-600" />
          </div>
          <div className="font-display font-black text-3xl text-primary-deep">
            R$ {totalArrecadado.toFixed(2).replace(".", ",")}
          </div>
        </div>

        <div className="bg-white border-2 border-black shadow-brutal p-5 rounded">
          <div className="flex items-center justify-between text-gray-500 mb-2 font-mono text-xs font-bold uppercase">
            <span>PIZZAS VENDIDAS (PAGAS)</span>
            <ShoppingBag className="w-5 h-5 text-secondary-cyan" />
          </div>
          <div className="font-display font-black text-3xl text-black">
            {totalPizzasVendidas} <span className="text-sm font-sans font-normal text-gray-500">unid.</span>
          </div>
        </div>

        <div className="bg-white border-2 border-black shadow-brutal p-5 rounded">
          <div className="flex items-center justify-between text-gray-500 mb-2 font-mono text-xs font-bold uppercase">
            <span>TOTAL DE PEDIDOS</span>
            <Users className="w-5 h-5 text-primary-deep" />
          </div>
          <div className="font-display font-black text-3xl text-black">
            {orders.length} <span className="text-sm font-sans font-normal text-gray-500">pedidos</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b-2 border-black mb-6 gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab("ORDERS")}
          className={`px-5 py-2 rounded-t font-mono font-bold text-xs uppercase border-2 border-b-0 transition-all flex items-center gap-2 ${
            activeTab === "ORDERS"
              ? "bg-black text-white border-black"
              : "bg-white text-black border-black hover:bg-gray-100"
          }`}
        >
          <ShoppingBag className="w-4 h-4 text-secondary-cyan" />
          <span>PEDIDOS EM TEMPO REAL ({orders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("SHEETS")}
          className={`px-5 py-2 rounded-t font-mono font-bold text-xs uppercase border-2 border-b-0 transition-all flex items-center gap-2 ${
            activeTab === "SHEETS"
              ? "bg-black text-white border-black"
              : "bg-white text-black border-black hover:bg-gray-100"
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-green-400" />
          <span>API GOOGLE SHEETS</span>
        </button>

        <button
          onClick={() => setActiveTab("MERCADOPAGO")}
          className={`px-5 py-2 rounded-t font-mono font-bold text-xs uppercase border-2 border-b-0 transition-all flex items-center gap-2 ${
            activeTab === "MERCADOPAGO"
              ? "bg-black text-white border-black"
              : "bg-white text-black border-black hover:bg-gray-100"
          }`}
        >
          <Sliders className="w-4 h-4 text-secondary-cyan" />
          <span>MERCADO PAGO</span>
        </button>

        <button
          onClick={() => setActiveTab("EMAIL")}
          className={`px-5 py-2 rounded-t font-mono font-bold text-xs uppercase border-2 border-b-0 transition-all flex items-center gap-2 ${
            activeTab === "EMAIL"
              ? "bg-black text-white border-black"
              : "bg-white text-black border-black hover:bg-gray-100"
          }`}
        >
          <Mail className="w-4 h-4 text-primary-deep" />
          <span>CONFIGURAÇÃO DE E-MAIL</span>
        </button>

        <button
          onClick={() => setActiveTab("USERS")}
          className={`px-5 py-2 rounded-t font-mono font-bold text-xs uppercase border-2 border-b-0 transition-all flex items-center gap-2 ${
            activeTab === "USERS"
              ? "bg-black text-white border-black"
              : "bg-white text-black border-black hover:bg-gray-100"
          }`}
        >
          <Users className="w-4 h-4 text-secondary-cyan" />
          <span>USUÁRIOS DE ACESSO</span>
        </button>
      </div>

      {/* TAB 1: ORDERS TABLE */}
      {activeTab === "ORDERS" && (
        <div className="space-y-6">
          {/* Quick filter & Export bar */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between bg-white border-2 border-black p-4 rounded shadow-brutal">
            <div className="flex-1 flex items-center gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Buscar por cliente, aluno, ID ou turma..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border-2 border-black rounded font-sans text-sm focus:outline-none focus:bg-white shadow-brutal-sm"
                />
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-gray-500" />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-white border-2 border-black rounded font-mono text-xs font-bold shadow-brutal-sm focus:outline-none"
              >
                <option value="ALL">TODOS OS STATUS</option>
                <option value="PAGO">✅ PAGO</option>
                <option value="AGUARDANDO_PAGAMENTO">⏳ AGUARDANDO</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {orders.length > 0 && (
                <button
                  onClick={handleClearAllOrders}
                  className="bg-red-600 text-white px-3.5 py-2 rounded font-mono font-bold text-xs uppercase border-2 border-black shadow-brutal-sm hover:bg-red-700 transition-all flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>LIMPAR TODOS OS PEDIDOS</span>
                </button>
              )}
              <a
                href="/api/sheets/export.csv"
                download
                className="bg-green-600 text-white px-4 py-2 rounded font-mono font-bold text-xs uppercase border-2 border-black shadow-brutal-sm hover:bg-green-700 transition-all flex items-center gap-1.5 whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>BAIXAR PLANILHA (.CSV)</span>
              </a>
            </div>
          </div>

          {/* Orders List */}
          <div className="bg-white border-2 border-black rounded shadow-brutal overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-b-2 border-black font-mono text-xs font-bold uppercase text-gray-700">
                    <th className="p-3.5 border-r border-black">ID / Data</th>
                    <th className="p-3.5 border-r border-black">Cliente / Contato</th>
                    <th className="p-3.5 border-r border-black">Aluno / Turma</th>
                    <th className="p-3.5 border-r border-black">Itens do Pedido</th>
                    <th className="p-3.5 border-r border-black">Total</th>
                    <th className="p-3.5 border-r border-black">Pagamento</th>
                    <th className="p-3.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black font-sans text-sm">
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-cyan-50/30 transition-colors">
                      <td className="p-3.5 border-r border-black whitespace-nowrap">
                        <span className="font-display font-black text-black block">{order.id}</span>
                        <span className="font-mono text-[11px] text-gray-500">
                          {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </td>

                      <td className="p-3.5 border-r border-black">
                        <span className="font-bold text-black block">{order.customerName}</span>
                        {order.cpf && <span className="font-mono text-[11px] text-gray-500 block">CPF: {order.cpf}</span>}
                        <span className="font-mono text-xs text-gray-600 block">{order.whatsapp}</span>
                      </td>

                      <td className="p-3.5 border-r border-black">
                        <span className="font-bold text-primary-deep block">{order.studentName}</span>
                        <span className="font-mono text-xs text-gray-500 block">{order.studentTurma}</span>
                      </td>

                      <td className="p-3.5 border-r border-black max-w-xs">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="text-xs">
                            <strong className="font-mono">{item.quantity}x</strong> {item.name}
                          </div>
                        ))}
                      </td>

                      <td className="p-3.5 border-r border-black font-mono font-bold text-primary-deep whitespace-nowrap">
                        R$ {order.total.toFixed(2).replace(".", ",")}
                      </td>

                      <td className="p-3.5 border-r border-black whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded font-mono text-[11px] font-bold border border-black block text-center mb-1 ${
                            order.status === "PAGO"
                              ? "bg-green-500 text-white"
                              : "bg-amber-300 text-black"
                          }`}
                        >
                          {order.status === "PAGO" ? "✅ PAGO" : "⏳ AGUARDANDO"}
                        </span>
                        <span className="font-mono text-[10px] text-gray-500 block text-center uppercase">
                          {order.paymentMethod === "CARTAO" && order.cardData?.cardType
                            ? `CARTÃO (${order.cardData.cardType})`
                            : order.paymentMethod}
                        </span>
                      </td>

                      <td className="p-3.5 text-center whitespace-nowrap space-x-1.5">
                        {order.status !== "PAGO" ? (
                          <button
                            onClick={() => handleUpdateStatus(order.id, "PAGO")}
                            title="Confirmar Pagamento MANUALMENTE"
                            className="bg-green-500 text-white px-2 py-1 rounded font-mono text-[11px] font-bold border border-black shadow-sm hover:bg-green-600 transition-colors"
                          >
                            ✔ APROVAR
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUpdateStatus(order.id, "AGUARDANDO_PAGAMENTO")}
                            title="Marcar como pendente"
                            className="bg-gray-200 text-black px-2 py-1 rounded font-mono text-[10px] border border-black hover:bg-gray-300 transition-colors"
                          >
                            REVERTER
                          </button>
                        )}

                        <button
                          onClick={() => {
                            const text = encodeURIComponent(
                              `Olá ${order.customerName}! Confirmamos o recebimento do seu pedido ${order.id}. Retirada em 21 de agosto das 14h às 17h no Colégio Água Viva! 🍕🤾‍♂️`
                            );
                            window.open(`https://api.whatsapp.com/send?phone=55${order.whatsapp.replace(/\D/g, "")}&text=${text}`, "_blank");
                          }}
                          className="bg-green-600 text-white p-1.5 rounded border border-black inline-flex items-center justify-center hover:bg-green-700"
                          title="Enviar confirmação por WhatsApp"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>

                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch("/api/notify/send", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ orderId: order.id, type: "email" })
                              });
                              if (res.ok) {
                                alert("📧 E-mail de confirmação enviado com sucesso!");
                              } else {
                                alert("❌ Erro ao enviar e-mail. Certifique-se de que o SMTP está configurado nas configurações de e-mail.");
                              }
                            } catch (e) {
                              alert("❌ Erro de rede ao enviar e-mail.");
                            }
                          }}
                          className="bg-primary-deep text-white p-1.5 rounded border border-black inline-flex items-center justify-center hover:bg-primary-deep/90"
                          title="Enviar comprovante por E-mail"
                        >
                          <Mail className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDeleteOrder(order.id)}
                          title="Excluir Pedido"
                          className="bg-red-500 text-white p-1.5 rounded border border-black inline-flex items-center justify-center hover:bg-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GOOGLE SHEETS API INTEGRATION */}
      {activeTab === "SHEETS" && (
        <div className="bg-white border-2 border-black p-6 rounded shadow-brutal max-w-3xl space-y-6">
          <div className="flex items-center gap-3 border-b-2 border-black pb-4">
            <FileSpreadsheet className="w-8 h-8 text-green-600" />
            <div>
              <h2 className="font-display font-black text-xl text-black">
                INTEGRAÇÃO COM GOOGLE SHEETS
              </h2>
              <p className="text-xs text-gray-600 font-sans">
                Os dados são exportados automaticamente em tempo real para planilha ou via arquivo CSV compatível.
              </p>
            </div>
          </div>

          {/* INTEGRAÇÃO DIRETA COM GOOGLE SHEETS (OAUTH OFICIAL) */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-black p-5 rounded shadow-brutal space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="bg-green-700 text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded uppercase border border-black inline-block mb-1">
                  ✨ NOVO: Criação Direta no Google Drive
                </span>
                <h3 className="font-display font-black text-lg text-black">
                  Crie e Sincronize com 1 Clique no seu Google Sheets
                </h3>
                <p className="text-xs text-gray-700 mt-1">
                  Autentique com sua conta Google e clique no botão para gerar uma planilha completa com todos os {orders.length} pedidos.
                </p>
              </div>
            </div>

            {!googleToken ? (
              <div className="bg-white border-2 border-black p-4 rounded flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-gray-700 space-y-1">
                  <strong className="block text-black font-bold">Autenticação Oficial Google OAuth</strong>
                  <span>Permissão segura para criar e gerenciar a planilha integrada do projeto.</span>
                  <div className="bg-blue-50 border border-blue-300 p-2 rounded text-[11px] text-blue-900 mt-2">
                    <strong>✨ ATENÇÃO:</strong> As permissões oficiais de Planilhas e Drive foram ativadas com sucesso! Se você já estava logado antes, clique em "Conectar Google Sheets" para obter as novas credenciais atualizadas.
                  </div>
                  <span className="block mt-1 text-[11px] text-amber-700 font-semibold">
                    ⚠️ Importante: Se o login não abrir, certifique-se de usar o botão "Abrir em uma Nova Aba" (no topo direito da tela) para evitar o bloqueio de pop-ups do iframe.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleConnectGoogle}
                  className="bg-white hover:bg-gray-50 text-gray-800 font-medium px-4 py-2.5 rounded border-2 border-black shadow-brutal-sm flex items-center gap-2.5 transition-all text-xs whitespace-nowrap"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.1 8.9 5 12 5z"/>
                    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"/>
                    <path fill="#FBBC05" d="M5.3 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.6 7.4C.6 9.4 0 11.6 0 14c0 2.4.6 4.6 1.6 6.6l3.7-2.8z"/>
                    <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5.2L1.6 16C3.5 19.8 7.4 23 12 23z"/>
                  </svg>
                  <span className="font-bold">Conectar Google Sheets</span>
                </button>
              </div>
            ) : (
              <div className="bg-white border-2 border-black p-4 rounded space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-gray-200 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
                    <span className="font-mono text-xs font-bold text-gray-800">
                      Conectado como: <span className="text-green-700">{googleEmail || "Sua Conta Google"}</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      setGoogleToken(null);
                      setGoogleEmail(null);
                      localStorage.removeItem("av_google_email");
                      try {
                        await fetch("/api/sheets/config", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ ...config, googleAccessToken: "", googleEmail: "" })
                        });
                        setConfig(prev => ({ ...prev, googleAccessToken: "", googleEmail: "" }));
                      } catch (e) {}
                    }}
                    className="text-[11px] font-mono text-red-600 underline hover:text-red-800"
                  >
                    Desconectar conta (Para renovar permissões)
                  </button>
                </div>
                <div className="bg-blue-50 border border-blue-300 p-3 rounded text-xs text-blue-900 font-sans">
                  <strong>💡 IMPORTANTE:</strong> Se você se conectou antes da ativação das novas permissões do Google Drive, clique em <strong>"Desconectar conta"</strong> acima e conecte-se novamente para atualizar as credenciais! Isso garante o acesso total para criar e salvar a planilha.
                </div>

                {/* Painel de Sincronização Automática */}
                <div className="bg-slate-50 border-2 border-black p-4 rounded space-y-3 shadow-brutal-sm">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Clock className={`w-5 h-5 ${isAutoSyncing ? "text-green-600 animate-spin" : "text-slate-700"}`} />
                      <div>
                        <strong className="block text-xs font-bold uppercase tracking-wider text-slate-800">
                          Sincronização Automática (1 Minuto)
                        </strong>
                        <span className="text-[11px] text-gray-500 font-mono">
                          {!createdSheetInfo 
                            ? "Aguardando criação da planilha..." 
                            : !isAutoSyncEnabled 
                            ? "Pausado temporariamente" 
                            : isAutoSyncing 
                            ? "Sincronizando dados agora..." 
                            : `Próxima atualização em: ${autoSyncCountdown}s`
                          }
                        </span>
                      </div>
                    </div>
                    {createdSheetInfo && (
                      <button
                        type="button"
                        onClick={() => setIsAutoSyncEnabled(!isAutoSyncEnabled)}
                        className={`font-mono text-xs font-bold px-3 py-1.5 rounded border-2 border-black shadow-brutal-xs transition-all ${
                          isAutoSyncEnabled 
                            ? "bg-green-500 hover:bg-green-600 text-black" 
                            : "bg-amber-400 hover:bg-amber-500 text-black"
                        }`}
                      >
                        {isAutoSyncEnabled ? "🟢 ATIVA" : "🟡 PAUSADA"}
                      </button>
                    )}
                  </div>
                  
                  {lastAutoSyncTime && (
                    <div className="text-[10px] font-mono text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                      <span>
                        Sincronizado automaticamente às {lastAutoSyncTime.toLocaleTimeString()} com sucesso! ({orders.length} pedidos)
                      </span>
                    </div>
                  )}
                </div>

                {sheetError && (
                  <div className="bg-red-50 border border-red-300 p-3 rounded text-xs text-red-900 font-sans space-y-1">
                    <strong className="block text-red-700 font-bold">⚠️ Erro na Operação do Google Sheets:</strong>
                    <p className="font-mono text-[11px] leading-relaxed break-all bg-white/50 p-2 rounded border border-red-100">{sheetError}</p>
                    <button 
                      onClick={() => setSheetError(null)} 
                      className="text-[11px] underline hover:text-red-700 block mt-1 font-semibold"
                    >
                      Ignorar / Fechar Aviso
                    </button>
                  </div>
                )}

                {showCreateConfirm && (
                  <div className="bg-amber-50 border-2 border-black p-4 rounded space-y-3 shadow-sm">
                    <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase">
                      <HelpCircle className="w-5 h-5 text-amber-600" />
                      <span>Confirmar Criação de Planilha?</span>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">
                      Isso criará uma nova planilha chamada <strong className="text-black">"Pedidos - Pizza Solidária Handebol Água Viva"</strong> no seu Google Drive e preencherá com todos os pedidos atuais ({orders.length} pedidos).
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleCreateGoogleSheet(true)}
                        className="bg-green-600 hover:bg-green-700 text-white font-mono font-bold text-xs px-4 py-2 rounded border-2 border-black shadow-sm"
                      >
                        Sim, Criar Planilha
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCreateConfirm(false)}
                        className="bg-white hover:bg-gray-100 text-black font-mono text-xs px-4 py-2 rounded border border-black"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {showSyncConfirm && (
                  <div className="bg-amber-50 border-2 border-black p-4 rounded space-y-3 shadow-sm">
                    <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase">
                      <HelpCircle className="w-5 h-5 text-amber-600" />
                      <span>Confirmar Sincronização?</span>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">
                      Isso atualizará a planilha atual do Google com os <strong className="text-black">{orders.length} pedidos atuais</strong>. Atenção: isso sobrescreverá os dados existentes na aba "Pedidos".
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleSyncToDirectSheet(true)}
                        className="bg-green-600 hover:bg-green-700 text-white font-mono font-bold text-xs px-4 py-2 rounded border-2 border-black shadow-sm"
                      >
                        Sim, Sincronizar
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowSyncConfirm(false)}
                        className="bg-white hover:bg-gray-100 text-black font-mono text-xs px-4 py-2 rounded border border-black"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {showRetrieveConfirm && (
                  <div className="bg-amber-50 border-2 border-black p-4 rounded space-y-3 shadow-sm">
                    <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase">
                      <HelpCircle className="w-5 h-5 text-amber-600" />
                      <span>Importar dados da Planilha?</span>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">
                      <strong className="text-red-700">⚠️ ATENÇÃO:</strong> Isso substituirá TODOS os pedidos locais do aplicativo pelos pedidos que estão gravados na aba "Pedidos" da sua planilha do Google. Esta ação é irreversível.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleRetrieveFromSheet(true)}
                        className="bg-cyan-600 hover:bg-cyan-700 text-white font-mono font-bold text-xs px-4 py-2 rounded border-2 border-black shadow-sm"
                      >
                        Sim, Importar e Substituir
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRetrieveConfirm(false)}
                        className="bg-white hover:bg-gray-100 text-black font-mono text-xs px-4 py-2 rounded border border-black"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {showBackupConfirm && (
                  <div className="bg-amber-50 border-2 border-black p-4 rounded space-y-3 shadow-sm">
                    <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase">
                      <HelpCircle className="w-5 h-5 text-amber-600" />
                      <span>Confirmar Backup para Google Drive?</span>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">
                      Isso criará uma cópia de segurança completa de todos os arquivos de código-fonte e banco de dados do site (compactados em formato <strong className="text-black">.tar.gz</strong>) e fará o upload diretamente para a sua conta do Google Drive.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleBackupToGoogleDrive(true)}
                        className="bg-green-600 hover:bg-green-700 text-white font-mono font-bold text-xs px-4 py-2 rounded border-2 border-black shadow-sm"
                      >
                        Sim, Fazer Backup
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowBackupConfirm(false)}
                        className="bg-white hover:bg-gray-100 text-black font-mono text-xs px-4 py-2 rounded border border-black"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {backupResult && (
                  <div className={`border-2 border-black p-4 rounded space-y-2 shadow-sm ${backupResult.success ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>
                    <div className="flex items-center gap-2 font-bold text-xs uppercase">
                      {backupResult.success ? <CheckCircle className="w-5 h-5 text-green-600" /> : <ShieldAlert className="w-5 h-5 text-red-600" />}
                      <span>{backupResult.success ? "Backup Concluído!" : "Erro ao Fazer Backup"}</span>
                    </div>
                    {backupResult.success ? (
                      <div className="text-xs space-y-1">
                        <p>O backup do seu site foi enviado com sucesso para o seu Google Drive.</p>
                        <p className="font-mono text-[11px] bg-white/50 p-2 rounded border border-green-100 leading-relaxed">
                          <strong>Arquivo:</strong> {backupResult.fileName}<br/>
                          <strong>ID no Drive:</strong> {backupResult.fileId}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs font-mono text-[11px] bg-white/50 p-2 rounded border border-red-100 leading-relaxed">{backupResult.error}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => setBackupResult(null)}
                      className="text-[11px] underline font-semibold mt-1 block"
                    >
                      Fechar Aviso
                    </button>
                  </div>
                )}

                {!showCreateConfirm && !showSyncConfirm && !showRetrieveConfirm && !showBackupConfirm && (
                  <>
                    {!createdSheetInfo ? (
                      <div className="space-y-4">
                        <div className="text-center py-3 bg-green-50/50 rounded border border-green-200 p-4 space-y-3">
                          <p className="text-xs text-gray-700">
                            Clique abaixo para gerar automaticamente a planilha oficial no seu Google Drive com todos os pedidos gravados.
                          </p>
                          <button
                            type="button"
                            disabled={creatingSheet}
                            onClick={() => handleCreateGoogleSheet()}
                            className="bg-green-600 hover:bg-green-700 text-white font-mono font-bold text-xs uppercase px-6 py-3 rounded border-2 border-black shadow-brutal-sm flex items-center justify-center gap-2 mx-auto transition-all disabled:opacity-50"
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                            <span>{creatingSheet ? "Criando Planilha no Google Drive..." : "🚀 Criar Planilha de Pedidos no Meu Google Sheets"}</span>
                          </button>
                        </div>

                        <div className="border-t border-dashed border-gray-300 my-2 pt-2"></div>

                        <div className="bg-cyan-50/50 border border-cyan-200 p-4 rounded space-y-3 text-left">
                          <div className="text-xs text-cyan-900 font-bold flex items-center gap-1.5 uppercase font-mono">
                            <span>🔗 Vincular Planilha do Google Existente</span>
                          </div>
                          <p className="text-xs text-gray-700 leading-relaxed">
                            Se você já possui uma planilha criada antes (ou se o servidor reiniciou), cole o link dela ou o ID abaixo para conectá-la e restaurar seus dados (pedidos e usuários) de forma 100% integrada!
                          </p>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              placeholder="Cole o link completo da Planilha ou o ID"
                              value={linkSheetInput}
                              onChange={(e) => setLinkSheetInput(e.target.value)}
                              className="flex-1 px-3 py-2 border-2 border-black font-mono text-xs focus:outline-none focus:bg-white text-black"
                            />
                            <button
                              type="button"
                              disabled={linkingSheet}
                              onClick={() => handleLinkExistingSheet(linkSheetInput)}
                              className="bg-cyan-600 hover:bg-cyan-700 text-white font-mono font-bold text-xs px-4 py-2 rounded border border-black shadow-sm disabled:opacity-50 whitespace-nowrap"
                            >
                              {linkingSheet ? "Vinculando..." : "Vincular Planilha"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-green-100 border-2 border-green-700 p-4 rounded space-y-3 text-left">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-green-900 font-display font-bold text-sm">
                            <CheckCircle className="w-5 h-5 text-green-700" />
                            <span>Planilha Oficial Criada e Pronta!</span>
                          </div>
                          <a
                            href={createdSheetInfo.spreadsheetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-white text-green-800 font-mono font-bold text-xs px-3 py-1.5 rounded border border-black hover:bg-green-50 flex items-center gap-1 shadow-sm"
                          >
                            <span>Abrir Planilha no Google</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        <p className="text-[11px] font-mono text-green-800 break-all">
                          ID: {createdSheetInfo.spreadsheetId}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleSyncToDirectSheet()}
                            className="bg-green-700 hover:bg-green-800 text-white font-mono font-bold text-xs px-4 py-2 rounded border border-black flex items-center gap-1.5 shadow-sm"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Sincronizar Pedidos Agora ({orders.length})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRetrieveFromSheet()}
                            className="bg-cyan-600 hover:bg-cyan-700 text-white font-mono font-bold text-xs px-4 py-2 rounded border border-black flex items-center gap-1.5 shadow-sm"
                            title="Recuperar e importar os pedidos da planilha Google Sheets como seu banco de dados principal"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Recuperar Dados da Planilha</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCreateGoogleSheet()}
                            className="bg-white hover:bg-gray-100 text-black font-mono text-xs px-3 py-2 rounded border border-black"
                          >
                            Criar Nova Planilha Separada
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowLinkInput(!showLinkInput)}
                            className="bg-slate-200 hover:bg-slate-300 text-black font-mono text-xs px-3 py-2 rounded border border-black"
                          >
                            {showLinkInput ? "Ocultar Vínculo" : "Vincular Outra Planilha"}
                          </button>
                        </div>

                        {showLinkInput && (
                          <div className="bg-cyan-50/50 border border-cyan-200 p-3 rounded mt-3 space-y-2 text-left">
                            <label className="block text-[11px] font-bold text-cyan-950 uppercase font-mono">
                              Cole o link completo da Nova Planilha ou ID:
                            </label>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                type="text"
                                placeholder="Cole o link completo da Planilha ou o ID"
                                value={linkSheetInput}
                                onChange={(e) => setLinkSheetInput(e.target.value)}
                                className="flex-1 px-3 py-1.5 border-2 border-black font-mono text-xs focus:outline-none focus:bg-white text-black"
                              />
                              <button
                                type="button"
                                disabled={linkingSheet}
                                onClick={() => handleLinkExistingSheet(linkSheetInput)}
                                className="bg-cyan-600 hover:bg-cyan-700 text-white font-mono font-bold text-xs px-3 py-1.5 rounded border border-black shadow-sm disabled:opacity-50 whitespace-nowrap"
                              >
                                {linkingSheet ? "Vinculando..." : "Confirmar Vínculo"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* CARD DE BACKUP GOOGLE DRIVE */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-black p-5 rounded shadow-brutal space-y-3 mt-4">
                      <div className="flex items-start gap-3">
                        <HardDrive className="w-8 h-8 text-blue-600 shrink-0" />
                        <div>
                          <span className="bg-blue-700 text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded uppercase border border-black inline-block mb-1">
                            📦 Segurança do Código
                          </span>
                          <h3 className="font-display font-black text-base text-black">
                            Backup Completo do Site no Google Drive
                          </h3>
                          <p className="text-xs text-gray-700 leading-relaxed mt-1">
                            Crie instantaneamente uma cópia de segurança completa (.tar.gz) de todos os arquivos de código-fonte, configurações e banco de dados local do seu site e salve-a na sua conta do Google Drive com total segurança antes de migrar.
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 flex justify-start">
                        <button
                          type="button"
                          disabled={isBackingUp}
                          onClick={() => handleBackupToGoogleDrive()}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-mono font-bold text-xs uppercase px-5 py-2.5 rounded border-2 border-black shadow-brutal-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                        >
                          <RefreshCw className={`w-4 h-4 ${isBackingUp ? "animate-spin" : ""}`} />
                          <span>{isBackingUp ? "Criando e Enviando Backup..." : "🚀 Salvar Backup do Site no Google Drive"}</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="bg-green-50 border-2 border-black p-4 rounded flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="font-mono font-bold text-sm text-green-900 block mb-1">
                📊 PLANILHA DA CAMPANHA PRONTA
              </span>
              <p className="text-xs text-gray-700">
                Todos os {orders.length} pedidos já estão estruturados e prontos para importação direta no Google Drive / Sheets.
              </p>
            </div>

            <a
              href="/api/sheets/export.csv"
              download
              className="bg-green-600 text-white px-5 py-3 rounded font-mono font-bold text-xs uppercase border-2 border-black shadow-brutal-sm hover:bg-green-700 transition-all flex items-center gap-2 flex-shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>BAIXAR PLANILHA (.CSV)</span>
            </a>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4 pt-2">
            <h3 className="font-display font-bold text-sm uppercase text-black">
              CONFIGURAÇÃO DE WEBHOOK AUTOMÁTICO (GOOGLE APPS SCRIPT / ZAPIER)
            </h3>

            <div>
              <label className="block font-mono font-bold text-xs text-gray-700 mb-1">
                URL DO WEBHOOK OU GOOGLE APPS SCRIPT (OPCIONAL)
              </label>
              <input
                type="url"
                placeholder="https://script.google.com/macros/s/.../exec"
                value={config.googleSheetsWebhookUrl}
                onChange={(e) => setConfig({ ...config, googleSheetsWebhookUrl: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-black font-mono text-xs focus:outline-none focus:bg-cyan-50/50"
              />
              <span className="text-[11px] text-gray-500 mt-1 block">
                Se preenchido, cada pedido confirmado será enviado via requisição POST instantaneamente para esta URL.
              </span>

              <div className="mt-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowScriptGuide(!showScriptGuide)}
                  className="text-xs font-mono font-bold text-primary-deep flex items-center gap-1.5 hover:underline"
                >
                  <HelpCircle className="w-4 h-4" />
                  <span>{showScriptGuide ? "Ocultar Guia de Configuração (Google Apps Script / Zapier)" : "❓ Como configurar o Webhook / Google Apps Script? (Clique para ver as instruções)"}</span>
                </button>

                {showScriptGuide && (
                  <div className="mt-3 bg-gray-50 border-2 border-black p-4 rounded space-y-3 font-sans text-xs text-gray-800">
                    <div>
                      <h4 className="font-display font-bold uppercase text-black mb-1 flex items-center gap-1.5">
                        <Code className="w-4 h-4 text-secondary-cyan" /> 1. Opção Google Sheets Direto (Grátis e Ilimitado via Apps Script)
                      </h4>
                      <ol className="list-decimal list-inside space-y-1 pl-1 text-gray-700">
                        <li>Abra sua planilha no Google Sheets e clique no menu <strong>Extensões &gt; Apps Script</strong>.</li>
                        <li>Apague todo o código que aparecer lá e cole o script abaixo.</li>
                        <li>Clique no botão azul <strong>Implantar &gt; Nova implantação</strong> (no canto superior direito).</li>
                        <li>Em <em>"Selecione o tipo"</em> (ícone de engrenagem), escolha <strong>App da Web (Web App)</strong>.</li>
                        <li>Em <em>"Quem tem acesso"</em>, selecione <strong>Qualquer pessoa (Anyone)</strong> e clique em <strong>Implantar</strong>.</li>
                        <li>Copie a <strong>URL do App da Web</strong> (termina em <code>/exec</code>) e cole no campo de Webhook acima!</li>
                      </ol>

                      <div className="relative mt-2">
                        <pre className="bg-black text-green-400 p-3 rounded font-mono text-[10px] overflow-x-auto border border-gray-700 max-h-48">
                          {appsScriptCode}
                        </pre>
                        <button
                          type="button"
                          onClick={handleCopyScript}
                          className="absolute top-2 right-2 bg-white text-black px-2.5 py-1 rounded border border-black font-mono font-bold text-[10px] flex items-center gap-1 hover:bg-gray-100 shadow-sm"
                        >
                          {copiedScript ? (
                            <>
                              <Check className="w-3 h-3 text-green-600" /> CÓDIGO COPIADO!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> COPIAR SCRIPT
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-300">
                      <h4 className="font-display font-bold uppercase text-black mb-1">
                        ⚡ 2. Opção Zapier ou Make (Integromat)
                      </h4>
                      <p className="text-gray-700">
                        No Zapier ou Make, crie um novo fluxo iniciando com o gatilho <strong>"Catch Hook" (Webhooks by Zapier)</strong>. Cole a URL gerada por eles diretamente no campo acima. Quando um pedido for pago no site ou quando você clicar no botão <em>"Forçar Sincronização Agora"</em>, o sistema enviará o JSON completo com os dados do cliente e itens.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={savingConfig}
                className="bg-primary-deep text-white px-5 py-2.5 rounded font-mono font-bold text-xs uppercase border-2 border-black shadow-brutal-sm hover:bg-primary-deep/90 transition-all"
              >
                {savingConfig ? "Salvando..." : "SALVAR CONFIGURAÇÃO"}
              </button>

              <button
                type="button"
                onClick={handleManualSync}
                className="bg-secondary-cyan text-black px-5 py-2.5 rounded font-mono font-bold text-xs uppercase border-2 border-black shadow-brutal-sm hover:bg-secondary-cyan/90 transition-all"
              >
                ⚡ FORÇAR SINCRONIZAÇÃO AGORA
              </button>
            </div>

            {syncStatus && (
              <div className="font-mono font-bold text-xs p-3 bg-cyan-50 border border-black rounded mt-2">
                {syncStatus}
              </div>
            )}
          </form>
        </div>
      )}

      {/* TAB 3: MERCADO PAGO INTEGRATION */}
      {activeTab === "MERCADOPAGO" && (
        <div className="bg-white border-2 border-black p-6 rounded shadow-brutal max-w-3xl space-y-6">
          <div className="flex items-center gap-3 border-b-2 border-black pb-4">
            <Sliders className="w-8 h-8 text-secondary-cyan" />
            <div>
              <h2 className="font-display font-black text-xl text-black">
                CONFIGURAÇÃO DO MERCADO PAGO (CHECKOUT & PIX)
              </h2>
              <p className="text-xs text-gray-600 font-sans">
                A chave sandbox de testes já está ativa para permitir aprovação instantânea simulada no carrinho.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div>
              <label className="block font-mono font-bold text-xs text-gray-700 mb-1">
                ACCESS TOKEN DE PRODUÇÃO MERCADO PAGO
              </label>
              <input
                type="password"
                placeholder="APP_USR-xxxxxxxxxxxxxxx"
                value={config.mercadoPagoAccessToken}
                onChange={(e) => setConfig({ ...config, mercadoPagoAccessToken: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-black font-mono text-xs focus:outline-none focus:bg-cyan-50/50"
              />
            </div>

            <div>
              <label className="block font-mono font-bold text-xs text-gray-700 mb-1">
                PUBLIC KEY
              </label>
              <input
                type="text"
                placeholder="TEST-xxxxxxx"
                value={config.mercadoPagoPublicKey}
                onChange={(e) => setConfig({ ...config, mercadoPagoPublicKey: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-black font-mono text-xs focus:outline-none focus:bg-cyan-50/50"
              />
            </div>

            <button
              type="submit"
              disabled={savingConfig}
              className="bg-primary-deep text-white px-5 py-2.5 rounded font-mono font-bold text-xs uppercase border-2 border-black shadow-brutal-sm hover:bg-primary-deep/90 transition-all"
            >
              SALVAR CHAVES MERCADO PAGO
            </button>
          </form>
        </div>
      )}

      {/* TAB 4: EMAIL SMTP CONFIGURATION */}
      {activeTab === "EMAIL" && (
        <div className="bg-white border-2 border-black p-6 rounded shadow-brutal max-w-3xl space-y-6">
          <div className="flex items-center gap-3 border-b-2 border-black pb-4">
            <Mail className="w-8 h-8 text-primary-deep" />
            <div>
              <h2 className="font-display font-black text-xl text-black">
                CONFIGURAÇÃO DE E-MAIL (SMTP)
              </h2>
              <p className="text-xs text-gray-600 font-sans">
                Configure os dados do seu servidor de e-mail (SMTP) para enviar recibos reais de confirmação diretamente para os clientes ao clicarem no botão "CONFIRMAR POR E-MAIL".
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div>
              <label className="block font-mono font-bold text-xs text-gray-700 mb-1">
                E-MAIL DO REMETENTE (DISPLAY NAME)
              </label>
              <input
                type="email"
                placeholder="exemplo@colegioaguaviva.com.br"
                value={config.emailNotifySender}
                onChange={(e) => setConfig({ ...config, emailNotifySender: e.target.value })}
                className="w-full px-4 py-2.5 border-2 border-black font-mono text-xs focus:outline-none focus:bg-cyan-50/50"
                required
              />
              <span className="text-[11px] text-gray-500 mt-1 block">
                O e-mail ou nome que aparecerá como remetente nas mensagens enviadas aos compradores.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block font-mono font-bold text-xs text-gray-700 mb-1">
                  SERVIDOR SMTP (HOST)
                </label>
                <input
                  type="text"
                  placeholder="smtp.gmail.com"
                  value={config.smtpHost}
                  onChange={(e) => setConfig({ ...config, smtpHost: e.target.value })}
                  className="w-full px-4 py-2.5 border-2 border-black font-mono text-xs focus:outline-none focus:bg-cyan-50/50"
                  required
                />
              </div>

              <div>
                <label className="block font-mono font-bold text-xs text-gray-700 mb-1">
                  PORTA SMTP
                </label>
                <input
                  type="number"
                  placeholder="465"
                  value={config.smtpPort}
                  onChange={(e) => setConfig({ ...config, smtpPort: parseInt(e.target.value) || 465 })}
                  className="w-full px-4 py-2.5 border-2 border-black font-mono text-xs focus:outline-none focus:bg-cyan-50/50"
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                id="smtpSecure"
                checked={config.smtpSecure}
                onChange={(e) => setConfig({ ...config, smtpSecure: e.target.checked })}
                className="w-4 h-4 border-2 border-black text-primary-deep focus:ring-0 cursor-pointer"
              />
              <label htmlFor="smtpSecure" className="font-mono font-bold text-xs text-gray-700 cursor-pointer select-none">
                Usar Conexão Segura SSL/TLS (Recomendado para porta 465)
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-mono font-bold text-xs text-gray-700 mb-1">
                  USUÁRIO SMTP (E-MAIL DE AUTENTICAÇÃO)
                </label>
                <input
                  type="text"
                  placeholder="seu-email@gmail.com"
                  value={config.smtpUser || ""}
                  onChange={(e) => setConfig({ ...config, smtpUser: e.target.value })}
                  className="w-full px-4 py-2.5 border-2 border-black font-mono text-xs focus:outline-none focus:bg-cyan-50/50"
                />
              </div>

              <div>
                <label className="block font-mono font-bold text-xs text-gray-700 mb-1">
                  SENHA SMTP (OU SENHA DE APP)
                </label>
                <input
                  type="password"
                  placeholder="Sua senha ou senha de aplicativo..."
                  value={config.smtpPass || ""}
                  onChange={(e) => setConfig({ ...config, smtpPass: e.target.value })}
                  className="w-full px-4 py-2.5 border-2 border-black font-mono text-xs focus:outline-none focus:bg-cyan-50/50"
                />
              </div>
            </div>

            <div className="bg-amber-50 border-2 border-black p-4 rounded text-xs text-gray-800 space-y-2">
              <span className="font-bold text-amber-900 block font-mono text-xs">
                💡 COMO CONFIGURAR PARA CONTAS GMAIL:
              </span>
              <ol className="list-decimal list-inside space-y-1 text-gray-700 pl-1">
                <li>No campo <strong>Servidor SMTP</strong>, digite <code>smtp.gmail.com</code> e defina a porta como <code>465</code> (marcando a caixa de conexão segura).</li>
                <li>Ative a <strong>Verificação em Duas Etapas</strong> na sua Conta Google.</li>
                <li>Acesse o menu <a href="https://myaccount.google.com/" target="_blank" rel="noopener noreferrer" className="font-bold underline text-primary-deep">Minha Conta Google &gt; Segurança</a> e busque por <strong>"Senhas de App"</strong>.</li>
                <li>Crie uma senha de aplicativo chamada <code>Pizza Solidaria</code>.</li>
                <li>Copie a senha gerada de 16 caracteres e cole no campo <strong>Senha SMTP</strong> acima.</li>
              </ol>
            </div>

            <button
              type="submit"
              disabled={savingConfig}
              className="bg-primary-deep text-white px-6 py-3 rounded font-mono font-bold text-xs uppercase border-2 border-black shadow-brutal-sm hover:bg-primary-deep/90 transition-all"
            >
              {savingConfig ? "Salvando..." : "SALVAR CONFIGURAÇÃO DE E-MAIL"}
            </button>
          </form>
        </div>
      )}

      {/* TAB 5: RESTRICTED ACCESS USERS */}
      {activeTab === "USERS" && (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-150">
          <div className="bg-white border-2 border-black p-6 rounded shadow-brutal max-w-4xl space-y-6">
            <div className="flex items-center gap-3 border-b-2 border-black pb-4">
              <Users className="w-8 h-8 text-primary-deep" />
              <div>
                <h2 className="font-display font-black text-xl text-black uppercase">
                  USUÁRIOS COM ACESSO À ÁREA RESTRITA
                </h2>
              </div>
            </div>

            {/* Explicação de Planilha Não Conectada */}
            {!createdSheetInfo && (
              <div className="bg-amber-50 border-2 border-black p-4 rounded text-xs text-gray-800 flex flex-col gap-2 font-sans">
                <span className="font-bold text-amber-900 block font-mono">
                  ⚠️ PLANILHA GOOGLE SHEETS NÃO CONECTADA OU CRIADA
                </span>
                <p>
                  Atualmente o sistema está em modo offline usando os usuários padrões locais. Para gerenciar novos usuários de forma dinâmica, vá até a aba <strong>"API Google Sheets"</strong>, conecte sua conta Google e clique em "Criar Nova Planilha Integrada". Uma aba chamada <strong>"Usuarios"</strong> será criada automaticamente lá.
                </p>
                <div className="font-mono text-[11px] bg-white p-2 border border-black rounded inline-block w-fit">
                  <strong>Usuários locais disponíveis (Backup offline):</strong><br/>
                  • servicosdarin@gmail.com (Senha: handvida2026)<br/>
                  • admin@handvida.org (Senha: 1234)
                </div>
              </div>
            )}

            {/* Formulário de adição de novo usuário se a planilha estiver conectada */}
            {createdSheetInfo && (
              <form onSubmit={handleAddUser} className="bg-gray-50 border-2 border-black p-5 rounded space-y-4">
                <h3 className="font-mono font-bold text-xs uppercase text-black flex items-center gap-1">
                  ➕ ADICIONAR NOVO USUÁRIO AUTORIZADO
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-mono font-bold text-[10px] text-gray-700 mb-1">
                      NOME COMPLETO *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: João Silva"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-black font-mono text-xs focus:outline-none focus:bg-cyan-50/50"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-mono font-bold text-[10px] text-gray-700 mb-1">
                      E-MAIL DE LOGIN *
                    </label>
                    <input
                      type="email"
                      placeholder="Ex: joao@gmail.com"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-black font-mono text-xs focus:outline-none focus:bg-cyan-50/50"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-mono font-bold text-[10px] text-gray-700 mb-1">
                      SENHA *
                    </label>
                    <input
                      type="text"
                      placeholder="Senha do usuário..."
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-black font-mono text-xs focus:outline-none focus:bg-cyan-50/50"
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    id="btn-add-authorized-user"
                    type="submit"
                    disabled={savingUsers}
                    className="bg-black text-white hover:bg-gray-800 px-4 py-2 rounded font-mono font-bold text-xs uppercase border-2 border-black transition-all"
                  >
                    {savingUsers ? "Gravando na Planilha..." : "ADICIONAR"}
                  </button>
                </div>
              </form>
            )}

            {/* Tabela de Usuários Atuais */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <h3 className="font-mono font-bold text-xs uppercase text-black">
                  👥 USUÁRIOS DETECTADOS ({restrictedUsers.length})
                </h3>
                {createdSheetInfo && (
                  <button
                    id="btn-sync-authorized-users"
                    type="button"
                    onClick={fetchUsers}
                    disabled={loadingUsers}
                    className="flex items-center gap-1.5 bg-cyan-100 hover:bg-cyan-200 text-cyan-950 px-3 py-1.5 rounded font-mono font-bold text-[11px] uppercase border-2 border-black transition-all shadow-brutal-xs active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
                    {loadingUsers ? "Sincronizando..." : "Sincronizar Usuários"}
                  </button>
                )}
              </div>

              {loadingUsers ? (
                <div className="text-center py-6 font-mono text-xs text-gray-500">
                  Carregando lista de usuários do Google Sheets...
                </div>
              ) : restrictedUsers.length === 0 ? (
                <div className="border-2 border-dashed border-black rounded p-8 text-center text-gray-500 font-mono text-xs">
                  Nenhum usuário extra cadastrado ainda.
                </div>
              ) : (
                <div className="border-2 border-black rounded overflow-hidden">
                  <table className="w-full text-left font-mono text-xs">
                    <thead>
                      <tr className="bg-black text-white border-b-2 border-black">
                        <th className="p-3">Nome</th>
                        <th className="p-3">E-mail</th>
                        <th className="p-3">Senha (Planilha)</th>
                        <th className="p-3 text-center">Status</th>
                        {createdSheetInfo && <th className="p-3 text-right">Ações</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-black">
                      {restrictedUsers.map((u, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 bg-white">
                          <td className="p-3 font-bold">{u.name}</td>
                          <td className="p-3 text-gray-700">{u.email}</td>
                          <td className="p-3">
                            <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800 select-all border border-black/20">
                              {u.password || "••••••"}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              disabled={!createdSheetInfo || savingUsers}
                              onClick={() => handleToggleUserStatus(u.email)}
                              className={`px-2 py-1 rounded text-[10px] font-bold border ${
                                u.status === "Ativo"
                                  ? "bg-green-100 text-green-800 border-green-600 hover:bg-green-200"
                                  : "bg-red-100 text-red-800 border-red-600 hover:bg-red-200"
                              } transition-colors disabled:opacity-60 disabled:pointer-events-none`}
                            >
                              {u.status}
                            </button>
                          </td>
                          {createdSheetInfo && (
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                disabled={savingUsers}
                                onClick={() => handleDeleteUser(u.email)}
                                className="text-red-600 hover:text-red-800 hover:underline font-bold"
                              >
                                Excluir
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação com Código Secreto para Apagar Todos os Pedidos */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-white border-4 border-black shadow-brutal max-w-md w-full p-6 rounded text-left animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-red-600 mb-3 border-b-2 border-black pb-3">
              <ShieldAlert className="w-6 h-6 flex-shrink-0" />
              <h3 className="font-display font-black text-lg uppercase text-black">
                CONFIRMAÇÃO DE SEGURANÇA
              </h3>
            </div>
            
            <p className="font-sans text-sm text-gray-800 font-medium mb-4">
              Você solicitou apagar <strong>TODOS OS {orders.length} PEDIDOS</strong> do sistema. Esta ação é irreversível. Para autorizar, digite o código secreto abaixo:
            </p>

            <form onSubmit={handleConfirmClearSecret} className="space-y-4">
              <div>
                <label className="block font-mono font-bold text-xs uppercase text-gray-700 mb-1.5">
                  CÓDIGO SECRETO DE CONFIRMAÇÃO *
                </label>
                <input
                  type="text"
                  placeholder="Digite x256803x..."
                  autoFocus
                  value={clearSecretCode}
                  onChange={(e) => {
                    setClearSecretCode(e.target.value);
                    setClearSecretError("");
                  }}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border-2 border-black font-mono text-base focus:outline-none focus:bg-white shadow-brutal-sm"
                />
              </div>

              {clearSecretError && (
                <div className="bg-red-50 border-2 border-red-600 p-2.5 rounded font-mono text-xs font-bold text-red-600 flex items-center gap-2">
                  <span>❌ {clearSecretError}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClearConfirmModal(false)}
                  className="bg-gray-200 text-black px-4 py-2.5 rounded font-mono font-bold text-xs uppercase border-2 border-black hover:bg-gray-300 transition-all"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  className="bg-red-600 text-white px-5 py-2.5 rounded font-mono font-bold text-xs uppercase border-2 border-black shadow-brutal-sm hover:bg-red-700 transition-all flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>CONFIRMAR EXCLUSÃO</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação para Excluir um Pedido Único */}
      {orderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-white border-4 border-black shadow-brutal max-w-md w-full p-6 rounded text-left animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-red-600 mb-3 border-b-2 border-black pb-3">
              <Trash2 className="w-6 h-6 flex-shrink-0" />
              <h3 className="font-display font-black text-lg uppercase text-black">
                EXCLUIR PEDIDO
              </h3>
            </div>
            
            <p className="font-sans text-sm text-gray-800 font-medium mb-6">
              Tem certeza de que deseja excluir o pedido <strong>{orderToDelete}</strong>? Esta ação removerá o pedido do sistema local e atualizará a planilha do Google Sheets.
            </p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOrderToDelete(null)}
                className="bg-gray-200 text-black px-4 py-2.5 rounded font-mono font-bold text-xs uppercase border-2 border-black hover:bg-gray-300 transition-all"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={() => executeDeleteOrder(orderToDelete)}
                className="bg-red-600 text-white px-5 py-2.5 rounded font-mono font-bold text-xs uppercase border-2 border-black shadow-brutal-sm hover:bg-red-700 transition-all"
              >
                CONFIRMAR EXCLUSÃO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação para Excluir um Usuário */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-white border-4 border-black shadow-brutal max-w-md w-full p-6 rounded text-left animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-red-600 mb-3 border-b-2 border-black pb-3">
              <Trash2 className="w-6 h-6 flex-shrink-0" />
              <h3 className="font-display font-black text-lg uppercase text-black">
                REMOVER USUÁRIO
              </h3>
            </div>
            
            <p className="font-sans text-sm text-gray-800 font-medium mb-6">
              Tem certeza de que deseja remover o acesso do usuário <strong>{userToDelete}</strong>?
            </p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="bg-gray-200 text-black px-4 py-2.5 rounded font-mono font-bold text-xs uppercase border-2 border-black hover:bg-gray-300 transition-all"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={() => executeDeleteUser(userToDelete)}
                className="bg-red-600 text-white px-5 py-2.5 rounded font-mono font-bold text-xs uppercase border-2 border-black shadow-brutal-sm hover:bg-red-700 transition-all"
              >
                CONFIRMAR EXCLUSÃO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
