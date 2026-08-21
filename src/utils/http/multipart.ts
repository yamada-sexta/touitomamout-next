type MultipartValue = string | Blob;

export type MultipartField = {
  name: string;
  value: MultipartValue;
  filename?: string;
};

const encoder = new TextEncoder();

function escapeDisposition(value: string): string {
  if (value.includes("\r") || value.includes("\n")) {
    throw new Error("Multipart disposition values must not contain newlines");
  }
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function concatenate(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

export async function encodeMultipart(
  fields: MultipartField[],
): Promise<{ body: Uint8Array<ArrayBuffer>; contentType: string }> {
  const boundary = `----touitomamout-${crypto.randomUUID()}`;
  const chunks: Uint8Array[] = [];

  for (const field of fields) {
    let disposition = `Content-Disposition: form-data; name="${escapeDisposition(field.name)}"`;
    if (typeof field.value !== "string") {
      const filename =
        field.filename ??
        (field.value instanceof File ? field.value.name : "upload");
      disposition += `; filename="${escapeDisposition(filename)}"`;
    }

    chunks.push(encoder.encode(`--${boundary}\r\n${disposition}\r\n`));
    if (typeof field.value === "string") {
      chunks.push(encoder.encode(`\r\n${field.value}\r\n`));
    } else {
      chunks.push(
        encoder.encode(
          `Content-Type: ${field.value.type || "application/octet-stream"}\r\n\r\n`,
        ),
      );
      chunks.push(new Uint8Array(await field.value.arrayBuffer()));
      chunks.push(encoder.encode("\r\n"));
    }
  }

  chunks.push(encoder.encode(`--${boundary}--\r\n`));
  return {
    body: concatenate(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}
