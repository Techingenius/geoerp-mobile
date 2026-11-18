import * as ImagePicker from "expo-image-picker";

/** A photo captured on the device, before any upload. */
export interface CapturedPhoto {
  uri: string;
  filename: string;
  mimeType: string;
}

export type CaptureOutcome =
  | { status: "captured"; photo: CapturedPhoto }
  | { status: "cancelled" }
  | { status: "denied" };

/**
 * Open the camera and return one photo.
 *
 * The camera, never the gallery: a production photo is evidence that the work
 * was done on the day it was reported, and a gallery pick is evidence of
 * nothing. `quality: 0.7` keeps a field upload inside the bucket's 10MB limit
 * on a connection that may be one bar; `exif: true` keeps the original capture
 * metadata on the file.
 *
 * Returns the outcome instead of alerting, so the calling screen decides how a
 * denied permission reads in its own context.
 */
export async function captureProductionPhoto(): Promise<CaptureOutcome> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") return { status: "denied" };

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.7,
    exif: true,
  });

  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return { status: "cancelled" };

  return {
    status: "captured",
    photo: {
      uri: asset.uri,
      // Android's camera intent often returns no fileName at all, and the
      // upload needs an extension to pick a content type.
      filename: asset.fileName ?? `produccion_${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? "image/jpeg",
    },
  };
}
