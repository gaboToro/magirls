import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio } from "expo-av";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

const NOTIFICATIONS_KEY = "stock_notifications_v1";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDate(isoDate) {
  try {
    return new Date(isoDate).toLocaleString();
  } catch {
    return isoDate;
  }
}

function buildNotificationMessage(item) {
  return `El producto ${item.product_name} tiene ${item.qty_on_hand} unidades disponibles`;
}

async function playNotificationSound() {
  try {
    const { sound } = await Audio.Sound.createAsync(
      require("../../assets/sounds/notification.wav"),
      { shouldPlay: true }
    );
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish) {
        sound.unloadAsync();
      }
    });
  } catch {
    // Silent fallback if sound can't play on current device state.
  }
}

export default function HomeScreen({ navigation }) {
  const { token, user, signOut } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(NOTIFICATIONS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setNotifications(parsed);
          }
        }
      } catch {
        // If cache is corrupt, ignore and continue.
      }
    })();
  }, []);

  const persistNotifications = useCallback(async (nextNotifications) => {
    await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(nextNotifications));
  }, []);

  const markNotificationRead = useCallback(
    async (id) => {
      let nextRef = null;
      setNotifications((prev) => {
        const next = prev.map((item) => (item.id === id ? { ...item, read: true } : item));
        nextRef = next;
        return next;
      });
      if (nextRef) {
        await persistNotifications(nextRef);
      }
    },
    [persistNotifications]
  );

  const mergeNotifications = useCallback(async (alerts) => {
    let hasNew = false;
    let nextNotifications = null;

    setNotifications((prev) => {
      const now = new Date().toISOString();
      const prevByVariant = new Map(prev.map((n) => [n.variant_id, n]));
      const synced = alerts
        .filter((item) => item.qty_on_hand <= 1)
        .map((item) => ({
          id:
            prevByVariant.get(item.variant_id)?.id ||
            `${item.variant_id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          variant_id: item.variant_id,
          product_name: item.product_name,
          qty_on_hand: item.qty_on_hand,
          message: buildNotificationMessage(item),
          read: (() => {
            const prevItem = prevByVariant.get(item.variant_id);
            if (!prevItem) {
              hasNew = true;
              return false;
            }
            if (prevItem.qty_on_hand !== item.qty_on_hand) {
              hasNew = true;
              return false;
            }
            return !!prevItem.read;
          })(),
          created_at: prevByVariant.get(item.variant_id)?.created_at || now,
          updated_at: now
        }))
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      nextNotifications = synced;
      return synced;
    });

    if (nextNotifications) {
      await persistNotifications(nextNotifications);
    }

    if (hasNew) {
      await playNotificationSound();
    }
  }, [persistNotifications]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, alerts] = await Promise.all([
        api.getDashboardSummary(token),
        api.getLowStock(token)
      ]);
      setSummary(s);
      await mergeNotifications(alerts);
    } finally {
      setLoading(false);
    }
  }, [mergeNotifications, token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => {
      load();
    }, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const notificationCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications]
  );
  const userDisplayName = user?.fullName || user?.username || "usuario";

  return (
    <>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={styles.content}
      >
        <View style={styles.topBar}>
          <Text style={styles.h1}>Panel principal</Text>
          <TouchableOpacity style={styles.bellBtn} onPress={() => setShowNotifications(true)}>
            <Text style={styles.bellIcon}>🔔</Text>
            {notificationCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{notificationCount > 99 ? "99+" : notificationCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.welcome}>Bienvenido {userDisplayName}</Text>

        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Dinero invertido</Text>
          <Text style={styles.kpiValue}>{money(summary?.invested_amount)}</Text>
        </View>

        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Dinero ganado</Text>
          <Text style={styles.kpiValue}>{money(summary?.profit)}</Text>
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

      <Modal animationType="slide" transparent visible={showNotifications} onRequestClose={() => setShowNotifications(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notificaciones ({notificationCount})</Text>
              <TouchableOpacity onPress={() => setShowNotifications(false)}>
                <Text style={styles.closeText}>Cerrar</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalListContent}>
              {notifications.length === 0 ? (
                <Text style={styles.emptyText}>No hay notificaciones por ahora.</Text>
              ) : (
                notifications.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.notificationRow, !item.read && styles.notificationRowUnread]}
                    onPress={() => markNotificationRead(item.id)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.notificationMessage}>{item.message}</Text>
                    <Text style={styles.notificationDate}>
                      {item.read ? "Leida" : "No leida"} - {formatDate(item.updated_at || item.created_at)}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f5ef" },
  content: { padding: 16, gap: 12 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  h1: { fontSize: 26, fontWeight: "700", color: "#3f2b1d" },
  bellBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dccdbf",
    alignItems: "center",
    justifyContent: "center"
  },
  bellIcon: { fontSize: 20 },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#d63b3b",
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center"
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700"
  },
  welcome: {
    color: "#6d5a4f",
    fontSize: 16,
    fontWeight: "600"
  },
  kpiBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#dccdbf"
  },
  kpiLabel: { color: "#7a6658" },
  kpiValue: { marginTop: 6, fontSize: 28, fontWeight: "700", color: "#4a2e1f" },
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
  outText: { color: "#6b4f3e", fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end"
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "75%",
    padding: 16
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#3f2b1d"
  },
  closeText: {
    color: "#6b4f3e",
    fontWeight: "700"
  },
  modalListContent: {
    gap: 10,
    paddingBottom: 18
  },
  emptyText: {
    color: "#7a6658"
  },
  notificationRow: {
    borderWidth: 1,
    borderColor: "#e8dbcf",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fffdf9"
  },
  notificationRowUnread: {
    borderColor: "#d8b38a",
    backgroundColor: "#fff6eb"
  },
  notificationMessage: {
    color: "#4a2e1f",
    fontWeight: "600"
  },
  notificationDate: {
    marginTop: 4,
    color: "#7a6658",
    fontSize: 12
  }
});
