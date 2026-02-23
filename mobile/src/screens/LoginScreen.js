import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Contrasena"
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity
          onPress={() => setShowPassword((prev) => !prev)}
          style={styles.passwordToggle}
        >
          <Text style={styles.passwordToggleText}>{showPassword ? "Ocultar" : "Mostrar"}</Text>
        </TouchableOpacity>
      </View>

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
  passwordContainer: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dccdbf",
    borderRadius: 10,
    marginBottom: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center"
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12
  },
  passwordToggle: {
    paddingVertical: 8,
    paddingLeft: 12
  },
  passwordToggleText: {
    color: "#6b4f3e",
    fontWeight: "700"
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
