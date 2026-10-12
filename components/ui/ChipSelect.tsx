import { View, Text, Pressable, ScrollView } from "react-native";

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
  const isSelected = (value: string) =>
    Array.isArray(selected) ? selected.includes(value) : selected === value;

  const chips = options.map((option) => (
    <Pressable
      key={option.value}
      onPress={() => onSelect(option.value)}
      className={`min-h-11 justify-center px-4 py-2.5 rounded-full border ${
        isSelected(option.value)
          ? "bg-primary-600 border-primary-600"
          : "bg-white border-gray-300"
      }`}
    >
      <Text
        className={`text-sm font-medium ${
          isSelected(option.value) ? "text-white" : "text-gray-700"
        }`}
      >
        {option.label}
      </Text>
    </Pressable>
  ));

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
