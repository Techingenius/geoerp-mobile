import { View, Text, Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../lib/stores/auth-store";
import { Avatar } from "../../components/ui/Avatar";
import { Card, CardContent } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Separator } from "../../components/ui/Separator";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  operator: "Operador",
  trinchero: "Trinchero",
};

const ROLE_VARIANTS: Record<string, "default" | "success" | "warning" | "info"> = {
  admin: "default",
  supervisor: "info",
  operator: "success",
  trinchero: "warning",
};

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.role);
  const signOut = useAuthStore((s) => s.signOut);

  const displayName = user?.email ?? "Usuario";
  const roleLabel = ROLE_LABELS[role ?? ""] ?? "Sin rol";

  function handleLogout() {
    Alert.alert("Cerrar sesion", "Estas seguro que deseas salir?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Salir", style: "destructive", onPress: signOut },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerClassName="pb-8"
        showsVerticalScrollIndicator={false}
      >
        {/* Profile header */}
        <View className="bg-primary-600 px-6 pt-8 pb-14">
          <View className="items-center">
            <Avatar
              name={displayName}
              size="lg"
              className="border-4 border-white/30"
            />
            <Text className="text-xl font-bold text-white mt-4">{displayName}</Text>
            <View className="mt-3">
              <Badge
                label={roleLabel}
                variant={ROLE_VARIANTS[role ?? ""] ?? "default"}
              />
            </View>
          </View>
        </View>

        {/* Info card */}
        <View className="px-4 -mt-8">
          <Card className="mb-4">
            <CardContent>
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Informacion
              </Text>

              {user?.email && (
                <>
                  <View className="flex-row items-center justify-between py-2.5">
                    <View className="flex-row items-center">
                      <Ionicons name="mail-outline" size={16} color="#6B7280" />
                      <Text className="text-sm text-gray-500 ml-2">Email</Text>
                    </View>
                    <Text className="text-sm text-gray-900 font-medium">{user.email}</Text>
                  </View>
                  <Separator />
                </>
              )}

              <View className="flex-row items-center justify-between py-2.5">
                <View className="flex-row items-center">
                  <Ionicons name="shield-checkmark-outline" size={16} color="#6B7280" />
                  <Text className="text-sm text-gray-500 ml-2">Rol</Text>
                </View>
                <Badge
                  label={roleLabel}
                  variant={ROLE_VARIANTS[role ?? ""] ?? "muted"}
                />
              </View>
              <Separator />

              <View className="flex-row items-center justify-between py-2.5">
                <View className="flex-row items-center">
                  <Ionicons name="finger-print-outline" size={16} color="#6B7280" />
                  <Text className="text-sm text-gray-500 ml-2">ID</Text>
                </View>
                <Text className="text-xs text-gray-400 font-mono">
                  {user?.id?.slice(0, 8)}...
                </Text>
              </View>
            </CardContent>
          </Card>

          {/* App info */}
          <Card className="mb-4">
            <CardContent>
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Aplicacion
              </Text>
              <View className="flex-row items-center justify-between py-2.5">
                <Text className="text-sm text-gray-500">Version</Text>
                <Text className="text-sm text-gray-900 font-medium">1.0.0</Text>
              </View>
              <Separator />
              <View className="flex-row items-center justify-between py-2.5">
                <Text className="text-sm text-gray-500">Plataforma</Text>
                <Text className="text-sm text-gray-900 font-medium">GeoERP Mobile</Text>
              </View>
            </CardContent>
          </Card>

          {/* Logout */}
          <Button
            title="Cerrar sesion"
            onPress={handleLogout}
            variant="danger"
            icon={<Ionicons name="log-out-outline" size={20} color="#DC2626" />}
            className="mt-2"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
