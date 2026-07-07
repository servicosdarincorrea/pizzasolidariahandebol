import React, { useState } from "react";
import { Order } from "../types";
import { Search, ShoppingBag, ArrowRight, Clock, CheckCircle, AlertCircle, Calendar, ShieldCheck } from "lucide-react";

interface OrderSearchScreenProps {
  currentOrder: Order | null;
  onSelectOrder: (order: Order) => void;
  onCatalog: () => void;
}

export const OrderSearchScreen: React.FC<OrderSearchScreenProps> = ({
  currentOrder,
  onSelectOrder,
  onCatalog,
}) => {
  const [searchValue, setSearchValue] = useState("");
  const [results, setResults] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const formatCpf = (val: string) => {
    const cleaned = val.replace(/\D/g, "");
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6) return `${cleaned.slice(0, 3)}.${cleaned.slice(3)}`;
    if (cleaned.length <= 9) return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6)}`;
    return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9, 11)}`;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    setSearchValue(formatCpf(e.target.value));
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchValue.trim()) {
      setError("Informe o número do CPF para buscar.");
      return;
    }

    setLoading(true);
    setError("");
    setResults(null);

    try {
      const queryParam = `cpf=${encodeURIComponent(searchValue)}`;
      const res = await fetch(`/api/orders?${queryParam}`);
      
      if (!res.ok) {
        throw new Error("Erro ao buscar pedidos no servidor.");
      }

      const data = await res.json();
      const foundOrders: Order[] = data.orders || [];

      if (foundOrders.length === 0) {
        setError("Nenhum pedido encontrado com este CPF. Verifique se digitou corretamente o mesmo CPF informado na compra.");
        setResults([]);
      } else {
        // Sort descending by order id or creation time
        foundOrders.sort((a, b) => {
          const idA = parseInt(String(a.id).replace(/\D/g, "")) || 0;
          const idB = parseInt(String(b.id).replace(/\D/g, "")) || 0;
          return idB - idA;
        });
        setResults(foundOrders);
      }
    } catch (err) {
      setError("Ocorreu um erro ao conectar com o servidor. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-4">
      {/* Main Card */}
      <div className="bg-white border-2 border-black shadow-brutal p-6 sm:p-8 rounded">
        <div className="text-center mb-8 border-b-2 border-black pb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-secondary-cyan border-2 border-black rounded-full shadow-brutal-sm mb-3">
            <Search className="w-7 h-7 text-black" />
          </div>
          <h1 className="font-display font-black text-2xl sm:text-3xl text-black uppercase tracking-tight mb-2">
            CONSULTAR MEUS PEDIDOS
          </h1>
          <p className="font-sans text-gray-600 text-sm max-w-lg mx-auto">
            Informe seu CPF para localizar todas as compras vinculadas a você na campanha Pizza Solidária.
          </p>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="space-y-4 mb-8">
          <div>
            <label className="block font-mono font-bold text-xs uppercase tracking-wider text-gray-700 mb-1.5">
              NÚMERO DO CPF INFORMADO NA COMPRA *
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Ex: 000.000.000-00"
                maxLength={14}
                value={searchValue}
                onChange={handleInputChange}
                className="flex-1 bg-white px-4 py-3 border-2 border-black font-mono text-base focus:outline-none focus:bg-cyan-50/50 shadow-brutal-sm transition-all"
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-primary-deep text-white px-6 py-3 rounded font-mono font-bold text-sm uppercase border-2 border-black shadow-brutal-sm hover:bg-primary-deep/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Search className="w-4 h-4" />
                <span>{loading ? "BUSCANDO..." : "BUSCAR PEDIDOS"}</span>
              </button>
            </div>
            <span className="font-sans text-xs text-gray-500 mt-1.5 block">
              * Um mesmo CPF pode possuir múltiplos pedidos registrados na campanha.
            </span>
          </div>

          {error && (
            <div className="bg-red-50 border-2 border-tertiary-red p-3.5 rounded flex items-start gap-2.5 text-tertiary-red font-mono text-xs font-bold">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </form>

        {/* Results Section */}
        {results && results.length > 0 && (
          <div className="space-y-4 pt-4 border-t-2 border-black">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-display font-black text-base sm:text-lg uppercase text-black flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-primary-deep" />
                PEDIDOS ENCONTRADOS ({results.length})
              </h2>
              <span className="font-mono text-xs text-gray-600">
                Clique para ver detalhes
              </span>
            </div>

            <div className="space-y-3">
              {results.map((order) => (
                <div
                  key={order.id}
                  onClick={() => onSelectOrder(order)}
                  className="bg-gray-50 hover:bg-cyan-50/60 border-2 border-black p-4 rounded shadow-brutal-sm cursor-pointer transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-display font-black text-lg text-black">
                        Pedido {order.id}
                      </span>
                      <span
                        className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border border-black ${
                          order.status === "PAGO"
                            ? "bg-green-100 text-green-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {order.status === "PAGO" ? "✅ PAGO" : "⌛ AGUARDANDO"}
                      </span>
                    </div>
                    <div className="font-sans text-xs text-gray-700 flex flex-wrap gap-x-4 gap-y-1">
                      <span><strong>Cliente:</strong> {order.customerName}</span>
                      <span><strong>Itens:</strong> {order.items.reduce((sum, i) => sum + i.quantity, 0)} pizzas</span>
                    </div>
                    <div className="font-mono text-xs text-gray-500 flex items-center gap-1 pt-0.5">
                      <Calendar className="w-3.5 h-3.5 text-gray-600" />
                      <span>Retirada: 21 de Agosto das 14h às 17h</span>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-0 border-gray-200">
                    <span className="font-display font-black text-lg text-primary-deep">
                      R$ {order.total.toFixed(2).replace(".", ",")}
                    </span>
                    <span className="font-mono font-bold text-xs text-secondary-cyan bg-black px-2.5 py-1 rounded flex items-center gap-1 mt-1">
                      VER COMPLETO <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Back to catalog button */}
        <div className="text-center mt-8 pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={onCatalog}
            className="font-mono font-bold text-xs text-gray-600 hover:text-black uppercase underline transition-colors"
          >
            ← Voltar para o Catálogo de Pizzas
          </button>
        </div>
      </div>
    </div>
  );
};
