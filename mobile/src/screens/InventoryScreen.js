import { useCallback, useEffect, useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  Alert,
  Image,
  Modal,
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

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/gi, (m) => (m === "Ñ" ? "N" : "n"))
    .toLowerCase()
    .trim();
}

function parseDecimalInput(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function InventoryScreen({ navigation }) {
  const { token } = useAuth();
  const [manualCode, setManualCode] = useState("");
  const [qty, setQty] = useState("1");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({
    product_name: "",
    brand: "",
    category: "",
    variant_name: "",
    location: "",
    purchase_price: "0",
    sale_price: "0",
    photo_url: ""
  });

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

  const openEdit = (item) => {
    setEditingItem(item);
    setEditForm({
      product_name: item.product_name || "",
      brand: item.brand || "",
      category: item.category || "",
      variant_name: item.variant_name || "",
      location: item.location || "",
      purchase_price: String(item.purchase_price ?? 0),
      sale_price: String(item.sale_price ?? 0),
      photo_url: item.photo_url || ""
    });
  };

  const closeEdit = () => {
    setEditingItem(null);
  };

  const updateEditField = (key, value) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const takePhotoForEdit = async () => {
    try {
      const cameraPerm = await ImagePicker.requestCameraPermissionsAsync();
      if (!cameraPerm.granted) {
        Alert.alert("Permiso requerido", "Debes conceder permiso de camara para tomar fotos.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.4,
        base64: true
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];
      if (asset.base64) {
        updateEditField("photo_url", `data:image/jpeg;base64,${asset.base64}`);
      } else if (asset.uri) {
        updateEditField("photo_url", asset.uri);
      }
    } catch {
      Alert.alert("Error", "No se pudo tomar la fotografia.");
    }
  };

  const saveEdit = async () => {
    if (!editingItem) return;
    if (!editForm.product_name.trim()) {
      Alert.alert("Dato faltante", "El nombre del producto es obligatorio.");
      return;
    }

    const purchasePrice = parseDecimalInput(editForm.purchase_price);
    const salePrice = parseDecimalInput(editForm.sale_price);
    if (purchasePrice === null || salePrice === null) {
      Alert.alert("Precio invalido", "Usa valores numericos validos para costo y venta.");
      return;
    }

    try {
      await api.updateInventoryItem(token, editingItem.variant_id, {
        product_name: editForm.product_name.trim(),
        brand: editForm.brand || null,
        category: editForm.category || null,
        variant_name: editForm.variant_name || null,
        location: editForm.location || null,
        purchase_price: purchasePrice,
        sale_price: salePrice,
        photo_url: editForm.photo_url || null
      });
      Alert.alert("Actualizado", "Producto actualizado correctamente.");
      closeEdit();
      await loadItems();
    } catch (err) {
      Alert.alert("Error", err.message || "No se pudo actualizar el producto.");
    }
  };

  const deleteItem = (item) => {
    Alert.alert(
      "Eliminar producto",
      `Se eliminara ${item.product_name}. Esta accion no se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteInventoryItem(token, item.variant_id);
              Alert.alert("Eliminado", "Producto eliminado correctamente.");
              await loadItems();
            } catch (err) {
              Alert.alert("Error", err.message || "No se pudo eliminar el producto.");
            }
          }
        }
      ]
    );
  };

  const filteredItems = useMemo(() => {
    const q = normalizeText(search);
    if (!q) return items;

    return items.filter((item) => {
      const candidates = [
        item.product_name,
        item.category,
        item.brand,
        item.variant_name,
        item.primary_code
      ]
        .filter(Boolean)
        .map((v) => normalizeText(v));
      return candidates.some((v) => v.includes(q));
    });
  }, [items, search]);

  return (
    <>
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

        <TextInput
          style={styles.input}
          placeholder="Buscar por nombre, categoria o marca"
          value={search}
          onChangeText={setSearch}
        />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Productos en inventario</Text>
          <Text style={styles.sectionCount}>{filteredItems.length}</Text>
        </View>

        {items.length === 0 ? (
          <Text style={styles.emptyText}>Aun no hay productos registrados.</Text>
        ) : filteredItems.length === 0 ? (
          <Text style={styles.emptyText}>No se encontraron productos con ese criterio.</Text>
        ) : (
          filteredItems.map((item) => (
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

              <View style={styles.cardFooter}>
                <View style={[styles.stockPill, item.qty_on_hand <= 1 ? styles.stockLow : styles.stockOk]}>
                  <Text style={styles.stockText}>Stock: {item.qty_on_hand}</Text>
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
                    <Text style={styles.editBtnText}>Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteItem(item)}>
                    <Text style={styles.deleteBtnText}>Eliminar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal transparent visible={!!editingItem} animationType="slide" onRequestClose={closeEdit}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar producto</Text>
              <TouchableOpacity onPress={closeEdit}>
                <Text style={styles.closeText}>Cerrar</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent}>
              <TextInput
                style={styles.input}
                placeholder="Nombre producto"
                value={editForm.product_name}
                onChangeText={(v) => updateEditField("product_name", v)}
              />
              <TextInput
                style={styles.input}
                placeholder="Marca"
                value={editForm.brand}
                onChangeText={(v) => updateEditField("brand", v)}
              />
              <TextInput
                style={styles.input}
                placeholder="Categoria"
                value={editForm.category}
                onChangeText={(v) => updateEditField("category", v)}
              />
              <TextInput
                style={styles.input}
                placeholder="Variante"
                value={editForm.variant_name}
                onChangeText={(v) => updateEditField("variant_name", v)}
              />
              <TextInput
                style={styles.input}
                placeholder="Ubicacion"
                value={editForm.location}
                onChangeText={(v) => updateEditField("location", v)}
              />
              <TextInput
                style={styles.input}
                placeholder="Costo compra"
                keyboardType="decimal-pad"
                value={editForm.purchase_price}
                onChangeText={(v) => updateEditField("purchase_price", v)}
              />
              <TextInput
                style={styles.input}
                placeholder="Precio venta"
                keyboardType="decimal-pad"
                value={editForm.sale_price}
                onChangeText={(v) => updateEditField("sale_price", v)}
              />

              <TouchableOpacity style={styles.photoBtn} onPress={takePhotoForEdit}>
                <Text style={styles.photoBtnText}>
                  {editForm.photo_url ? "Cambiar fotografia" : "Tomar fotografia"}
                </Text>
              </TouchableOpacity>

              {!!editForm.photo_url && (
                <Image source={{ uri: editForm.photo_url }} style={styles.previewPhoto} resizeMode="cover" />
              )}

              <TouchableOpacity style={styles.saveBtn} onPress={saveEdit}>
                <Text style={styles.saveBtnText}>Guardar cambios</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
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
  cardFooter: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  cardActions: {
    flexDirection: "row",
    gap: 8
  },
  stockPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99
  },
  stockOk: { backgroundColor: "#e7f5ea" },
  stockLow: { backgroundColor: "#ffe9e9" },
  stockText: { fontWeight: "700", color: "#4a2e1f" },
  editBtn: {
    borderWidth: 1,
    borderColor: "#6b4f3e",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  editBtnText: { color: "#6b4f3e", fontWeight: "700" },
  deleteBtn: {
    borderWidth: 1,
    borderColor: "#aa4f4f",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  deleteBtnText: { color: "#aa4f4f", fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end"
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "90%",
    padding: 16
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#3f2b1d" },
  closeText: { color: "#6b4f3e", fontWeight: "700" },
  modalContent: { paddingBottom: 18 },
  photoBtn: {
    borderWidth: 1,
    borderColor: "#6b4f3e",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    marginBottom: 10
  },
  photoBtnText: { color: "#6b4f3e", fontWeight: "700" },
  previewPhoto: {
    width: "100%",
    height: 180,
    borderRadius: 10,
    backgroundColor: "#ece3d9",
    marginBottom: 10
  },
  saveBtn: {
    backgroundColor: "#2b6f3e",
    borderRadius: 10,
    padding: 14,
    alignItems: "center"
  },
  saveBtnText: { color: "#fff", fontWeight: "700" }
});
