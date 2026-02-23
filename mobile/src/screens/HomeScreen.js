import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export default function HomeScreen({ navigation }) {
  const { token, user, signOut } = useAuth();
  const [summary, setSummary] = useState(null);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, alerts] = await Promise.all([
        api.getDashboardSummary(token),
        api.getLowStock(token)
      ]);
      setSummary(s);
      setLowStock(alerts);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.h1}>Panel principal</Text>
      <Text style={styles.user}>Usuario: {user?.fullName || user?.username}</Text>

      <View style={styles.kpiBox}>
        <Text style={styles.kpiLabel}>Dinero invertido</Text>
        <Text style={styles.kpiValue}>{money(summary?.invested_amount)}</Text>
      </View>

      <View style={styles.kpiBox}>
        <Text style={styles.kpiLabel}>Dinero ganado</Text>
        <Text style={styles.kpiValue}>{money(summary?.profit)}</Text>
      </View>

      <View style={styles.alertBox}>
        <Text style={styles.alertTitle}>
          Alertas de stock ({"<="} 1): {lowStock.length}
        </Text>
        {lowStock.slice(0, 5).map((item) => (
          <Text key={item.variant_id} style={styles.alertRow}>
            {item.product_name} ({item.variant_name || "Base"}) - {item.qty_on_hand}
          </Text>
        ))}
      </View>

      <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate("Inventory")}>
        <Text style={styles.btnText}>Inventario</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate("Cart")}>
        <Text style={styles.btnText}>Ventas / Carrito</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.outBtn} onPress={signOut}>
        <Text style={styles.outText}>Cerrar sesion</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f5ef" },
  content: { padding: 16, gap: 12 },
  h1: { fontSize: 26, fontWeight: "700", color: "#3f2b1d" },
  user: { color: "#6d5a4f" },
  kpiBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#dccdbf"
  },
  kpiLabel: { color: "#7a6658" },
  kpiValue: { marginTop: 6, fontSize: 28, fontWeight: "700", color: "#4a2e1f" },
  alertBox: {
    backgroundColor: "#fff8e8",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f0c988",
    padding: 14
  },
  alertTitle: { fontWeight: "700", color: "#7c4a00", marginBottom: 6 },
  alertRow: { color: "#7c4a00", marginBottom: 2 },
  btn: {
    backgroundColor: "#4a2e1f",
    borderRadius: 10,
    padding: 14,
    alignItems: "center"
  },
  btnText: { color: "#fff", fontWeight: "700" },
  outBtn: {
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#6b4f3e"
  },
  outText: { color: "#6b4f3e", fontWeight: "700" }
});
