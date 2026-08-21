import z from "zod";

export const MASTODON_PLATFORM_ID = "mastodon";
export const MastodonStoreSchema = z.object({
  tootIds: z.array(z.string()),
});
