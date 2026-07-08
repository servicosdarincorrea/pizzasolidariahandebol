import React, { useState } from "react";
import { PizzaItem, OrderFormData } from "../types";
import { 
  ArrowLeft, User, ShoppingBag, FileText, Mail, 
  MessageSquare, QrCode, CreditCard, ArrowRight, Trash2 
} from "lucide-react";

interface CheckoutScreenProps {
  cart: { [id: string]: number };
  pizzas: PizzaItem[];
  onBack: () => void;
  onUpdateQuantity: (pizza: PizzaItem, delta: number) => void;
  onConfirmOrder: (formData: OrderFormData) => Promise<void>;
  isSubmitting: boolean;
}

export const CheckoutScreen: React.FC<CheckoutScreenProps> = ({
  cart,
  pizzas,
  onBack,
  onUpdateQuantity,
  onConfirmOrder,
  isSubmitting,
}) => {
  const [formData, setFormData] = useState<OrderFormData>({
    customerName: "",
    cpf: "",
    studentTurma: "",
    email: "",
    studentName: "",
    whatsapp: "",
    paymentMethod: "PIX",
  });

  const [cardData, setCardData] = useState<{
    cardNumber: string;
    cardHolder: string;
    expiryDate: string;
    cvv: string;
    installments: string;
    cardType: "CREDITO" | "DEBITO";
  }>({
    cardNumber: "",
    cardHolder: "",
    expiryDate: "",
    cvv: "",
    installments: "1",
    cardType: "CREDITO",
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const cartItems = (Object.entries(cart) as [string, any][])
    .filter(([_, qty]) => qty > 0)
    .map(([id, qty]) => {
      const pizza = pizzas.find((p) => p.id === id)!;
      return { pizza, quantity: qty as number };
    });

  const totalAmount = cartItems.reduce((acc: number, item) => acc + item.pizza.price * item.quantity, 0);

  const formatPhone = (val: string) => {
    const cleaned = val.replace(/\D/g, "");
    if (cleaned.length <= 2) return cleaned;
    if (cleaned.length <= 7) return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`;
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7, 11)}`;
  };

  const formatCpf = (val: string) => {
    const cleaned = val.replace(/\D/g, "");
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6) return `${cleaned.slice(0, 3)}.${cleaned.slice(3)}`;
    if (cleaned.length <= 9) return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6)}`;
    return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9, 11)}`;
  };

  const formatCardNumber = (val: string) => {
    const cleaned = val.replace(/\D/g, "");
    const match = cleaned.match(/.{1,4}/g);
    return match ? match.join(" ").slice(0, 19) : cleaned;
  };

  const formatExpiryDate = (val: string) => {
    const cleaned = val.replace(/\D/g, "");
    if (cleaned.length <= 2) return cleaned;
    return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, whatsapp: formatPhone(e.target.value) });
    if (errors.whatsapp) setErrors({ ...errors, whatsapp: "" });
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, cpf: formatCpf(e.target.value) });
    if (errors.cpf) setErrors({ ...errors, cpf: "" });
  };

  const validate = () => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.customerName.trim()) newErrors.customerName = "Informe seu nome completo.";
    const cleanCpf = (formData.cpf || "").replace(/\D/g, "");
    if (!formData.cpf?.trim() || cleanCpf.length < 11) newErrors.cpf = "Informe um CPF válido (11 dígitos).";
    if (!formData.whatsapp.trim() || formData.whatsapp.length < 13) newErrors.whatsapp = "Informe um WhatsApp válido.";
    if (cartItems.length === 0) newErrors.cart = "Seu carrinho está vazio. Adicione pizzas antes de finalizar.";
    
    if (formData.paymentMethod === "CARTAO") {
      const cleanNum = cardData.cardNumber.replace(/\D/g, "");
      if (cleanNum.length < 13) newErrors.cardNumber = "Número do cartão deve conter 13 a 16 dígitos.";
      if (!cardData.cardHolder.trim()) newErrors.cardHolder = "Informe o nome como está no cartão.";
      if (cardData.expiryDate.length < 5) newErrors.expiryDate = "Informe a validade (MM/AA).";
      if (cardData.cvv.replace(/\D/g, "").length < 3) newErrors.cvv = "CVV inválido (3 ou 4 dígitos).";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onConfirmOrder({
      ...formData,
      cardData: formData.paymentMethod === "CARTAO" ? cardData : undefined,
    });
  };

  return (
    <div className="max-w-xl mx-auto pb-32 pt-4 px-4">
      {/* Top Header matching screenshot */}
      <div className="bg-primary-deep text-white p-4 rounded border-2 border-black shadow-brutal flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 font-display font-bold text-lg hover:text-secondary-cyan transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Finalizar Compra</span>
        </button>
        <div className="bg-secondary-cyan text-black p-1.5 rounded-full border-2 border-black shadow-sm">
          <User className="w-5 h-5" />
        </div>
      </div>

      {errors.cart && (
        <div className="bg-tertiary-red text-white p-4 rounded border-2 border-black shadow-brutal mb-6 font-mono font-bold text-sm">
          ⚠️ {errors.cart}
        </div>
      )}

      {/* 1. RESUMO DO PEDIDO */}
      <div className="mb-8">
        <h2 className="font-display font-black text-lg uppercase tracking-wider text-black flex items-center gap-2 mb-3">
          <ShoppingBag className="w-5 h-5 text-primary-deep" />
          RESUMO DO PEDIDO
        </h2>

        <div className="bg-white border-2 border-black shadow-brutal p-5 rounded">
          {cartItems.length === 0 ? (
            <div className="text-center py-6 text-gray-500 font-sans">
              <p className="mb-3 font-medium">Nenhuma pizza no carrinho no momento.</p>
              <button
                onClick={onBack}
                className="bg-secondary-cyan text-black px-4 py-2 rounded font-mono font-bold text-xs uppercase border-2 border-black shadow-brutal-sm"
              >
                Voltar e Adicionadas Pizzas
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {cartItems.map(({ pizza, quantity }) => (
                <div key={pizza.id} className="flex items-start justify-between gap-3 border-b border-gray-200 pb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-black text-black">
                        {quantity}x {pizza.name.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 font-sans mt-0.5 line-clamp-1">
                      {pizza.description}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span className="font-mono font-bold text-sm text-primary-deep whitespace-nowrap">
                      R$ {(pizza.price * quantity).toFixed(2).replace(".", ",")}
                    </span>
                    <button
                      onClick={() => onUpdateQuantity(pizza, -1)}
                      className="text-gray-400 hover:text-tertiary-red text-xs font-mono flex items-center gap-1"
                      title="Remover uma unidade"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Highlighted Total Box matching screenshot */}
          <div className="mt-4 bg-secondary-cyan border-2 border-black p-3.5 flex items-center justify-between font-display font-black text-xl text-black shadow-brutal-sm">
            <span>TOTAL</span>
            <span>R$ {totalAmount.toFixed(2).replace(".", ",")}</span>
          </div>
        </div>
      </div>

      {/* 2. DADOS DE IDENTIFICAÇÃO FORM */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <h2 className="font-display font-black text-lg uppercase tracking-wider text-black flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-primary-deep" />
            DADOS DE IDENTIFICAÇÃO
          </h2>

          <div className="space-y-4">
            {/* 1. Nome Completo */}
            <div>
              <label className="block font-mono font-bold text-xs uppercase tracking-wider text-gray-700 mb-1">
                NOME COMPLETO *
              </label>
              <input
                type="text"
                placeholder="Ex: João Silva"
                value={formData.customerName}
                onChange={(e) => {
                  setFormData({ ...formData, customerName: e.target.value });
                  if (errors.customerName) setErrors({ ...errors, customerName: "" });
                }}
                className={`w-full bg-white px-4 py-3 border-2 border-black font-sans text-base focus:outline-none focus:bg-cyan-50/50 shadow-brutal-sm transition-all ${
                  errors.customerName ? "border-tertiary-red bg-red-50" : ""
                }`}
              />
              {errors.customerName && (
                <span className="text-tertiary-red font-mono text-xs font-bold mt-1 block">
                  {errors.customerName}
                </span>
              )}
            </div>

            {/* 2. CPF */}
            <div>
              <label className="block font-mono font-bold text-xs uppercase tracking-wider text-gray-700 mb-1">
                CPF *
              </label>
              <input
                type="text"
                placeholder="000.000.000-00"
                maxLength={14}
                value={formData.cpf || ""}
                onChange={handleCpfChange}
                className={`w-full bg-white px-4 py-3 border-2 border-black font-mono text-base focus:outline-none focus:bg-cyan-50/50 shadow-brutal-sm transition-all ${
                  errors.cpf ? "border-tertiary-red bg-red-50" : ""
                }`}
              />
              {errors.cpf && (
                <span className="text-tertiary-red font-mono text-xs font-bold mt-1 block">
                  {errors.cpf}
                </span>
              )}
            </div>

            {/* 3. WhatsApp */}
            <div>
              <label className="block font-mono font-bold text-xs uppercase tracking-wider text-gray-700 mb-1">
                WHATSAPP *
              </label>
              <div className="relative">
                <input
                  type="tel"
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                  value={formData.whatsapp}
                  onChange={handlePhoneChange}
                  className={`w-full bg-white pl-4 pr-11 py-3 border-2 border-black font-mono text-base focus:outline-none focus:bg-cyan-50/50 shadow-brutal-sm transition-all ${
                    errors.whatsapp ? "border-tertiary-red bg-red-50" : ""
                  }`}
                />
                <MessageSquare className="w-5 h-5 absolute right-3.5 top-3.5 text-primary-deep pointer-events-none" />
              </div>
              {errors.whatsapp && (
                <span className="text-tertiary-red font-mono text-xs font-bold mt-1 block">
                  {errors.whatsapp}
                </span>
              )}
            </div>

            {/* 4. Email */}
            <div>
              <label className="block font-mono font-bold text-xs uppercase tracking-wider text-gray-700 mb-1">
                EMAIL (PARA CONFIRMAÇÃO DO PEDIDO)
              </label>
              <div className="relative">
                <input
                  type="email"
                  placeholder="exemplo@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-white pl-4 pr-11 py-3 border-2 border-black font-sans text-base focus:outline-none focus:bg-cyan-50/50 shadow-brutal-sm transition-all"
                />
                <Mail className="w-5 h-5 absolute right-3.5 top-3.5 text-primary-deep pointer-events-none" />
              </div>
            </div>

            {/* 5. Nome do Aluno Vendedor */}
            <div>
              <label className="block font-mono font-bold text-xs uppercase tracking-wider text-gray-700 mb-1">
                NOME DO ALUNO
              </label>
              <input
                type="text"
                placeholder="Ex: Maria Silva"
                value={formData.studentName}
                onChange={(e) => setFormData({ ...formData, studentName: e.target.value })}
                className="w-full bg-white px-4 py-3 border-2 border-black font-sans text-base focus:outline-none focus:bg-cyan-50/50 shadow-brutal-sm transition-all"
              />
            </div>

            {/* 6. Série / Turma */}
            <div>
              <label className="block font-mono font-bold text-xs uppercase tracking-wider text-gray-700 mb-1">
                SÉRIE/TURMA OU VÍNCULO COM A ESCOLA
              </label>
              <input
                type="text"
                placeholder="Ex: 5º Ano A / Ex-aluno / Amigo"
                value={formData.studentTurma}
                onChange={(e) => setFormData({ ...formData, studentTurma: e.target.value })}
                className="w-full bg-white px-4 py-3 border-2 border-black font-sans text-base focus:outline-none focus:bg-cyan-50/50 shadow-brutal-sm transition-all"
              />
            </div>
          </div>
        </div>

        {/* 3. MÉTODO DE PAGAMENTO */}
        <div className="pt-2">
          <label className="block font-mono font-bold text-xs uppercase tracking-wider text-gray-700 mb-2">
            MÉTODO DE PAGAMENTO (MERCADO PAGO)
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, paymentMethod: "PIX" })}
              className={`py-4 px-3 border-2 border-black font-display font-black text-base flex flex-col items-center justify-center gap-2 transition-all shadow-brutal-sm ${
                formData.paymentMethod === "PIX"
                  ? "bg-secondary-cyan text-black"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <QrCode className="w-6 h-6" />
              <span>PIX</span>
            </button>

            <button
              type="button"
              onClick={() => setFormData({ ...formData, paymentMethod: "CARTAO" })}
              className={`py-4 px-3 border-2 border-black font-display font-black text-base flex flex-col items-center justify-center gap-2 transition-all shadow-brutal-sm ${
                formData.paymentMethod === "CARTAO"
                  ? "bg-secondary-cyan text-black"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <CreditCard className="w-6 h-6" />
              <span>CARTÃO</span>
            </button>
          </div>

          {/* Credit Card Form Fields */}
          {formData.paymentMethod === "CARTAO" && (
            <div className="mt-4 bg-white border-2 border-black p-5 rounded shadow-brutal space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b-2 border-black pb-2">
                <span className="font-display font-black text-sm uppercase text-black flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-primary-deep" />
                  DADOS DO CARTÃO DE CRÉDITO
                </span>
                <span className="bg-green-100 text-green-800 border border-black px-2 py-0.5 rounded font-mono text-[10px] font-bold">
                  🔒 CRIPTOGRAFADO SSL
                </span>
              </div>

              {/* Número do Cartão */}
              <div>
                <label className="block font-mono font-bold text-xs uppercase tracking-wider text-gray-700 mb-1">
                  NÚMERO DO CARTÃO *
                </label>
                <input
                  type="text"
                  placeholder="0000 0000 0000 0000"
                  maxLength={19}
                  value={cardData.cardNumber}
                  onChange={(e) => {
                    setCardData({ ...cardData, cardNumber: formatCardNumber(e.target.value) });
                    if (errors.cardNumber) setErrors({ ...errors, cardNumber: "" });
                  }}
                  className={`w-full bg-white px-4 py-3 border-2 border-black font-mono text-base focus:outline-none focus:bg-cyan-50/50 shadow-brutal-sm transition-all ${
                    errors.cardNumber ? "border-tertiary-red bg-red-50" : ""
                  }`}
                />
                {errors.cardNumber && (
                  <span className="text-tertiary-red font-mono text-xs font-bold mt-1 block">
                    {errors.cardNumber}
                  </span>
                )}
              </div>

              {/* Nome do Titular */}
              <div>
                <label className="block font-mono font-bold text-xs uppercase tracking-wider text-gray-700 mb-1">
                  NOME IMPRESSO NO CARTÃO *
                </label>
                <input
                  type="text"
                  placeholder="EX: MARIA A SILVA"
                  value={cardData.cardHolder}
                  onChange={(e) => {
                    setCardData({ ...cardData, cardHolder: e.target.value.toUpperCase() });
                    if (errors.cardHolder) setErrors({ ...errors, cardHolder: "" });
                  }}
                  className={`w-full bg-white px-4 py-3 border-2 border-black font-mono uppercase text-base focus:outline-none focus:bg-cyan-50/50 shadow-brutal-sm transition-all ${
                    errors.cardHolder ? "border-tertiary-red bg-red-50" : ""
                  }`}
                />
                {errors.cardHolder && (
                  <span className="text-tertiary-red font-mono text-xs font-bold mt-1 block">
                    {errors.cardHolder}
                  </span>
                )}
              </div>

              {/* Validade & CVV */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono font-bold text-xs uppercase tracking-wider text-gray-700 mb-1">
                    VALIDADE (MM/AA) *
                  </label>
                  <input
                    type="text"
                    placeholder="MM/AA"
                    maxLength={5}
                    value={cardData.expiryDate}
                    onChange={(e) => {
                      setCardData({ ...cardData, expiryDate: formatExpiryDate(e.target.value) });
                      if (errors.expiryDate) setErrors({ ...errors, expiryDate: "" });
                    }}
                    className={`w-full bg-white px-4 py-3 border-2 border-black font-mono text-base text-center focus:outline-none focus:bg-cyan-50/50 shadow-brutal-sm transition-all ${
                      errors.expiryDate ? "border-tertiary-red bg-red-50" : ""
                    }`}
                  />
                  {errors.expiryDate && (
                    <span className="text-tertiary-red font-mono text-xs font-bold mt-1 block">
                      {errors.expiryDate}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block font-mono font-bold text-xs uppercase tracking-wider text-gray-700 mb-1">
                    CVV (CÓDIGO) *
                  </label>
                  <input
                    type="password"
                    placeholder="123"
                    maxLength={4}
                    value={cardData.cvv}
                    onChange={(e) => {
                      setCardData({ ...cardData, cvv: e.target.value.replace(/\D/g, "") });
                      if (errors.cvv) setErrors({ ...errors, cvv: "" });
                    }}
                    className={`w-full bg-white px-4 py-3 border-2 border-black font-mono text-base text-center focus:outline-none focus:bg-cyan-50/50 shadow-brutal-sm transition-all ${
                      errors.cvv ? "border-tertiary-red bg-red-50" : ""
                    }`}
                  />
                  {errors.cvv && (
                    <span className="text-tertiary-red font-mono text-xs font-bold mt-1 block">
                      {errors.cvv}
                    </span>
                  )}
                </div>
              </div>

              {/* Tipo de Cartão e Condição à Vista */}
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block font-mono font-bold text-xs uppercase tracking-wider text-gray-700 mb-2">
                    FUNÇÃO DO CARTÃO *
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setCardData({ ...cardData, cardType: "CREDITO", installments: "1" })}
                      className={`py-3 px-3 border-2 border-black font-mono font-bold text-sm uppercase transition-all shadow-brutal-sm ${
                        cardData.cardType === "CREDITO"
                          ? "bg-primary-deep text-white"
                          : "bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      CRÉDITO (À VISTA)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardData({ ...cardData, cardType: "DEBITO", installments: "1" })}
                      className={`py-3 px-3 border-2 border-black font-mono font-bold text-sm uppercase transition-all shadow-brutal-sm ${
                        cardData.cardType === "DEBITO"
                          ? "bg-primary-deep text-white"
                          : "bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      DÉBITO (À VISTA)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-mono font-bold text-xs uppercase tracking-wider text-gray-700 mb-1">
                    CONDIÇÃO DE PAGAMENTO *
                  </label>
                  <div className="w-full bg-gray-100 px-4 py-3 border-2 border-black font-mono text-sm font-bold text-gray-800 shadow-brutal-sm flex items-center justify-between">
                    <span>Pagamento à vista (Sem parcelamento)</span>
                    <span className="text-primary-deep">1x de R$ {totalAmount.toFixed(2).replace(".", ",")}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Charity Banner matching screenshot */}
          <div className="mt-4 bg-[#1e1e1e] text-white py-2 px-4 text-center font-mono font-bold text-xs uppercase tracking-widest border-2 border-black -rotate-1 shadow-sm">
            100% DA RENDA PARA CARIDADE E ATLETAS
          </div>
        </div>

        {/* 4. CONFIRMAR PEDIDO BUTTON */}
        <div className="pt-3">
          <button
            type="submit"
            disabled={isSubmitting || cartItems.length === 0}
            className="w-full bg-secondary-cyan text-black py-4 px-6 rounded font-mono font-bold text-base sm:text-lg uppercase tracking-wider border-2 border-black shadow-brutal hover:bg-secondary-cyan/90 active:translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <span className="animate-pulse">PROCESSANDO E SALVANDO NA PLANILHA...</span>
            ) : (
              <>
                <span>CONFIRMAR PEDIDO</span>
                <ArrowRight className="w-6 h-6" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
