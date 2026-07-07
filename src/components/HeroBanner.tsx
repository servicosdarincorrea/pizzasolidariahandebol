import React from "react";

export const HeroBanner: React.FC = () => {
  return (
    <div className="bg-secondary-cyan border-brutal shadow-brutal rounded p-5 sm:p-7 mb-8 relative overflow-hidden">
      {/* Decorative logo accent */}
      <div className="absolute -right-4 -bottom-4 opacity-15 pointer-events-none">
        <img src="/HAND_VIDA.png" alt="Hand Vida" className="w-48 h-48 sm:w-56 sm:h-56 object-contain" />
      </div>

      <div className="relative z-10">
        {/* Badge */}
        <div 
          className="inline-block text-white px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider mb-3 border-2 border-black shadow-sm"
          style={{ backgroundColor: "#b40000" }}
        >
          PIZZA SOLIDÁRIA
        </div>

        {/* Title */}
        <h1 className="font-display font-black text-2xl sm:text-3xl md:text-4xl text-black uppercase tracking-tight leading-none mb-3">
          Colégio Água Viva rumo à Argentina.
        </h1>

        {/* Subtitle / Description */}
        <p className="text-black/90 font-medium text-sm sm:text-base leading-relaxed max-w-2xl mb-4">
          Saboreie uma pizza deliciosa e ajude nossos atletas a alcançarem novas competições.
          <strong className="block font-bold bg-white/60 px-2.5 py-1 mt-2.5 rounded border border-black/20 w-fit">
            100% da renda revertida para o Handebol.
          </strong>
        </p>

      </div>
    </div>
  );
};
