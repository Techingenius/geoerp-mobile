import { Pressable, Text, ActivityIndicator, type ViewStyle } from "react-native";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  className?: string;
  style?: ViewStyle;
}

const variantStyles: Record<ButtonVariant, { container: string; text: string; spinner: string }> = {
  primary: {
    container: "bg-primary-600 active:bg-primary-700",
    text: "text-white",
    spinner: "white",
  },
  secondary: {
    container: "bg-gray-100 border border-gray-200 active:bg-gray-200",
    text: "text-gray-800",
    spinner: "#2563eb",
  },
  danger: {
    container: "bg-red-50 border border-red-200 active:bg-red-100",
    text: "text-red-600",
    spinner: "#DC2626",
  },
  ghost: {
    container: "active:bg-gray-100",
    text: "text-gray-700",
    spinner: "#374151",
  },
};

const sizeStyles: Record<ButtonSize, { container: string; text: string }> = {
  sm: { container: "py-2 px-3 rounded-lg", text: "text-sm" },
  md: { container: "py-3.5 px-5 rounded-xl", text: "text-base" },
  lg: { container: "py-4 px-6 rounded-xl", text: "text-lg" },
};

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  className = "",
  style,
}: ButtonProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={`flex-row items-center justify-center ${s.container} ${v.container} ${
        disabled ? "opacity-50" : ""
      } ${className}`}
      style={style}
    >
      {loading ? (
        <ActivityIndicator color={v.spinner} />
      ) : (
        <>
          {icon && <>{icon}</>}
          <Text
            className={`font-semibold ${s.text} ${v.text} ${icon ? "ml-2" : ""}`}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
