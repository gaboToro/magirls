import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function InventoryScreen({ navigation }) {
  const { token } = useAuth();
  const [manualCode, setManualCode] = useState("");
  const [qty, setQty] = useState("1");

  const addByCode = async () => {
    if (!manualCode) return;
    try {
      await api.scanIncrease(token, { code: manualCode, qty: Number(qty || 1) });
      Alert.alert("Stock actualizado", "Se incremento inventario correctamente.");
      setManualCode("");
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  };

  return (
    <View style={styles.container}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f5ef", padding: 16 },
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
  altButtonText: { color: "#6b4f3e", fontWeight: "700" }
});
