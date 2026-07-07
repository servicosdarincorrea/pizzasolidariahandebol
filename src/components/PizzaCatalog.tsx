import React, { useState } from "react";
import { PizzaItem } from "../types";
import { PIZZAS_CATALOG } from "../data/pizzas";
import { Plus, Minus, Check } from "lucide-react";

interface PizzaCatalogProps {
  cart: { [id: string]: number };
  onUpdateQuantity: (pizza: PizzaItem, delta: number) => void;
  onCheckout?: () => void;
}

export const PizzaCatalog: React.FC<PizzaCatalogProps> = ({ cart, onUpdateQuantity, onCheckout }) => {
  const [filter, setFilter] = useState<"ALL" | "SALGADA" | "DOCE">("ALL");
  const [addedAnimation, setAddedAnimation] = useState<{ [id: string]: boolean }>({});

  const totalCount = (Object.values(cart) as number[]).reduce((sum, qty) => sum + qty, 0);

  const filteredPizzas = PIZZAS_CATALOG.filter((p) => {
    if (filter === "ALL") return true;
    return p.category === filter;
  });

  const handleAdd = (pizza: PizzaItem) => {
    onUpdateQuantity(pizza, 1);
    setAddedAnimation((prev) => ({ ...prev, [pizza.id]: true }));
    setTimeout(() => {
      setAddedAnimation((prev) => ({ ...prev, [pizza.id]: false }));
    }, 600);
  };

  return (
    <section className="mb-12">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-black pb-4 mb-6">
        <h2 className="font-display font-black text-2xl sm:text-3xl uppercase tracking-tight text-black flex items-center gap-2">
          NOSSAS PIZZAS
        </h2>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="font-mono font-bold text-sm bg-primary-deep text-white px-3 py-1.5 rounded border-2 border-black shadow-brutal-sm">
            R$ 50,00 Unid.
          </span>
        </div>
      </div>

      {/* Campaign Flavors Notice */}
      <div className="bg-cyan-50 border-2 border-black p-3 rounded mb-6 flex items-center justify-between gap-2 shadow-brutal-sm">
        <span className="font-mono font-bold text-xs uppercase text-primary-deep">
          🍕 SABORES OFICIAIS DA CAMPANHA: MUÇARELA E CALABRESA
        </span>
        <span className="bg-black text-white px-2.5 py-0.5 rounded text-[11px] font-mono font-bold">
          2 SABORES
        </span>
      </div>

      {/* Pizza Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredPizzas.map((pizza) => {
          const quantity = cart[pizza.id] || 0;
          const isAnimating = addedAnimation[pizza.id];

          return (
            <div
              key={pizza.id}
              className="bg-white border-brutal shadow-brutal rounded p-5 flex flex-col justify-between relative hover:translate-y-[-2px] transition-transform"
            >
              <div>
                {/* Image Container */}
                <div className="relative mb-4 bg-amber-50/50 rounded border-2 border-black/10 overflow-hidden pt-4 pb-2 flex items-center justify-center min-h-[220px]">
                  <img
                    src={pizza.image}
                    alt={pizza.name}
                    className="w-48 h-48 sm:w-52 sm:h-52 object-cover rounded-full border-4 border-black shadow-md hover:scale-105 transition-transform duration-300"
                  />
                </div>

                {/* Title & Price */}
                <div className="flex items-baseline justify-between gap-2 border-b-2 border-black/10 pb-2 mb-2">
                  <h3 className="font-display font-black text-xl sm:text-2xl text-black">
                    {pizza.name}
                  </h3>
                  <span className="font-mono font-bold text-lg sm:text-xl text-primary-deep whitespace-nowrap">
                    R$ {pizza.price.toFixed(2).replace(".", ",")}
                  </span>
                </div>

                {/* Description */}
                <p className="text-gray-600 text-sm leading-relaxed mb-6 font-sans">
                  {pizza.description}
                </p>
              </div>

              {/* Quantity Stepper & Add Button */}
              <div className="flex items-center gap-3 pt-2">
                {/* Stepper */}
                <div className="flex items-center border-2 border-black rounded bg-white overflow-hidden shadow-brutal-sm">
                  <button
                    onClick={() => onUpdateQuantity(pizza, -1)}
                    disabled={quantity === 0}
                    aria-label={`Remover uma ${pizza.name}`}
                    className="w-10 h-10 flex items-center justify-center font-mono font-bold text-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-gray-100 transition-colors border-r-2 border-black"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-10 h-10 flex items-center justify-center font-mono font-bold text-base text-black bg-white">
                    {quantity}
                  </span>
                  <button
                    onClick={() => onUpdateQuantity(pizza, 1)}
                    aria-label={`Adicionar mais uma ${pizza.name}`}
                    className="w-10 h-10 flex items-center justify-center font-mono font-bold text-lg bg-gray-100 hover:bg-gray-200 transition-colors border-l-2 border-black"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Add Button */}
                <button
                  onClick={() => handleAdd(pizza)}
                  className={`flex-1 h-10 px-4 rounded font-mono font-bold text-xs sm:text-sm uppercase tracking-wider border-2 border-black shadow-brutal-sm transition-all flex items-center justify-center gap-2 ${
                    isAnimating
                      ? "bg-green-500 text-white"
                      : "bg-secondary-cyan text-black hover:bg-secondary-cyan/90 active:translate-y-0.5"
                  }`}
                >
                  {isAnimating ? (
                    <>
                      <Check className="w-4 h-4" /> ADICIONADO!
                    </>
                  ) : (
                    "ADICIONAR"
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {totalCount > 0 && onCheckout && (
        <div className="mt-8 bg-primary-deep text-white border-2 border-black p-5 sm:p-6 rounded shadow-brutal flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-secondary-cyan block font-bold mb-1">
              🍕 SEU PEDIDO EM ANDAMENTO
            </span>
            <span className="font-display font-black text-xl sm:text-2xl text-white">
              {totalCount} {totalCount === 1 ? "pizza selecionada" : "pizzas selecionadas"} — R$ {(totalCount * 50).toFixed(2).replace(".", ",")}
            </span>
          </div>
          <button
            onClick={onCheckout}
            className="w-full sm:w-auto bg-secondary-cyan text-black px-8 py-3.5 rounded font-mono font-bold text-sm sm:text-base uppercase tracking-wider border-2 border-black shadow-brutal-sm hover:bg-secondary-cyan/90 hover:scale-105 transition-all flex items-center justify-center gap-2"
          >
            <span>FINALIZAR COMPRA ➔</span>
          </button>
        </div>
      )}
    </section>
  );
};
