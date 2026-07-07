import React, { useState, useEffect } from "react";
import { Order, IntegrationConfig } from "../types";
import { connectGoogleSheets, createOrdersSpreadsheet, syncOrdersToSpreadsheet } from "../googleSheets";
import { 
  Lock, Key, RefreshCw, Download, FileSpreadsheet, CheckCircle, 
  Clock, Search, DollarSign, ShoppingBag, Users, ExternalLink, 
  Mail, MessageCircle, Sliders, ShieldAlert, ArrowLeft, Trash2,
  HelpCircle, Copy, Check, Code
} from "lucide-react";

interface AdminDashboardProps {
  onBack: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [activeTab, setActiveTab] = useState<"ORDERS" | "SHEETS" | "MERCADOPAGO">("ORDERS");

  const [config, setConfig] = useState<IntegrationConfig>({
    googleSheetsWebhookUrl: "",
    googleSpreadsheetId: "1-exemplo-planilha-solidaria-handebol-2026",
    autoSyncEnabled: true,
    mercadoPagoAccessToken: "APP_USR-sandbox-test-key",
    mercadoPagoPublicKey: "TEST-pub-key-123",
    emailNotifySender: "notificacoes@handvida-aguaviva.com.br",
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [showScriptGuide, setShowScriptGuide] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  const [googleEmail, setGoogleEmail] = useState<string | null>(() => localStorage.getItem("av_google_email"));
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [createdSheetInfo, setCreatedSheetInfo] = useState<{ spreadsheetId: string; spreadsheetUrl: string } | null>(() => {
    const saved = localStorage.getItem("av_google_sheet_info");
    return saved ? JSON.parse(saved) : null;
  });

  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [clearSecretCode, setClearSecretCode] = useState("");
  const [clearSecretError, setClearSecretError] = useState("");

  const appsScriptCode = `function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    
    // Sincronização em lote (quando clica em Forçar Sincronização)
    if (data.action === "FULL_SYNC" && Array.isArray(data.orders)) {
      data.orders.forEach(function(o) {
        sheet.appendRow([
          o.id,
          o.createdAt,
          o.customerName,
          o.whatsapp,
          o.studentName + " (" + o.studentTurma + ")",
          o.paymentMethod,
          o.status,
          o.total
        ]);
      });
      return ContentService.createTextOutput(JSON.stringify({ status: "success", count: data.orders.length }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Novo pedido recebido em tempo real
    sheet.appendRow([
      data.id,
      data.createdAt,
      data.customerName,
      data.whatsapp,
      data.studentName + " (" + data.studentTurma + ")",
      data.paymentMethod,
      data.status,
      data.total
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(appsScriptCode);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 3000);
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/orders");
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
      if (data) setConfig(data);
    } catch (e) {}
  };

  useEffect(() => {
    if (authenticated) {
      fetchOrders();
      fetchConfig();
      // Auto-poll orders every 15 seconds for real-time monitoring
      const interval = setInterval(fetchOrders, 15000);
      return () => clearInterval(interval);
    }
  }, [authenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "handvida2026" || password === "admin" || password === "1234") {
      setAuthenticated(true);
      setError("");
    } else {
      setError("Senha incorreta.");
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

  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o pedido ${orderId}?`)) return;
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { method: "DELETE" });
      if (res.ok) fetchOrders();
    } catch (e) {}
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
      setSyncStatus(`✅ Google Conectado (${email || "Autenticado"})!`);
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

  const handleCreateGoogleSheet = async () => {
    if (!googleToken) {
      alert("Por favor, clique em 'Conectar Google Sheets' primeiro para autenticar!");
      return;
    }
    if (!window.confirm(`Deseja criar a planilha oficial de Pedidos no seu Google Drive com ${orders.length} pedido(s)?`)) {
      return;
    }
    setCreatingSheet(true);
    setSyncStatus("Criando planilha no seu Google Drive...");
    try {
      const info = await createOrdersSpreadsheet(googleToken, orders);
      setCreatedSheetInfo(info);
      localStorage.setItem("av_google_sheet_info", JSON.stringify(info));
      setSyncStatus("🎉 Planilha Criada e Sincronizada no seu Google Sheets!");
      alert(`🎉 Planilha criada e preenchida com sucesso no seu Google Drive!\n\nID: ${info.spreadsheetId}`);
    } catch (err: any) {
      alert("Erro ao criar planilha: " + (err.message || err));
      setSyncStatus("❌ Erro ao criar planilha no Google.");
    } finally {
      setCreatingSheet(false);
    }
  };

  const handleSyncToDirectSheet = async () => {
    if (!googleToken || !createdSheetInfo) {
      alert("Você precisa autenticar no Google e ter uma planilha criada!");
      return;
    }
    if (!window.confirm(`Atualizar a planilha do Google com os ${orders.length} pedidos atuais? Isso sobrescreverá a aba Pedidos.`)) {
      return;
    }
    setSyncStatus("Sincronizando com a Planilha Oficial...");
    try {
      const count = await syncOrdersToSpreadsheet(googleToken, createdSheetInfo.spreadsheetId, orders);
      setSyncStatus(`✅ ${count} pedidos sincronizados no seu Google Sheets!`);
      alert(`✅ Sincronizado com sucesso! ${count} pedido(s) gravado(s) na planilha do Google.`);
      setTimeout(() => setSyncStatus(""), 4000);
    } catch (err: any) {
      alert("Erro na sincronização: " + (err.message || err));
      setSyncStatus("❌ Falha na sincronização.");
    }
  };

  const filteredOrders = orders.filter((o) => {
    const matchesSearch = 
      o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.cpf && o.cpf.toLowerCase().includes(searchQuery.toLowerCase())) ||
      o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.studentTurma.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalArrecadado = orders
    .filter((o) => o.status === "PAGO")
    .reduce((sum, o) => sum + o.total, 0);

  const totalPizzasVendidas = orders
    .filter((o) => o.status === "PAGO")
    .reduce((sum, o) => sum + o.items.reduce((iSum, i) => iSum + i.quantity, 0), 0);

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

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                placeholder="Digite a senha..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border-2 border-black font-mono text-center text-lg focus:outline-none focus:bg-cyan-50/50 shadow-brutal-sm"
                autoFocus
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-tertiary-red text-tertiary-red p-2.5 rounded font-mono text-xs font-bold">
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
                <div className="text-xs text-gray-700">
                  <strong className="block text-black font-bold">Autenticação Oficial Google OAuth</strong>
                  Permissão segura apenas para criar e gerenciar planilhas desta aplicação.
                  <span className="block mt-1 text-[11px] text-amber-700 font-semibold">
                    ⚠️ Se o botão não abrir o login, clique no ícone de expandir no topo direito do painel para abrir o app em uma NOVA ABA e tente de novo.
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
                  <span className="font-bold">Conectar Google Sheets (Conta Google)</span>
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
                    onClick={() => {
                      setGoogleToken(null);
                      setGoogleEmail(null);
                      localStorage.removeItem("av_google_email");
                    }}
                    className="text-[11px] font-mono text-red-600 underline hover:text-red-800"
                  >
                    Desconectar conta
                  </button>
                </div>

                {!createdSheetInfo ? (
                  <div className="text-center py-3 bg-green-50/50 rounded border border-green-200 p-4 space-y-3">
                    <p className="text-xs text-gray-700">
                      Clique abaixo para gerar automaticamente a planilha oficial no seu Google Drive com todos os pedidos gravados.
                    </p>
                    <button
                      type="button"
                      disabled={creatingSheet}
                      onClick={handleCreateGoogleSheet}
                      className="bg-green-600 hover:bg-green-700 text-white font-mono font-bold text-xs uppercase px-6 py-3 rounded border-2 border-black shadow-brutal-sm flex items-center justify-center gap-2 mx-auto transition-all disabled:opacity-50"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>{creatingSheet ? "Criando Planilha no Google Drive..." : "🚀 Criar Planilha de Pedidos no Meu Google Sheets"}</span>
                    </button>
                  </div>
                ) : (
                  <div className="bg-green-100 border-2 border-green-700 p-4 rounded space-y-3">
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
                        onClick={handleSyncToDirectSheet}
                        className="bg-green-700 hover:bg-green-800 text-white font-mono font-bold text-xs px-4 py-2 rounded border border-black flex items-center gap-1.5 shadow-sm"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Sincronizar Pedidos Agora ({orders.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateGoogleSheet}
                        className="bg-white hover:bg-gray-100 text-black font-mono text-xs px-3 py-2 rounded border border-black"
                      >
                        Criar Nova Planilha Separada
                      </button>
                    </div>
                  </div>
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
    </div>
  );
};
