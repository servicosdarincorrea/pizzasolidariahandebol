import React, { useEffect, useState } from "react";
import { Order } from "../types";
import confetti from "canvas-confetti";
import { 
  Check, Home, Share2, Calendar, MapPin, QrCode, CreditCard,
  Send, CheckCircle, Clock, ExternalLink, Mail, MessageCircle, AlertCircle, ShoppingBag 
} from "lucide-react";

interface OrderConfirmationScreenProps {
  order: Order;
  onHome: () => void;
  onSimulatePayment: (orderId: string) => Promise<void>;
  onNewOrder?: () => void;
  onOrderUpdated?: (order: Order) => void;
  onSearchOrders?: () => void;
}

export const OrderConfirmationScreen: React.FC<OrderConfirmationScreenProps> = ({
  order,
  onHome,
  onSimulatePayment,
  onNewOrder,
  onOrderUpdated,
  onSearchOrders,
}) => {
  const [copiedPix, setCopiedPix] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [notificationSent, setNotificationSent] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    if (order.status === "PAGO") {
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (e) {}
    }
  }, [order.status]);

  useEffect(() => {
    let interval: any;
    if (order.status !== "PAGO") {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/orders/${encodeURIComponent(order.id)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.order && data.order.status === "PAGO") {
              if (onOrderUpdated) onOrderUpdated(data.order);
            }
          }
        } catch (e) {}
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [order.id, order.status, onOrderUpdated]);

  const getPixString = () => {
    if (order.pixCopyPaste) return order.pixCopyPaste;
    const amountStr = Number(order.total || 50).toFixed(2);
    const cleanId = (order.id || "1001").replace(/\D/g, "") || "1001";
    const txId = `PED${cleanId}`.slice(0, 25);

    const gui = "0014br.gov.bcb.pix";
    const pixKey = "servicosdarin@gmail.com";
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
  };

  const handleCopyPix = () => {
    const pixKey = getPixString();
    navigator.clipboard.writeText(pixKey);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2500);
  };

  const handleSimulate = async () => {
    setSimulating(true);
    await onSimulatePayment(order.id);
    setSimulating(false);
  };

  const handleSendNotification = async (type: "email" | "whatsapp") => {
    try {
      await fetch("/api/notify/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, type })
      });
      setNotificationSent((prev) => ({ ...prev, [type]: true }));
    } catch (e) {}
  };

  const openWhatsApp = () => {
    const text = encodeURIComponent(
      `🍕 *PEDIDO CONFIRMADO - PIZZA SOLIDÁRIA HANDEBOL ÁGUA VIVA*\n\n` +
      `Olá *${order.customerName}*! Recebemos seu pedido *${order.id}* com sucesso!\n\n` +
      `📦 *Itens:* ${order.items.map(i => `${i.quantity}x ${i.name}`).join(", ")}\n` +
      `💰 *Total:* R$ ${order.total.toFixed(2).replace(".", ",")}\n` +
      `🔥 *Status:* ${order.status}\n\n` +
      `🗓️ *Retirada:* 21 de Agosto das 14h às 17h\n` +
      `📍 *Local:* Colégio Água Viva\n\n` +
      `Obrigado por apoiar nossos atletas do time de Handebol! 🤾‍♂️❤️`
    );
    const phoneClean = order.whatsapp.replace(/\D/g, "");
    const targetPhone = phoneClean.length >= 10 ? `55${phoneClean}` : "";
    window.open(`https://api.whatsapp.com/send?phone=${targetPhone}&text=${text}`, "_blank");
  };

  return (
    <div className="max-w-xl mx-auto pb-32 pt-4 px-4">
      {/* Top Header matching screenshot */}
      <div className="bg-primary-deep text-white p-4 rounded border-2 border-black shadow-brutal text-center font-display font-black text-xl tracking-wider mb-8">
        CONFIRMAÇÃO DE PEDIDO
      </div>

      {/* Goal Check Icon Box matching screenshot */}
      <div className="flex flex-col items-center mb-6">
        <div className="relative mb-3">
          {/* GOAL! Ribbon badge */}
          <div className="absolute -top-3 -right-6 bg-tertiary-red text-white px-2.5 py-0.5 font-mono font-bold text-xs tracking-widest border-2 border-black rotate-12 shadow-sm z-10 animate-pulse">
            GOAL!
          </div>

          <div className="w-24 h-24 bg-secondary-cyan border-4 border-black rounded-2xl shadow-brutal flex items-center justify-center -rotate-3">
            <div className="w-14 h-14 bg-primary-deep rounded-full flex items-center justify-center">
              <Check className="w-9 h-9 text-white stroke-[3]" />
            </div>
          </div>
        </div>

        <h1 className="font-display font-black text-2xl sm:text-3xl uppercase tracking-tight text-black text-center">
          PEDIDO CONFIRMADO!
        </h1>
      </div>

      {/* Main Card matching screenshot */}
      <div className="bg-white border-2 border-black shadow-brutal p-6 rounded mb-6 text-center">
        <p className="text-gray-800 font-sans text-base sm:text-lg leading-relaxed mb-6">
          Obrigado por apoiar o <strong className="text-primary-deep font-bold">Time de Handebol do Colégio Água Viva!</strong> Sua contribuição ajuda nossos atletas a chegarem mais longe.
        </p>

        <hr className="border-t-2 border-black mb-6" />

        {/* Date & Location */}
        <div className="text-left space-y-4 font-sans">
          <div className="flex items-start gap-3">
            <Calendar className="w-6 h-6 text-primary-deep flex-shrink-0 mt-0.5" />
            <div>
              <span className="block font-mono font-bold text-xs uppercase text-gray-500 tracking-wider">
                DATA DE RETIRADA
              </span>
              <span className="font-display font-black text-lg text-black">
                21 de Agosto
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin className="w-6 h-6 text-primary-deep flex-shrink-0 mt-0.5" />
            <div>
              <span className="block font-mono font-bold text-xs uppercase text-gray-500 tracking-wider">
                LOCAL
              </span>
              <span className="font-sans font-bold text-base text-black">
                Colégio Água Viva
              </span>
              <span className="block font-mono text-xs text-gray-500">
                Das 14h às 17h
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Side-by-side Order ID & Status boxes matching screenshot */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-primary-deep text-white p-4 border-2 border-black shadow-brutal rounded flex flex-col items-center justify-center">
          <span className="font-mono font-bold text-xs tracking-wider uppercase text-gray-300">
            PEDIDO
          </span>
          <span className="font-display font-black text-2xl tracking-tight">
            {order.id}
          </span>
        </div>

        <div className="bg-secondary-cyan text-black p-4 border-2 border-black shadow-brutal rounded flex flex-col items-center justify-center">
          <span className="font-mono font-bold text-xs tracking-wider uppercase text-gray-700">
            STATUS
          </span>
          <span className="font-display font-black text-2xl tracking-tight uppercase">
            {order.status === "PAGO" ? "PAGO" : "AGUARDANDO"}
          </span>
        </div>
      </div>

      {/* Resumo Detalhado do Pedido e Valor Pago */}
      <div className="bg-white border-2 border-black shadow-brutal p-5 rounded mb-6 text-left font-sans">
        <h3 className="font-display font-black text-base uppercase text-black mb-4 flex items-center gap-2 border-b-2 border-black pb-2.5">
          <ShoppingBag className="w-5 h-5 text-primary-deep flex-shrink-0" />
          RESUMO DETALHADO DO PEDIDO
        </h3>

        {/* Lista de Itens */}
        <div className="mb-4 space-y-2">
          <span className="font-mono font-bold text-xs uppercase text-gray-500 tracking-wider block mb-1.5">
            ITENS DO PEDIDO
          </span>
          {order.items.map((item, index) => (
            <div key={index} className="flex justify-between items-center text-sm font-medium bg-gray-50 p-3 rounded border border-gray-300">
              <div className="text-gray-900">
                <span className="font-bold text-black text-base mr-1.5">{item.quantity}x</span> {item.name}
              </div>
              <div className="font-mono font-bold text-black">
                R$ {(item.price * item.quantity).toFixed(2).replace(".", ",")}
              </div>
            </div>
          ))}
        </div>

        {/* Valor Pago / Forma de Pagamento */}
        <div className="bg-cyan-50 border-2 border-black p-4 rounded mb-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <span className="font-mono font-bold text-xs uppercase text-gray-600 block mb-0.5">
              FORMA DE PAGAMENTO
            </span>
            <span className="font-bold text-black text-sm uppercase block">
              {order.paymentMethod === "PIX" ? "PIX à vista" : `Cartão (${order.cardData?.cardType === "DEBITO" ? "Débito" : "Crédito"})`}
            </span>
          </div>
          <div className="text-left sm:text-right">
            <span className="font-mono font-bold text-xs uppercase text-gray-600 block mb-0.5">
              VALOR PAGO / TOTAL
            </span>
            <span className="font-display font-black text-2xl text-primary-deep block">
              R$ {order.total.toFixed(2).replace(".", ",")}
            </span>
          </div>
        </div>

        {/* Dados de Identificação do Comprador */}
        <div>
          <span className="font-mono font-bold text-xs uppercase text-gray-500 tracking-wider block mb-2">
            DADOS DO COMPRADOR
          </span>
          <div className="bg-gray-50 border border-gray-300 rounded p-3.5 text-xs space-y-2 text-gray-800 font-mono">
            <div className="flex flex-col sm:flex-row sm:justify-between border-b border-gray-200 pb-1.5">
              <strong className="text-black font-sans uppercase">Nome Completo:</strong> 
              <span className="font-bold text-gray-900">{order.customerName}</span>
            </div>
            {order.cpf && (
              <div className="flex flex-col sm:flex-row sm:justify-between border-b border-gray-200 pb-1.5">
                <strong className="text-black font-sans uppercase">CPF:</strong> 
                <span className="font-bold text-gray-900">{order.cpf}</span>
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:justify-between border-b border-gray-200 pb-1.5">
              <strong className="text-black font-sans uppercase">WhatsApp:</strong> 
              <span className="font-bold text-gray-900">{order.whatsapp}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between border-b border-gray-200 pb-1.5">
              <strong className="text-black font-sans uppercase">E-mail:</strong> 
              <span className="font-bold text-gray-900">{order.email}</span>
            </div>
            {order.studentName && (
              <div className="flex flex-col sm:flex-row sm:justify-between border-b border-gray-200 pb-1.5">
                <strong className="text-black font-sans uppercase">Aluno / Vendedor:</strong> 
                <span className="font-bold text-gray-900">{order.studentName}</span>
              </div>
            )}
            {order.studentTurma && (
              <div className="flex flex-col sm:flex-row sm:justify-between">
                <strong className="text-black font-sans uppercase">Série/Turma ou Vínculo:</strong> 
                <span className="font-bold text-gray-900">{order.studentTurma}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PIX Payment section if status is AGUARDANDO_PAGAMENTO */}
      {order.status !== "PAGO" && order.paymentMethod === "PIX" && (
        <div className="bg-amber-50 border-2 border-black p-5 rounded shadow-brutal mb-6">
          <div className="flex items-center gap-2 font-display font-black text-base text-black mb-2">
            <QrCode className="w-5 h-5 text-tertiary-red" />
            <span>PAGAMENTO PIX MERCADO PAGO</span>
          </div>
          <p className="text-xs text-gray-700 mb-4">
            Copie o código PIX Copia e Cola abaixo para realizar o pagamento no aplicativo do seu banco:
          </p>

          <div className="bg-white p-3 border border-black rounded font-mono text-[11px] break-all mb-4 max-h-20 overflow-y-auto">
            {getPixString()}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleCopyPix}
              className="flex-1 bg-black text-white py-2.5 px-4 rounded font-mono font-bold text-xs uppercase border-2 border-black shadow-brutal-sm hover:bg-gray-800 transition-colors"
            >
              {copiedPix ? "✅ CÓDIGO COPIADO!" : "📋 COPIAR CÓDIGO PIX"}
            </button>

            {/* Simulation button to demonstrate immediate webhook validation */}
            <button
              onClick={handleSimulate}
              disabled={simulating}
              className="flex-1 bg-green-500 text-white py-2.5 px-4 rounded font-mono font-bold text-xs uppercase border-2 border-black shadow-brutal-sm hover:bg-green-600 transition-colors"
            >
              {simulating ? "Validando..." : "⚡ SIMULAR APROVAÇÃO PIX"}
            </button>
          </div>
        </div>
      )}

      {/* Credit Card section if paymentMethod is CARTAO */}
      {order.status !== "PAGO" && order.paymentMethod === "CARTAO" && (
        <div className="bg-cyan-50 border-2 border-black p-5 rounded shadow-brutal mb-6">
          <div className="flex items-center gap-2 font-display font-black text-base text-black mb-2">
            <CreditCard className="w-5 h-5 text-primary-deep" />
            <span>PAGAMENTO CARTÃO DE {order.cardData?.cardType === "DEBITO" ? "DÉBITO" : "CRÉDITO"} (MERCADO PAGO)</span>
          </div>
          <p className="text-xs text-gray-700 mb-4">
            Seus dados foram criptografados com segurança de ponta a ponta e a autorização está sendo processada à vista.
          </p>

          {order.cardData && (
            <div className="bg-white p-3 border border-black rounded font-mono text-xs mb-4 space-y-1 text-gray-800">
              <div><strong>Cartão:</strong> {order.cardData.cardNumberMasked}</div>
              <div><strong>Titular:</strong> {order.cardData.cardHolder}</div>
              <div><strong>Função:</strong> {order.cardData.cardType === "DEBITO" ? "Débito à vista" : "Crédito à vista"} (1x)</div>
            </div>
          )}

          <button
            onClick={handleSimulate}
            disabled={simulating}
            className="w-full bg-green-500 text-white py-3 px-4 rounded font-mono font-bold text-xs uppercase border-2 border-black shadow-brutal-sm hover:bg-green-600 transition-colors"
          >
            {simulating ? "Validando Operadora..." : "⚡ SIMULAR APROVAÇÃO DO CARTÃO"}
          </button>
        </div>
      )}

      {/* Notification System triggers */}
      <div className="bg-white border-2 border-black p-5 rounded shadow-brutal mb-6">
        <h3 className="font-display font-black text-sm uppercase text-black mb-3 flex items-center gap-2">
          <Send className="w-4 h-4 text-primary-deep" />
          SISTEMA DE NOTIFICAÇÕES (E-MAIL & WHATSAPP)
        </h3>
        <p className="text-xs text-gray-600 mb-4">
          O pedido foi salvo automaticamente na Planilha Google. Envie o comprovante de confirmação agora mesmo:
        </p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={openWhatsApp}
            className="bg-green-500 text-white py-3 px-4 rounded font-mono font-bold text-xs uppercase border-2 border-black shadow-brutal-sm hover:bg-green-600 transition-all flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" />
            <span>ENVIAR NO WHATSAPP</span>
          </button>

          <button
            onClick={() => handleSendNotification("email")}
            disabled={notificationSent["email"]}
            className="bg-primary-deep text-white py-3 px-4 rounded font-mono font-bold text-xs uppercase border-2 border-black shadow-brutal-sm hover:bg-primary-deep/90 transition-all flex items-center justify-center gap-2 disabled:bg-gray-500"
          >
            <Mail className="w-4 h-4" />
            <span>{notificationSent["email"] ? "✅ E-MAIL ENVIADO!" : "CONFIRMAR POR E-MAIL"}</span>
          </button>
        </div>
      </div>

      {/* Bottom Action buttons matching screenshot */}
      <div className="space-y-3">
        {onSearchOrders && (
          <button
            onClick={onSearchOrders}
            className="w-full bg-primary-deep text-white py-3 px-6 rounded font-mono font-bold text-sm uppercase tracking-wider border-2 border-black shadow-brutal-sm hover:bg-primary-deep/90 transition-all flex items-center justify-center gap-2"
          >
            <span>🔍 CONSULTAR OUTROS PEDIDOS (POR CPF)</span>
          </button>
        )}

        <button
          onClick={onNewOrder || onHome}
          className="w-full bg-green-500 text-white py-4 px-6 rounded font-mono font-bold text-base uppercase tracking-wider border-2 border-black shadow-brutal hover:bg-green-600 transition-all flex items-center justify-center gap-2"
        >
          <Check className="w-5 h-5" />
          <span>🍕 REALIZAR OUTRO PEDIDO (FAZER NOVO PEDIDO)</span>
        </button>

        <button
          onClick={onHome}
          className="w-full bg-secondary-cyan text-black py-3 px-6 rounded font-mono font-bold text-sm uppercase tracking-wider border-2 border-black shadow-brutal-sm hover:bg-secondary-cyan/90 transition-all flex items-center justify-center gap-2"
        >
          <Home className="w-4 h-4" />
          <span>VOLTAR PARA O CARDÁPIO INICIAL</span>
        </button>

        <button
          onClick={() => {
            if (navigator.share) {
              navigator.share({
                title: "Pizza Solidária - Handebol Colégio Água Viva",
                text: "Apoie os atletas do time de Handebol comprando uma deliciosa pizza artesanal!",
                url: window.location.href,
              }).catch(() => {});
            } else {
              navigator.clipboard.writeText(window.location.origin);
              alert("Link da campanha copiado para a área de transferência!");
            }
          }}
          className="w-full bg-white text-black py-3 px-6 rounded font-mono font-bold text-sm uppercase tracking-wider border-2 border-black hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
        >
          <Share2 className="w-4 h-4" />
          <span>Compartilhar Campanha</span>
        </button>
      </div>
    </div>
  );
};
