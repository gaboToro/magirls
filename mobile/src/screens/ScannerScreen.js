import { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

export default function ScannerScreen({ route, navigation }) {
  const { mode } = route.params || { mode: "sale" };
  const { token } = useAuth();
  const { addOrIncrement } = useCart();

  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [code, setCode] = useState("");
  const [existing, setExisting] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const [qty, setQty] = useState("1");

  const [productName, setProductName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [variantName, setVariantName] = useState("");
  const [location, setLocation] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("0");
  const [salePrice, setSalePrice] = useState("0");
  const [initialQty, setInitialQty] = useState("1");

  const resetState = () => {
    setLocked(false);
    setCode("");
    setExisting(null);
    setNotFound(false);
  };

  const onBarcodeScanned = async ({ data }) => {
    if (locked) return;
    setLocked(true);
    setCode(data);

    try {
      const variant = await api.getByCode(token, data);
      setExisting(variant);

      if (mode === "sale") {
        if (variant.qty_on_hand <= 0) {
          Alert.alert("Sin stock", "No se puede vender este producto porque su stock es 0.");
          setLocked(false);
          return;
        }

        addOrIncrement({
          code: data,
          productName: variant.product_name,
          salePrice: variant.sale_price,
          availableStock: variant.qty_on_hand
        });

        Alert.alert("Producto agregado", `${variant.product_name} agregado al carrito.`);
        navigation.goBack();
      }
    } catch {
      if (mode === "inventory") {
        setNotFound(true);
      } else {
        Alert.alert("No encontrado", "Ese codigo no existe en catalogo.");
        setLocked(false);
      }
    }
  };

  const increaseStock = async () => {
    try {
      await api.scanIncrease(token, { code, qty: Number(qty || 1) });
      Alert.alert("Stock actualizado", "Inventario aumentado.");
      navigation.goBack();
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  };

  const createFromScan = async () => {
    if (!productName) {
      Alert.alert("Dato faltante", "Ingresa nombre de producto.");
      return;
    }

    try {
      await api.scanUpsert(token, {
        code,
        product_name: productName,
        brand,
        category,
        photo_url: photoUrl || null,
        variant_name: variantName || null,
        location: location || null,
        purchase_price: Number(purchasePrice || 0),
        sale_price: Number(salePrice || 0),
        initial_qty: Number(initialQty || 0)
      });
      Alert.alert("Producto creado", "Se creo producto/variante y stock inicial.");
      navigation.goBack();
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  };

  if (!permission) {
    return <View style={styles.center}><Text>Cargando permisos de camara...</Text></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>Se requiere permiso de camara para escanear.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Conceder permiso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>{mode === "inventory" ? "Escaner inventario" : "Escaner venta"}</Text>

      <View style={styles.cameraWrap}>
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{
            barcodeTypes: [
              "qr",
              "ean13",
              "ean8",
              "upc_a",
              "upc_e",
              "code128",
              "code39",
              "itf14"
            ]
          }}
          onBarcodeScanned={onBarcodeScanned}
        />
      </View>

      <Text style={styles.codeLabel}>Codigo: {code || "-"}</Text>

      {!!existing && mode === "inventory" && (
        <View style={styles.box}>
          <Text style={styles.boxTitle}>Producto encontrado</Text>
          <Text>{existing.product_name}</Text>
          <Text>Stock actual: {existing.qty_on_hand}</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="Cantidad a aumentar"
            value={qty}
            onChangeText={setQty}
          />
          <TouchableOpacity style={styles.btn} onPress={increaseStock}>
            <Text style={styles.btnText}>Aumentar stock</Text>
          </TouchableOpacity>
        </View>
      )}

      {notFound && mode === "inventory" && (
        <View style={styles.box}>
          <Text style={styles.boxTitle}>Codigo no existe. Crear producto</Text>
          <TextInput style={styles.input} placeholder="Nombre producto" value={productName} onChangeText={setProductName} />
          <TextInput style={styles.input} placeholder="Marca" value={brand} onChangeText={setBrand} />
          <TextInput style={styles.input} placeholder="Categoria" value={category} onChangeText={setCategory} />
          <TextInput style={styles.input} placeholder="Variante (opcional)" value={variantName} onChangeText={setVariantName} />
          <TextInput style={styles.input} placeholder="Ubicacion (ej: Estante A1)" value={location} onChangeText={setLocation} />
          <TextInput style={styles.input} placeholder="URL de fotografia (opcional)" value={photoUrl} onChangeText={setPhotoUrl} />
          <TextInput style={styles.input} placeholder="Costo compra" keyboardType="decimal-pad" value={purchasePrice} onChangeText={setPurchasePrice} />
          <TextInput style={styles.input} placeholder="Precio venta" keyboardType="decimal-pad" value={salePrice} onChangeText={setSalePrice} />
          <TextInput style={styles.input} placeholder="Stock inicial" keyboardType="numeric" value={initialQty} onChangeText={setInitialQty} />
          <TouchableOpacity style={styles.btn} onPress={createFromScan}>
            <Text style={styles.btnText}>Crear producto por escaneo</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.altBtn} onPress={resetState}>
        <Text style={styles.altBtnText}>Escanear otro codigo</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f5ef" },
  content: { padding: 16, gap: 10 },
  h1: { fontSize: 24, fontWeight: "700", color: "#3f2b1d" },
  cameraWrap: { borderRadius: 12, overflow: "hidden" },
  camera: { width: "100%", height: 260 },
  codeLabel: { color: "#6d5a4f" },
  box: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dccdbf",
    borderRadius: 10,
    padding: 12,
    gap: 8
  },
  boxTitle: { fontWeight: "700", color: "#4a2e1f" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dccdbf",
    borderRadius: 10,
    padding: 10
  },
  btn: { backgroundColor: "#4a2e1f", borderRadius: 10, padding: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
  altBtn: { borderWidth: 1, borderColor: "#6b4f3e", borderRadius: 10, padding: 12, alignItems: "center" },
  altBtnText: { color: "#6b4f3e", fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  permissionText: { textAlign: "center", marginBottom: 12 }
});
