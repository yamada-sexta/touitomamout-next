import { type Agent } from "@atproto/api";
import { type Synchronizer } from "sync/synchronizer";
import { type BlueskyPlatformStore } from "./types";
import { uploadBlueskyMedia } from "./utils/upload-bluesky-media";

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
        throw new Error("Failed to upload avatar");
      }

      await agent.upsertProfile((o) => ({
        ...o,
        avatar: avatar.data.blob,
      }));
    },

    async syncBanner(args) {
      const res = await uploadBlueskyMedia(args.bannerFile, agent);
      if (!res) {
        throw new Error("Unable to upload banner");
      }

      await agent.upsertProfile((o) => ({
        ...o,
        banner: res?.data.blob,
      }));
    },
  };
}
