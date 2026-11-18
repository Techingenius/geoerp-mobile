import { View, Text, Image, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ProductionEntryPhoto } from "../../types/database";

interface ProductionPhotoGridProps {
  photos: ProductionEntryPhoto[];
  /** Signed URL per `storage_path`; a missing entry renders a placeholder. */
  urls: Record<string, string>;
  /** `sm` for the thumbnails on a list card, `lg` for an entry's own screen. */
  size?: "sm" | "lg";
  /** Omitted when the viewer may not delete — the policy decides, not the UI. */
  onRemove?: (photo: ProductionEntryPhoto) => void;
  /** The photo currently being deleted, so its tile shows the wait. */
  removingPhotoId?: string | null;
}

/**
 * The photos of one production entry.
 *
 * The bucket is private, so every tile needs a signed URL rather than a path
 * — and a tile whose URL did not come back renders as a placeholder instead of
 * a broken image, because one unreadable object should not take the grid with
 * it.
 */
export function ProductionPhotoGrid({
  photos,
  urls,
  size = "sm",
  onRemove,
  removingPhotoId,
}: ProductionPhotoGridProps) {
  if (photos.length === 0) return null;

  const tile = size === "lg" ? "w-28 h-28" : "w-16 h-16";

  return (
    <View className="flex-row flex-wrap gap-2">
      {photos.map((photo) => {
        const url = urls[photo.storage_path];
        const isRemoving = removingPhotoId === photo.id;

        return (
          <View key={photo.id} className="relative">
            {url ? (
              <Image
                source={{ uri: url }}
                className={`${tile} rounded-lg bg-gray-100`}
                resizeMode="cover"
                accessibilityLabel={photo.filename}
              />
            ) : (
              <View
                className={`${tile} rounded-lg bg-gray-100 items-center justify-center`}
              >
                <Ionicons name="image-outline" size={20} color="#9CA3AF" />
              </View>
            )}

            {isRemoving && (
              <View className="absolute inset-0 items-center justify-center rounded-lg bg-black/40">
                <ActivityIndicator color="#ffffff" />
              </View>
            )}

            {onRemove && !isRemoving && (
              <Pressable
                onPress={() => onRemove(photo)}
                // 48x48 hit area for a gloved thumb, over a 24px visual badge.
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={`Eliminar ${photo.filename}`}
                className="absolute -top-2 -right-2 h-6 w-6 items-center justify-center rounded-full bg-red-500"
              >
                <Ionicons name="close" size={14} color="white" />
              </Pressable>
            )}

            {size === "lg" && photo.location && (
              <View className="absolute bottom-1 left-1 flex-row items-center gap-0.5 rounded bg-black/55 px-1 py-0.5">
                <Ionicons name="location" size={10} color="#ffffff" />
                <Text className="text-[9px] font-medium text-white">GPS</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
