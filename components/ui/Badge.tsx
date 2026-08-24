import { View, Text } from "react-native";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "muted";

const variantStyles: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: "bg-primary-100", text: "text-primary-700" },
  success: { bg: "bg-emerald-100", text: "text-emerald-700" },
  warning: { bg: "bg-amber-100", text: "text-amber-700" },
  danger: { bg: "bg-red-100", text: "text-red-700" },
  info: { bg: "bg-blue-100", text: "text-blue-700" },
  muted: { bg: "bg-gray-100", text: "text-gray-600" },
};

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ label, variant = "default", className = "" }: BadgeProps) {
  const style = variantStyles[variant];
  return (
    <View className={`rounded-full px-3 py-1 self-start ${style.bg} ${className}`}>
      <Text className={`text-xs font-semibold ${style.text}`}>{label}</Text>
    </View>
  );
}

export const PROJECT_STATUS_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  active: { label: "Activo", variant: "success" },
  completed: { label: "Completado", variant: "info" },
  on_hold: { label: "En pausa", variant: "warning" },
  cancelled: { label: "Cancelado", variant: "danger" },
  planning: { label: "Planificacion", variant: "muted" },
};
