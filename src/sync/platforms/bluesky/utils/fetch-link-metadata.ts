import { debug } from "utils/logs";
import { z } from "zod";

const LinkMetadataSchema = z.object({
  title: z.string().default(""),
  description: z.string().default(""),
  image: z.string().default(""),
  // Use .optional() for fields that might not be present
  error: z.string().default(""),
  Error: z.string().optional(),
  likely_type: z.string().optional(),
  url: z
    .url()
    .or(z.literal(""))
    .optional()
    .transform((value) => (value ? value : undefined)),
});
export type LinkMetadata = z.infer<typeof LinkMetadataSchema>;

/**
 * Fetches metadata for a given URL.
 * @param {string} url - The URL for which to fetch metadata.
 * @returns {Promise<LinkMetadata> | undefined} - A promise that resolves with the fetched metadata or undefined if an error occurred.
 */
export async function fetchLinkMetadata(
  url: string,
): Promise<LinkMetadata | undefined> {
  try {
    const res = await fetch(
      `https://cardyb.bsky.app/v1/extract?url=${encodeURI(url)}`,
      {
        method: "GET",
      },
    );
    const object = (await res.json()) as unknown;
    const validationResult = LinkMetadataSchema.safeParse(object);
    if (!validationResult.success) {
      // Zod gives you detailed errors about what went wrong!
      console.error(
        "Schema validation failed:",
        object,
        z.treeifyError(validationResult.error),
      );
      return;
    }

    const { data } = validationResult;
    if (data.error || data.Error) {
      return;
    }

    debug("fetched link metadata:", data);
    return data;
  } catch (error) {
    console.error(`Error while fetching link metadata: ${error}`);
  }
}
