import "react-native-gesture-handler";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { CartProvider } from "./src/context/CartContext";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import InventoryScreen from "./src/screens/InventoryScreen";
import CartScreen from "./src/screens/CartScreen";
import ScannerScreen from "./src/screens/ScannerScreen";

const Stack = createNativeStackNavigator();

function RootNavigator() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {!isAuthenticated ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} options={{ title: "Ma' Girls" }} />
            <Stack.Screen name="Inventory" component={InventoryScreen} options={{ title: "Inventario" }} />
            <Stack.Screen name="Cart" component={CartScreen} options={{ title: "Ventas" }} />
            <Stack.Screen name="Scanner" component={ScannerScreen} options={{ title: "Escaner" }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <RootNavigator />
      </CartProvider>
    </AuthProvider>
  );
}
