import {
  AppBskyActorProfile,
  BlobRef,
  ComAtprotoRepoUploadBlob,
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

  let lastProfilePic: ComAtprotoRepoUploadBlob.Response | undefined = undefined;
  let lastBanner: ComAtprotoRepoUploadBlob.Response | undefined = undefined;
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
      lastProfilePic = await uploadBlueskyMedia(args.pfpFile, agent);
      if (!lastProfilePic) {
        throw new Error(
          "Failed to upload avatar to Bluesky: avatar is undefined.",
        );
      }
      if (!lastProfilePic.success) {
        throw new Error("Failed to upload avatar");
      }

      debug("bluesky avatar: ", lastProfilePic);

      const ref = lastProfilePic.data.blob;

      await agent.upsertProfile(async (o) => {
        const existing: Un$Typed<AppBskyActorProfile.Record> = o ?? {};

        // WTF is going on with the bluesky api???
        existing.avatar = BlobRef.asBlobRef(ref.original) ?? undefined;
        existing.banner = lastBanner?.data.blob ?? existing.banner;
        debug("o syncProfilePic bluesky", existing);
        return existing;
      });
    },

    async syncBanner(args) {
      lastBanner = await uploadBlueskyMedia(args.bannerFile, agent);
      if (!lastBanner) {
        throw new Error("Unable to upload banner");
      }

      const ref = lastBanner.data.blob;
      debug("bluesky banner: ", lastBanner, "json", ref.toJSON());

      await agent.upsertProfile(async (o) => {
        const existing: Un$Typed<AppBskyActorProfile.Record> = o ?? {};
        existing.banner = BlobRef.asBlobRef(ref.original) ?? undefined;
        existing.avatar = lastProfilePic?.data.blob ?? existing.avatar;
        debug("o syncBanner bluesky", existing);
        return existing;
      });
    },
  };
}
