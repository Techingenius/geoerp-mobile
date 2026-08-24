import { View, Text, Pressable, SafeAreaView, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../lib/stores/auth-store";

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.role);
  const signOut = useAuthStore((s) => s.signOut);

  const handleSignOut = () => {
    Alert.alert("Cerrar sesión", "¿Estás seguro?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Cerrar sesión", style: "destructive", onPress: signOut },
    ]);
  };

  const ROLE_LABELS: Record<string, string> = {
    admin: "Administrador",
    supervisor: "Supervisor",
    operator: "Operador",
    trinchero: "Trinchero",
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 px-6 pt-8">
        <View className="items-center mb-8">
          <View className="w-20 h-20 bg-primary-100 rounded-full items-center justify-center mb-3">
            <Ionicons name="person" size={40} color="#2563eb" />
          </View>
          <Text className="text-xl font-semibold text-gray-900">
            {user?.email ?? "Usuario"}
          </Text>
          {role && (
            <View className="bg-primary-100 px-3 py-1 rounded-full mt-2">
              <Text className="text-primary-700 text-sm font-medium">
                {ROLE_LABELS[role] ?? role}
              </Text>
            </View>
          )}
        </View>

        <View className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <View className="flex-row items-center px-4 py-3.5 border-b border-gray-50">
            <Ionicons name="mail-outline" size={20} color="#6b7280" />
            <Text className="text-gray-700 ml-3 flex-1">{user?.email}</Text>
          </View>
          <View className="flex-row items-center px-4 py-3.5 border-b border-gray-50">
            <Ionicons name="shield-checkmark-outline" size={20} color="#6b7280" />
            <Text className="text-gray-700 ml-3 flex-1">
              {ROLE_LABELS[role ?? ""] ?? "Sin rol"}
            </Text>
          </View>
          <View className="flex-row items-center px-4 py-3.5">
            <Ionicons name="finger-print-outline" size={20} color="#6b7280" />
            <Text className="text-gray-400 ml-3 flex-1 text-xs">
              {user?.id?.slice(0, 8)}...
            </Text>
          </View>
        </View>

        <Pressable
          onPress={handleSignOut}
          className="mt-8 bg-red-50 py-4 rounded-xl items-center active:bg-red-100"
        >
          <Text className="text-red-600 font-semibold">Cerrar sesión</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
