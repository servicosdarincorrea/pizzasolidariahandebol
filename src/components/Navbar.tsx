import React from "react";
import { ShoppingCart, Lock, Pizza, CheckCircle2 } from "lucide-react";

interface NavbarProps {
  cartCount: number;
  totalAmount?: number;
  activeTab: "CATALOG" | "CHECKOUT" | "STATUS" | "ADMIN";
  onNavigate: (tab: "CATALOG" | "CHECKOUT" | "STATUS" | "ADMIN") => void;
}

export const Navbar: React.FC<NavbarProps> = ({ cartCount, totalAmount = 0, activeTab, onNavigate }) => {
  return (
    <header className="bg-primary-deep text-white border-b-2 border-black sticky top-0 z-40 shadow-md">
      <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Logos & Brand */}
        <div 
          onClick={() => onNavigate("CATALOG")}
          className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group w-full sm:w-auto justify-between sm:justify-start"
        >
          <div className="flex items-center gap-2.5">
            <img 
              src="/logo-branca-horizontal.png" 
              alt="Colégio Água Viva" 
              className="h-10 sm:h-12 w-auto object-contain group-hover:scale-105 transition-transform" 
            />
          </div>
        </div>

        {/* Action & Navigation Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto justify-end flex-wrap">
          <button
            onClick={() => onNavigate("CATALOG")}
            className={`px-3 py-1.5 rounded text-xs sm:text-sm font-mono font-bold border-2 border-black transition-all flex items-center gap-1.5 ${
              activeTab === "CATALOG"
                ? "bg-secondary-cyan text-black shadow-brutal-sm"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            <Pizza className="w-4 h-4" />
            <span>CARDÁPIO</span>
          </button>

          <button
            onClick={() => onNavigate("CHECKOUT")}
            className={`px-3 py-1.5 rounded text-xs sm:text-sm font-mono font-bold border-2 border-black transition-all flex items-center gap-1.5 relative ${
              activeTab === "CHECKOUT" || cartCount > 0
                ? "bg-secondary-cyan text-black shadow-brutal-sm font-black"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
            aria-label="Ver Carrinho"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>CARRINHO</span>
            {cartCount > 0 && (
              <span className="bg-tertiary-red text-white font-mono font-bold text-[11px] px-1.5 py-0.5 rounded-full border border-black flex items-center justify-center shadow-sm">
                {cartCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onNavigate("STATUS")}
            className={`px-3 py-1.5 rounded text-xs sm:text-sm font-mono font-bold border-2 border-black transition-all flex items-center gap-1.5 ${
              activeTab === "STATUS"
                ? "bg-secondary-cyan text-black shadow-brutal-sm"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>PEDIDOS</span>
          </button>

          <button
            onClick={() => onNavigate("ADMIN")}
            className={`px-2.5 py-1.5 rounded text-xs sm:text-sm font-mono font-bold border-2 border-black transition-all flex items-center gap-1.5 ${
              activeTab === "ADMIN"
                ? "bg-tertiary-red text-white shadow-brutal-sm"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
            title="Acessar painel restrito de pedidos"
          >
            <Lock className="w-3.5 h-3.5 text-secondary-cyan" />
            <span className="hidden md:inline">RESTRITO</span>
          </button>
        </div>
      </div>
    </header>
  );
};
