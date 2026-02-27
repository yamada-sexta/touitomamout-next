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

  let updateQueue = Promise.resolve();
  const queueUpsert = (
    updater: (
      o: Un$Typed<AppBskyActorProfile.Record> | undefined,
    ) => Un$Typed<AppBskyActorProfile.Record>,
  ) => {
    updateQueue = updateQueue.then(async () => {
      const existing = await agent.com.atproto.repo
        .getRecord({
          repo: agent.did ?? "",
          collection: "app.bsky.actor.profile",
          rkey: "self",
        })
        .then((res) => {
          debug("Fetched profile for queueUpsert getRecord", {
            profile: res.data.value,
          });
          return res;
        })
        .catch((e) => {
          console.warn(
            "Failed to fetch existing profile record in queueUpsert, proceeding with undefined",
            { error: e },
          );
        });

      debug("Existing profile record in queueUpsert", { existing });
      const updated = updater(existing?.data.value);
      await agent.com.atproto.repo.putRecord({
        repo: agent.did ?? "",
        collection: "app.bsky.actor.profile",
        rkey: "self",
        record: updated,
      });
    });
    return updateQueue;
  };

  let lastProfilePic: BlobRef | undefined = undefined;
  let lastBanner: BlobRef | undefined = undefined;

  return {
    async syncBio(args) {
      await queueUpsert((o) => ({
        ...o,
        description: args.formattedBio,
      }));
    },

    async syncUserName(args) {
      const profile = await agent.getProfile({
        actor: agent?.did ?? "",
      });
      debug("Fetched profile for syncUserName", { profile });
      if (profile.data) {
        debug("Current profile data", { profile: profile.data });
      }
      await queueUpsert((o) => {
        const existing: Un$Typed<AppBskyActorProfile.Record> = o ?? {};
        const updated = {
          ...existing,
          displayName: args.name,
        };

        debug("o syncUserName bluesky", updated);
        return updated;
      });
    },

    async syncProfilePic(args) {
      // 1. Upload the media OUTSIDE of the upsertProfile callback
      const { blobRef } = await uploadBlueskyMedia(args.pfpFile, agent);
      lastProfilePic = blobRef;

      if (!lastProfilePic) {
        throw new Error("Failed to upload avatar to Bluesky");
      }

      // 2. Use a synchronous callback to update the profile
      await queueUpsert((o) => {
        const existing: Un$Typed<AppBskyActorProfile.Record> = o ?? {};

        // Spread the existing properties to ensure nothing is lost
        const updated = {
          ...existing,
          avatar: blobRef,
        };

        debug("o syncProfilePic bluesky", updated);
        return updated;
      });
    },

    async syncBanner(args) {
      // 1. Upload the media OUTSIDE of the upsertProfile callback
      const { blobRef } = await uploadBlueskyMedia(args.bannerFile, agent);
      lastBanner = blobRef;

      if (!lastBanner) {
        throw new Error("Failed to upload banner to Bluesky");
      }

      // 2. Use a synchronous callback to update the profile
      await queueUpsert((o) => {
        const existing: Un$Typed<AppBskyActorProfile.Record> = o ?? {};

        const updated = {
          ...existing,
          banner: blobRef,
        };

        debug("o syncBanner bluesky", updated);
        return updated;
      });
    },
  };
}
