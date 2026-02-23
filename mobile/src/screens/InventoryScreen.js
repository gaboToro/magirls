import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export default function InventoryScreen({ navigation }) {
  const { token } = useAuth();
  const [manualCode, setManualCode] = useState("");
  const [qty, setQty] = useState("1");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getInventoryItems(token);
      setItems(data);
    } catch (err) {
      Alert.alert("Error", err.message || "No se pudo cargar inventario");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    const unsub = navigation.addListener("focus", loadItems);
    return unsub;
  }, [navigation, loadItems]);

  const addByCode = async () => {
    if (!manualCode) return;
    try {
      await api.scanIncrease(token, { code: manualCode, qty: Number(qty || 1) });
      Alert.alert("Stock actualizado", "Se incremento inventario correctamente.");
      setManualCode("");
      await loadItems();
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadItems} />}
    >
      <Text style={styles.h1}>Inventario</Text>
      <Text style={styles.desc}>Escanea o ingresa codigo para aumentar stock.</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate("Scanner", { mode: "inventory" })}
      >
        <Text style={styles.buttonText}>Escanear codigo</Text>
      </TouchableOpacity>

      <TextInput
        style={styles.input}
        placeholder="Codigo manual"
        value={manualCode}
        onChangeText={setManualCode}
      />
      <TextInput
        style={styles.input}
        placeholder="Cantidad"
        keyboardType="numeric"
        value={qty}
        onChangeText={setQty}
      />
      <TouchableOpacity style={styles.altButton} onPress={addByCode}>
        <Text style={styles.altButtonText}>Aumentar stock manual</Text>
      </TouchableOpacity>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Productos en inventario</Text>
        <Text style={styles.sectionCount}>{items.length}</Text>
      </View>

      {items.length === 0 ? (
        <Text style={styles.emptyText}>Aun no hay productos registrados.</Text>
      ) : (
        items.map((item) => (
          <View key={item.variant_id} style={styles.card}>
            {!!item.photo_url && (
              <Image
                source={{ uri: item.photo_url }}
                style={styles.photo}
                resizeMode="cover"
              />
            )}

            <Text style={styles.name}>{item.product_name}</Text>
            <Text style={styles.meta}>Variante: {item.variant_name || "Base"}</Text>
            <Text style={styles.meta}>Codigo: {item.primary_code || "Sin codigo"}</Text>
            <Text style={styles.meta}>Ubicacion: {item.location || "Sin ubicacion"}</Text>
            <Text style={styles.meta}>Categoria: {item.category || "Sin categoria"}</Text>
            <Text style={styles.meta}>Marca: {item.brand || "Sin marca"}</Text>
            <Text style={styles.meta}>Costo: {money(item.purchase_price)}</Text>
            <Text style={styles.meta}>Venta: {money(item.sale_price)}</Text>

            <View style={[styles.stockPill, item.qty_on_hand <= 1 ? styles.stockLow : styles.stockOk]}>
              <Text style={styles.stockText}>Stock: {item.qty_on_hand}</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f5ef" },
  content: { padding: 16, gap: 10 },
  h1: { fontSize: 26, fontWeight: "700", color: "#3f2b1d" },
  desc: { marginBottom: 12, color: "#6d5a4f" },
  button: {
    backgroundColor: "#4a2e1f",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 16
  },
  buttonText: { color: "#fff", fontWeight: "700" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dccdbf",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10
  },
  altButton: {
    borderWidth: 1,
    borderColor: "#6b4f3e",
    borderRadius: 10,
    padding: 14,
    alignItems: "center"
  },
  altButtonText: { color: "#6b4f3e", fontWeight: "700" },
  sectionHeader: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#3f2b1d" },
  sectionCount: {
    backgroundColor: "#4a2e1f",
    color: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    overflow: "hidden",
    fontWeight: "700"
  },
  emptyText: { color: "#7a6658" },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dccdbf",
    borderRadius: 12,
    padding: 12,
    gap: 4
  },
  photo: {
    width: "100%",
    height: 160,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: "#ece3d9"
  },
  name: { fontWeight: "700", color: "#4a2e1f", fontSize: 16 },
  meta: { color: "#6d5a4f" },
  stockPill: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99
  },
  stockOk: { backgroundColor: "#e7f5ea" },
  stockLow: { backgroundColor: "#ffe9e9" },
  stockText: { fontWeight: "700", color: "#4a2e1f" }
});
