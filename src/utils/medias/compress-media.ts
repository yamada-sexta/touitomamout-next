import { DEBUG } from "env";
import Vips from 'wasm-vips';
import "./node_modules/wasm-vips/lib/vips.wasm";

const vips = await Vips();

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

  // Initialize vips
  // const vips = await getVips();

  // Load the image and get metadata
  using im = vips.Image.newFromBuffer(inputBuffer);
  let width = im.width;
  let height = im.height;

  // Initial quality (compression level) and size decrease step
  let quality = 100;
  const sizeDecreaseStep = 5;
  const resizeRatio = 0.95;

  // Loop until the image size is below the target size
  while (compressedBuffer.buffer.length > targetSizeInBytes && quality > 60) {
    // Test quality for each format
    const formats: FormatConfig[] = [
      { extension: '.jpg', formatName: 'jpeg' },
      { extension: '.png', formatName: 'png' }
    ];

    const compressWithFormat = async (
      acc: Promise<CompressedBuffer[]>,
      currentFormat: FormatConfig,
    ) => {
      try {
        // Load and resize image
        using image = vips.Image.newFromBuffer(inputBuffer);
        using resized = image.resize(width / image.width);

        // Write to buffer with quality settings
        const buffer = Buffer.from(
          resized.writeToBuffer(currentFormat.extension, {
            Q: quality,
          })
        );

        return [...(await acc), { buffer, format: currentFormat.formatName }];
      } catch (error) {
        console.error(`Error processing format ${currentFormat.formatName}: ${error}`);
        return await acc;
      }
    };

    // Compress the image with each format
    await formats
      .reduce(compressWithFormat, Promise.resolve([]))
      .then(findSmallerBuffer)
      .then((buffer) => {
        if (buffer) {
          compressedBuffer = {
            ...buffer,
            format: `image/${buffer.format}`,
          };
        }
      });

    // If quality is too low, resize the image and restart
    if (quality <= 65) {
      quality = 100;
      width = Math.ceil(width * resizeRatio);
      height = Math.ceil(height * resizeRatio);
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
