import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useState } from "react";

import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { generateAndShareInvoice } from "../utils/invoice";

function money(v) {
  return `$${Number(v || 0).toFixed(2)}`;
}

export default function CartScreen({ navigation }) {
  const { token } = useAuth();
  const { items, updateQty, removeItem, clearCart, total } = useCart();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const checkout = async () => {
    if (!items.length) {
      Alert.alert("Carrito vacio", "Escanea productos para vender.");
      return;
    }

    try {
      setLoading(true);
      const payload = {
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        items: items.map((i) => ({ code: i.code, qty: i.qty }))
      };

      const sale = await api.checkout(token, payload);
      await generateAndShareInvoice({
        sale,
        customerName,
        items: items.map((it) => ({
          productName: it.productName,
          salePrice: it.salePrice,
          qty: it.qty
        })),
        total
      });

      clearCart();
      setCustomerName("");
      setCustomerPhone("");
      Alert.alert("Venta confirmada", `Ticket #${sale.ticket_number}`);
    } catch (err) {
      Alert.alert("Error de venta", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Carrito de venta</Text>

      <TouchableOpacity
        style={styles.scanButton}
        onPress={() => navigation.navigate("Scanner", { mode: "sale" })}
      >
        <Text style={styles.scanButtonText}>Escanear producto</Text>
      </TouchableOpacity>

      {items.map((item) => (
        <View key={item.code} style={styles.itemBox}>
          <Text style={styles.itemName}>{item.productName}</Text>
          <Text style={styles.itemMeta}>Codigo: {item.code}</Text>
          <Text style={styles.itemMeta}>Stock disp.: {item.availableStock}</Text>
          <Text style={styles.itemMeta}>Precio: {money(item.salePrice)}</Text>

          <View style={styles.row}>
            <TouchableOpacity style={styles.smallBtn} onPress={() => updateQty(item.code, item.qty - 1)}>
              <Text style={styles.smallBtnText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.qty}>{item.qty}</Text>
            <TouchableOpacity style={styles.smallBtn} onPress={() => updateQty(item.code, item.qty + 1)}>
              <Text style={styles.smallBtnText}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => removeItem(item.code)}>
              <Text style={styles.deleteText}>Quitar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <Text style={styles.total}>Total: {money(total)}</Text>

      <TextInput
        style={styles.input}
        placeholder="Nombre cliente (opcional)"
        value={customerName}
        onChangeText={setCustomerName}
      />
      <TextInput
        style={styles.input}
        placeholder="Telefono cliente (opcional)"
        value={customerPhone}
        onChangeText={setCustomerPhone}
      />

      <TouchableOpacity style={styles.checkoutBtn} onPress={checkout} disabled={loading}>
        <Text style={styles.checkoutText}>{loading ? "Procesando..." : "Confirmar venta y generar factura"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f5ef" },
  content: { padding: 16, gap: 10 },
  h1: { fontSize: 26, fontWeight: "700", color: "#3f2b1d" },
  scanButton: { backgroundColor: "#4a2e1f", borderRadius: 10, padding: 14, alignItems: "center" },
  scanButtonText: { color: "#fff", fontWeight: "700" },
  itemBox: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dccdbf",
    borderRadius: 10,
    padding: 12
  },
  itemName: { fontWeight: "700", color: "#4a2e1f" },
  itemMeta: { color: "#6d5a4f", marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8 },
  smallBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#4a2e1f",
    alignItems: "center",
    justifyContent: "center"
  },
  smallBtnText: { color: "#fff", fontWeight: "700", fontSize: 18 },
  qty: { minWidth: 20, textAlign: "center", fontWeight: "700" },
  deleteBtn: { marginLeft: "auto", paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: "#aa4f4f", borderRadius: 8 },
  deleteText: { color: "#aa4f4f", fontWeight: "700" },
  total: { fontSize: 24, fontWeight: "700", color: "#3f2b1d", marginTop: 6 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dccdbf",
    borderRadius: 10,
    padding: 12
  },
  checkoutBtn: { backgroundColor: "#2b6f3e", borderRadius: 10, padding: 14, alignItems: "center" },
  checkoutText: { color: "#fff", fontWeight: "700" }
});
