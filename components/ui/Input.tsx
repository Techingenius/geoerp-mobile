import { forwardRef } from "react";
import { View, Text, TextInput, type TextInputProps } from "react-native";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<TextInput, InputProps>(
  ({ label, error, icon, className = "", ...props }, ref) => {
    return (
      <View>
        {label && (
          <Text className="text-sm font-medium text-gray-700 mb-1.5">{label}</Text>
        )}
        <View
          className={`flex-row items-center border rounded-xl px-4 py-3 ${
            error ? "border-red-400 bg-red-50/50" : "border-gray-200 bg-gray-50"
          }`}
        >
          {icon && <View className="mr-3">{icon}</View>}
          <TextInput
            ref={ref}
            className={`flex-1 text-base text-gray-900 ${className}`}
            placeholderTextColor="#9CA3AF"
            {...props}
          />
        </View>
        {error && <Text className="text-xs text-red-500 mt-1">{error}</Text>}
      </View>
    );
  },
);

Input.displayName = "Input";
