import { View, type ViewProps } from "react-native";

export function Card({ className = "", ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={`bg-white rounded-2xl border border-gray-100 shadow-sm ${className}`}
      {...props}
    />
  );
}

export function CardContent({ className = "", ...props }: ViewProps & { className?: string }) {
  return <View className={`px-5 py-4 ${className}`} {...props} />;
}
