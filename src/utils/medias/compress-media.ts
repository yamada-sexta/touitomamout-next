import { DEBUG } from "env";

const photon = require("@silvia-odwyer/photon-node");

const findSmallerBuffer = (
  compressedBuffers: CompressedBuffer[],
): CompressedBuffer | undefined => {
  return compressedBuffers.reduce((smaller, current) =>
    current.buffer.length < smaller.buffer.length ? current : smaller,
  );
};

type CompressedBuffer = {
  buffer: Buffer;
  format: string;
};

type FormatConfig = {
  extension: string;
  formatName: string;
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

  // Convert buffer to base64 for Photon
  const base64Data = inputBuffer.toString('base64');
  
  // Load the image with Photon
  let photonImg = photon.PhotonImage.new_from_base64(base64Data);
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
    
    if (newWidth !== photonImg.get_width() || newHeight !== photonImg.get_height()) {
      photonImg = photon.resize(photonImg, newWidth, newHeight, 1); // 1 = Lanczos3 sampling filter
    }

    // Get base64 output
    const outputBase64 = photonImg.get_base64();
    const outputData = outputBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(outputData, 'base64');

    compressedBuffer = {
      buffer,
      format: inputBlob.type,
    };

    // If quality is too low, resize the image and restart
    if (quality <= 65) {
      quality = 100;
      width = width * resizeRatio;
      height = height * resizeRatio;
    } else {
      quality -= sizeDecreaseStep;
    }
  }

  if (DEBUG) {
    console.log(
      `Compression results : ${inputBuffer.length / 1000}kB -> ${compressedBuffer.buffer.length / 1000
      }kB`,
    );
  }
  return new Blob([new Uint8Array(compressedBuffer.buffer)], {
    type: compressedBuffer.format,
  });
};
