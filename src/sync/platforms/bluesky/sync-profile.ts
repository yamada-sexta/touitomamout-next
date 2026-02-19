import {
  AppBskyActorProfile,
  BlobRef,
  type Agent,
  type Un$Typed,
} from "@atproto/api";
import { type Synchronizer } from "sync/synchronizer";
import { type BlueskyPlatformStore } from "./types";
import { uploadBlueskyMedia } from "./utils/upload-bluesky-media";
import { debug } from "utils/logs";

export function syncProfile(args: {
  agent: Agent;
}): Synchronizer<typeof BlueskyPlatformStore> {
  const { agent } = args;
  return {
    async syncBio(args) {
      await agent.upsertProfile((o) => ({
        ...o,
        description: args.formattedBio,
      }));
    },

    async syncUserName(args) {
      await agent.upsertProfile((o) => ({
        ...o,
        displayName: args.name,
      }));
    },

    async syncProfilePic(args) {
      const avatar = await uploadBlueskyMedia(args.pfpFile, agent);
      if (!avatar) {
        throw new Error(
          "Failed to upload avatar to Bluesky: avatar is undefined.",
        );
      }
      if (!avatar.success) {
        throw new Error("Failed to upload avatar");
      }
      const ref = avatar.data.blob;
      debug("bluesky avatar: ", avatar);

      await agent.upsertProfile((o) => {
        const existing: Un$Typed<AppBskyActorProfile.Record> = o ?? {};
        // WTF is going on with the bluesky api???
        existing.avatar = BlobRef.asBlobRef(ref.ref) ?? undefined;
        debug("o syncProfilePic bluesky", existing);
        return existing;
      });
    },

    async syncBanner(args) {
      const res = await uploadBlueskyMedia(args.bannerFile, agent);
      if (!res) {
        throw new Error("Unable to upload banner");
      }

      const ref = res.data.blob;
      debug("bluesky banner: ", res);

      await agent.upsertProfile((o) => {
        const existing: Un$Typed<AppBskyActorProfile.Record> = o ?? {};
        existing.banner = BlobRef.asBlobRef(ref.ref) ?? undefined;
        debug("o syncBanner bluesky", existing);
        return existing;
      });
    },
  };
}
