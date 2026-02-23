import { createContext, useContext, useMemo, useState } from "react";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);

  const addOrIncrement = (product) => {
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.code === product.code);
      if (idx >= 0) {
        const next = [...prev];
        const candidateQty = next[idx].qty + 1;
        if (candidateQty > next[idx].availableStock) {
          return prev;
        }
        next[idx] = { ...next[idx], qty: candidateQty, lineTotal: candidateQty * next[idx].salePrice };
        return next;
      }
      return [
        ...prev,
        {
          ...product,
          qty: 1,
          lineTotal: product.salePrice
        }
      ];
    });
  };

  const updateQty = (code, qty) => {
    setItems((prev) =>
      prev
        .map((item) => {
          if (item.code !== code) return item;
          const safeQty = Math.max(1, Math.min(qty, item.availableStock));
          return { ...item, qty: safeQty, lineTotal: safeQty * item.salePrice };
        })
        .filter((item) => item.qty > 0)
    );
  };

  const removeItem = (code) => setItems((prev) => prev.filter((item) => item.code !== code));
  const clearCart = () => setItems([]);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0),
    [items]
  );

  const value = useMemo(
    () => ({ items, addOrIncrement, updateQty, removeItem, clearCart, total }),
    [items, total]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used inside CartProvider");
  }
  return ctx;
}
