import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    if (!username || !password) {
      Alert.alert("Datos faltantes", "Ingresa usuario y contrasena.");
      return;
    }

    try {
      setLoading(true);
      const res = await api.login({ username, password });
      await signIn(res.access_token, {
        userId: res.user_id,
        username: res.username,
        fullName: res.full_name
      });
    } catch (err) {
      Alert.alert("Error", err.message || "No se pudo iniciar sesion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ma' Girls</Text>
      <Text style={styles.subtitle}>Inventario y ventas movil</Text>

      <TextInput
        style={styles.input}
        placeholder="Usuario"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="Contrasena"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.button} onPress={onLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Ingresando..." : "Ingresar"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f8f5ef"
  },
  title: {
    fontSize: 34,
    fontWeight: "700",
    color: "#4a2e1f"
  },
  subtitle: {
    marginBottom: 22,
    color: "#6d5a4f"
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dccdbf",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10
  },
  button: {
    marginTop: 8,
    backgroundColor: "#4a2e1f",
    padding: 14,
    borderRadius: 10,
    alignItems: "center"
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700"
  }
});
