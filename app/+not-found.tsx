import { Link, Stack } from "expo-router";
import { View, Text } from "react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "No encontrado" }} />
      <View className="flex-1 items-center justify-center p-5">
        <Text className="text-xl font-bold text-gray-900">
          Esta pantalla no existe
        </Text>
        <Link href="/" className="mt-4 py-4">
          <Text className="text-primary-600 text-sm">Ir al inicio</Text>
        </Link>
      </View>
    </>
  );
}
