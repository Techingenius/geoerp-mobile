import { View, Text, SafeAreaView } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function MapTabScreen() {
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 items-center justify-center px-8">
        <Ionicons name="map-outline" size={64} color="#d1d5db" />
        <Text className="text-xl font-semibold text-gray-700 mt-4">
          Mapa general
        </Text>
        <Text className="text-gray-400 text-center mt-2">
          Selecciona un proyecto desde la pestaña "Proyectos" para ver su mapa
          con tramos y servicios.
        </Text>
      </View>
    </SafeAreaView>
  );
}
