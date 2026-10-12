import { View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export interface ChipOption {
  value: string;
  label: string;
}

interface ChipSelectProps {
  label?: string;
  options: ChipOption[];
  /** Selected value(s). A single string for single-select, an array for multi. */
  selected: string | string[] | null;
  onSelect: (value: string) => void;
  error?: string;
  /** Lay out in rows that wrap instead of one horizontally-scrolling row. */
  wrap?: boolean;
  emptyLabel?: string;
}

/**
 * Touch-sized option chips, matching the service-type selector on the project
 * detail screen. Chips are 44pt-tall targets so they stay tappable with gloves
 * on; the horizontal variant scrolls rather than shrinking the targets.
 */
export function ChipSelect({
  label,
  options,
  selected,
  onSelect,
  error,
  wrap = false,
  emptyLabel = "Sin opciones disponibles",
}: ChipSelectProps) {
  // Multi-select carries a checkbox glyph so a row of chips reads as "tick
  // the ones that apply" rather than "pick one" — otherwise the crew chips
  // and the shift-roster chips look identical.
  const multi = Array.isArray(selected);

  const isSelected = (value: string) =>
    Array.isArray(selected) ? selected.includes(value) : selected === value;

  const chips = options.map((option) => {
    const active = isSelected(option.value);
    return (
      <Pressable
        key={option.value}
        onPress={() => onSelect(option.value)}
        accessibilityRole={multi ? "checkbox" : "radio"}
        accessibilityState={{ checked: active, selected: active }}
        className={`min-h-11 flex-row items-center justify-center px-4 py-2.5 rounded-full border ${
          active
            ? "bg-primary-600 border-primary-600"
            : "bg-white border-gray-300"
        }`}
      >
        {multi && (
          <Ionicons
            name={active ? "checkbox" : "square-outline"}
            size={16}
            color={active ? "#ffffff" : "#9CA3AF"}
            style={{ marginRight: 6 }}
          />
        )}
        <Text
          className={`text-sm font-medium ${
            active ? "text-white" : "text-gray-700"
          }`}
        >
          {option.label}
        </Text>
      </Pressable>
    );
  });

  return (
    <View>
      {label && (
        <Text className="text-sm font-medium text-gray-700 mb-2">{label}</Text>
      )}

      {options.length === 0 ? (
        <Text className="text-sm text-gray-400">{emptyLabel}</Text>
      ) : wrap ? (
        <View className="flex-row flex-wrap gap-2">{chips}</View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">{chips}</View>
        </ScrollView>
      )}

      {error && <Text className="text-xs text-red-500 mt-1.5">{error}</Text>}
    </View>
  );
}
