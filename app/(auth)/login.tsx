import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useAuthStore } from "../../lib/stores/auth-store";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signIn = useAuthStore((s) => s.signIn);
  const isLoading = useAuthStore((s) => s.isLoading);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Error", "Ingresa email y contraseña");
      return;
    }

    try {
      await signIn(email.trim(), password);
    } catch (error: any) {
      Alert.alert(
        "Error de autenticación",
        error.message || "Credenciales incorrectas"
      );
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 justify-center px-8">
          <View className="mb-12">
            <Text className="text-4xl font-bold text-gray-900">GeoERP</Text>
            <Text className="text-lg text-gray-500 mt-2">
              Operaciones de campo
            </Text>
          </View>

          <View className="gap-4">
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">
                Email
              </Text>
              <TextInput
                className="border border-gray-300 rounded-xl px-4 py-3.5 text-base text-gray-900 bg-gray-50"
                placeholder="tu@email.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                editable={!isLoading}
              />
            </View>

            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">
                Contraseña
              </Text>
              <TextInput
                className="border border-gray-300 rounded-xl px-4 py-3.5 text-base text-gray-900 bg-gray-50"
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
                editable={!isLoading}
                onSubmitEditing={handleLogin}
              />
            </View>

            <Pressable
              onPress={handleLogin}
              disabled={isLoading}
              className={`mt-4 py-4 rounded-xl items-center ${
                isLoading ? "bg-primary-300" : "bg-primary-600 active:bg-primary-700"
              }`}
            >
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold text-base">
                  Iniciar sesión
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
