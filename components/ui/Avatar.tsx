import { View, Text, Image } from "react-native";

interface AvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: { container: "w-8 h-8", text: "text-xs" },
  md: { container: "w-12 h-12", text: "text-base" },
  lg: { container: "w-20 h-20", text: "text-2xl" },
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Avatar({ name, imageUrl, size = "md", className = "" }: AvatarProps) {
  const s = sizeMap[size];

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        className={`${s.container} rounded-full ${className}`}
        accessibilityLabel={name}
      />
    );
  }

  return (
    <View
      className={`${s.container} rounded-full bg-primary-600 items-center justify-center ${className}`}
    >
      <Text className={`${s.text} font-bold text-white`}>{getInitials(name)}</Text>
    </View>
  );
}
