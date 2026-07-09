import React, { useState, useEffect } from "react";
import { Navbar } from "./components/Navbar";
import { HeroBanner } from "./components/HeroBanner";
import { PizzaCatalog } from "./components/PizzaCatalog";
import { CheckoutScreen } from "./components/CheckoutScreen";
import { OrderConfirmationScreen } from "./components/OrderConfirmationScreen";
import { OrderSearchScreen } from "./components/OrderSearchScreen";
import { AdminDashboard } from "./components/AdminDashboard";
import { PIZZAS_CATALOG } from "./data/pizzas";
import { PizzaItem, Order, OrderFormData } from "./types";

export default function App() {
  const [cart, setCart] = useState<{ [id: string]: number }>({});
  const [activeTab, setActiveTab] = useState<"CATALOG" | "CHECKOUT" | "STATUS" | "ADMIN">("CATALOG");
  const [statusViewMode, setStatusViewMode] = useState<"SEARCH" | "DETAIL">("SEARCH");
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lookupId, setLookupId] = useState("");
  const [lookupError, setLookupError] = useState("");

  // Load last created order stored in local session
  useEffect(() => {
    const fetchSavedOrder = async () => {
      const savedId = localStorage.getItem("handvida_last_order_id");
      if (savedId && !currentOrder) {
        try {
          const res = await fetch(`/api/orders/${encodeURIComponent(savedId)}?t=${Date.now()}`);
          if (res.ok) {
            const data = await res.json();
            if (data.order) setCurrentOrder(data.order);
          }
        } catch (e) {}
      }
    };
    fetchSavedOrder();
  }, []);

  const handleLookupOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupId.trim()) return;
    setLookupError("");
    try {
      const formattedId = lookupId.trim().replace(/^#/, "");
      const res = await fetch(`/api/orders/${encodeURIComponent(formattedId)}?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.order) {
          setCurrentOrder(data.order);
          localStorage.setItem("handvida_last_order_id", data.order.id);
          setStatusViewMode("DETAIL");
          return;
        }
      }
      setLookupError("Pedido não encontrado. Verifique o código informado (ex: 1001).");
    } catch (err) {
      setLookupError("Erro ao consultar o pedido.");
    }
  };

  const handleUpdateQuantity = (pizza: PizzaItem, delta: number) => {
    setCart((prev) => {
      const currentQty = prev[pizza.id] || 0;
      const newQty = Math.max(0, currentQty + delta);
      if (newQty === 0) {
        const copy = { ...prev };
        delete copy[pizza.id];
        return copy;
      }
      return { ...prev, [pizza.id]: newQty };
    });
  };

  const handleNavigate = (tab: "CATALOG" | "CHECKOUT" | "STATUS" | "ADMIN") => {
    setActiveTab(tab);
    if (tab === "STATUS") {
      setStatusViewMode("SEARCH");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const totalCount = Object.values(cart).reduce((sum: number, qty: any) => sum + qty, 0);
  const totalAmount = Object.entries(cart).reduce((sum: number, [id, qty]: [string, any]) => {
    const p = PIZZAS_CATALOG.find((item) => item.id === id);
    return sum + (p ? p.price * qty : 0);
  }, 0);

  const handleConfirmOrder = async (formData: OrderFormData) => {
    setIsSubmitting(true);
    try {
      const itemsPayload = Object.entries(cart).map(([id, qty]) => {
        const pizza = PIZZAS_CATALOG.find((p) => p.id === id)!;
        return {
          name: pizza.name,
          quantity: qty,
          price: pizza.price,
          category: pizza.category,
        };
      });

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          items: itemsPayload,
          total: totalAmount,
        }),
      });

      const data = await res.json();
      if (data.order) {
        setCurrentOrder(data.order);
        localStorage.setItem("handvida_last_order_id", data.order.id);
        setCart({}); // Clear cart after order
        setActiveTab("STATUS");
        setStatusViewMode("DETAIL");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (e) {
      alert("Houve um erro ao processar o pedido. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSimulatePayment = async (orderId: string) => {
    try {
      const res = await fetch(`/api/payment/simulate-pix-approval/${encodeURIComponent(orderId)}`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.order) {
        setCurrentOrder(data.order);
      }
    } catch (e) {}
  };

  return (
    <div className="min-h-screen bg-surface-bg flex flex-col justify-between selection:bg-secondary-cyan selection:text-black">
      {/* Navbar */}
      <Navbar
        cartCount={totalCount}
        totalAmount={totalAmount}
        activeTab={activeTab}
        onNavigate={handleNavigate}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 pt-6 pb-12">
        {activeTab === "CATALOG" && (
          <>
            <HeroBanner />
            <PizzaCatalog
              cart={cart}
              onUpdateQuantity={handleUpdateQuantity}
              onCheckout={() => handleNavigate("CHECKOUT")}
            />
          </>
        )}

        {activeTab === "CHECKOUT" && (
          <CheckoutScreen
            cart={cart}
            pizzas={PIZZAS_CATALOG}
            onBack={() => handleNavigate("CATALOG")}
            onUpdateQuantity={handleUpdateQuantity}
            onConfirmOrder={handleConfirmOrder}
            isSubmitting={isSubmitting}
          />
        )}

        {activeTab === "STATUS" && statusViewMode === "DETAIL" && currentOrder && (
          <OrderConfirmationScreen
            order={currentOrder}
            onHome={() => handleNavigate("CATALOG")}
            onSimulatePayment={handleSimulatePayment}
            onNewOrder={() => {
              setCurrentOrder(null);
              setCart({});
              handleNavigate("CATALOG");
            }}
            onOrderUpdated={(updated) => setCurrentOrder(updated)}
            onSearchOrders={() => {
              setStatusViewMode("SEARCH");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}

        {activeTab === "STATUS" && (statusViewMode === "SEARCH" || !currentOrder) && (
          <OrderSearchScreen
            currentOrder={currentOrder}
            onSelectOrder={(order) => {
              setCurrentOrder(order);
              setStatusViewMode("DETAIL");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            onCatalog={() => handleNavigate("CATALOG")}
          />
        )}

        {activeTab === "ADMIN" && (
          <AdminDashboard onBack={() => handleNavigate("CATALOG")} />
        )}
      </main>
    </div>
  );
}
