import { debug } from "#app/utils/logs";

export async function compressMedia(
  inputBlob: Blob,
  targetSizeInBytes: number,
): Promise<Blob | void> {
  if (inputBlob.type.startsWith("video/")) {
    console.warn("Unable to compress videos");
    return;
  }

  if (inputBlob.size > targetSizeInBytes) {
    debug(
      "Image compression is unavailable in the native build; uploading the original image",
    );
  }
  return inputBlob;
}
