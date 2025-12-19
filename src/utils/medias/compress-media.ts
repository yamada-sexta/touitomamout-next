import photon from "@silvia-odwyer/photon-node";
import { debug } from "utils/logs";

// const findSmallerBuffer = (compressedBuffers: CompressedBuffer[]): CompressedBuffer | undefined => compressedBuffers.reduce((smaller, current) =>
// 	current.buffer.length < smaller.buffer.length ? current : smaller);

type CompressedBuffer = {
  buffer: Buffer;
  format: string;
};

export async function compressMedia(
  inputBlob: Blob,
  targetSizeInBytes: number,
): Promise<Blob | void> {
  if (inputBlob.type.startsWith("video/")) {
    console.log("Unable to compress videos");
    return;
  }

  // Get buffer from input blob
  const inputBuffer = await inputBlob
    .arrayBuffer()
    .then((buffer) => Buffer.from(buffer));

  let compressedBuffer: CompressedBuffer = {
    buffer: inputBuffer,
    format: inputBlob.type,
  };

  // Early return if the image is already smaller than the target size
  if (compressedBuffer.buffer.length <= targetSizeInBytes) {
    return inputBlob;
  }

  // Load the image with Photon
  let photonImg = photon.PhotonImage.new_from_blob(inputBlob);
  let width = photonImg.get_width();
  let height = photonImg.get_height();

  // Initial quality (compression level) and size decrease step
  let quality = 100;
  const sizeDecreaseStep = 5;
  const resizeRatio = 0.95;

  // Loop until the image size is below the target size
  while (compressedBuffer.buffer.length > targetSizeInBytes && quality > 60) {
    // Resize image if needed
    const newWidth = Math.ceil(width);
    const newHeight = Math.ceil(height);

    if (
      newWidth !== photonImg.get_width() ||
      newHeight !== photonImg.get_height()
    ) {
      photonImg = photon.resize(photonImg, newWidth, newHeight, 1); // 1 = Lanczos3 sampling filter
    }

    const u8Array: Uint8Array = photonImg.get_bytes_jpeg(quality);
    const buffer = Buffer.from(u8Array);
    compressedBuffer = {
      buffer,
      format: "image/jpeg",
    };

    // If quality is too low, resize the image and restart
    if (quality <= 65) {
      quality = 100;
      width *= resizeRatio;
      height *= resizeRatio;
    } else {
      quality -= sizeDecreaseStep;
    }
  }

  debug(
    "Compression results :",
    `${inputBuffer.length / 1000}kB -> ${compressedBuffer.buffer.length / 1000}kB`,
  );

  return new Blob([new Uint8Array(compressedBuffer.buffer)], {
    type: compressedBuffer.format,
  });
}
