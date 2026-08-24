import { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../lib/stores/auth-store";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Error desconocido";
  const msg = error.message.toLowerCase();
  if (msg.includes("invalid login credentials"))
    return "Email o contrasena incorrectos.";
  if (msg.includes("email not confirmed"))
    return "Tu email aun no ha sido confirmado.";
  if (msg.includes("too many requests") || msg.includes("rate limit"))
    return "Demasiados intentos. Espera un momento.";
  if (msg.includes("network") || msg.includes("fetch"))
    return "Error de conexion. Verifica tu internet.";
  return error.message;
}

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const passwordRef = useRef<TextInput>(null);
  const signIn = useAuthStore((s) => s.signIn);

  async function handleLogin() {
    Keyboard.dismiss();
    setErrorMsg(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMsg("Ingresa tu email y contrasena.");
      return;
    }

    setLoading(true);
    try {
      await signIn(trimmedEmail, password);
    } catch (error) {
      setErrorMsg(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-primary-600">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-1"
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* Header with logo */}
          <View className="items-center pt-16 pb-10">
            <View className="w-20 h-20 rounded-2xl bg-white/20 items-center justify-center mb-5">
              <Ionicons name="earth" size={44} color="white" />
            </View>
            <Text className="text-4xl font-bold text-white tracking-tight">GeoERP</Text>
            <Text className="text-base text-white/70 mt-2">
              Operaciones de campo
            </Text>
          </View>

          {/* Form card */}
          <View className="flex-1 bg-white rounded-t-3xl px-6 pt-8 pb-6">
            <Text className="text-2xl font-bold text-gray-900 mb-1">Bienvenido</Text>
            <Text className="text-sm text-gray-500 mb-8">
              Ingresa con tu cuenta para continuar
            </Text>

            {errorMsg && (
              <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 flex-row items-center">
                <Ionicons name="alert-circle" size={18} color="#DC2626" />
                <Text className="text-red-700 text-sm ml-2 flex-1">{errorMsg}</Text>
              </View>
            )}

            <View className="gap-5">
              <Input
                label="Email"
                placeholder="tu@email.com"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setErrorMsg(null);
                }}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!loading}
                icon={<Ionicons name="mail-outline" size={20} color="#9CA3AF" />}
              />

              <View>
                <Input
                  ref={passwordRef}
                  label="Contrasena"
                  placeholder="Tu contrasena"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    setErrorMsg(null);
                  }}
                  secureTextEntry={!showPassword}
                  textContentType="password"
                  autoComplete="password"
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                  editable={!loading}
                  icon={<Ionicons name="lock-closed-outline" size={20} color="#9CA3AF" />}
                />
                <View className="absolute right-4 top-9 bottom-0 justify-center">
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#9CA3AF"
                    onPress={() => setShowPassword(!showPassword)}
                  />
                </View>
              </View>

              <Button
                title="Iniciar sesion"
                onPress={handleLogin}
                loading={loading}
                disabled={loading}
                size="lg"
                className="mt-2"
              />
            </View>

            <View className="mt-auto items-center pt-8">
              <Text className="text-xs text-gray-400">
                GeoERP v1.0.0 — Techingenius
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
