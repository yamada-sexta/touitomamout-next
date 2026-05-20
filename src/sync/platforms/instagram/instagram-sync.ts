import { SYNC_INSTAGRAM, VOID } from "env";
import { type SynchronizerFactory } from "sync/synchronizer";
import { debug, oraProgress } from "utils/logs";
import { getPostExcerpt } from "utils/post/get-post-excerpt";
import z from "zod";

const KEYS = [
  "INSTAGRAM_ACCESS_TOKEN",
  "INSTAGRAM_USER_ID",
  "INSTAGRAM_GRAPH_BASE_URL",
  "INSTAGRAM_GRAPH_VERSION",
  "INSTAGRAM_VIDEO_MEDIA_TYPE",
  "INSTAGRAM_SHARE_REELS_TO_FEED",
] as const;

const INSTAGRAM_CAPTION_MAX_LENGTH = 2200;
const INSTAGRAM_CAROUSEL_MAX_ITEMS = 10;
const CONTAINER_POLL_ATTEMPTS = 12;
const CONTAINER_POLL_INTERVAL_MS = 5000;

const InstagramStoreSchema = z.object({
  mediaId: z.string(),
  containerId: z.string(),
});

type InstagramContainerStatus =
  | "EXPIRED"
  | "ERROR"
  | "FINISHED"
  | "IN_PROGRESS"
  | "PUBLISHED";

type InstagramContainer = {
  id: string;
};

type InstagramPublishResponse = {
  id: string;
};

type InstagramStatusResponse = {
  status_code?: InstagramContainerStatus;
  status?: string;
};

type InstagramMediaInput = {
  type: "image" | "video";
  url: string;
  altText?: string;
};

function trimCaption(text: string): string {
  if (text.length <= INSTAGRAM_CAPTION_MAX_LENGTH) {
    return text;
  }

  return text.slice(0, INSTAGRAM_CAPTION_MAX_LENGTH - 1).trimEnd() + "…";
}

function joinUrl(baseUrl: string, graphVersion: string, path: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const version = graphVersion.replace(/^\/|\/$/g, "");
  const normalizedPath = path.replace(/^\//, "");
  return `${base}/${version}/${normalizedPath}`;
}

function getJsonMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return;
  }

  const error = "error" in data ? data.error : undefined;
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  if ("message" in data) {
    return String(data.message);
  }

  return undefined;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export const InstagramSynchronizerFactory: SynchronizerFactory<
  typeof KEYS,
  typeof InstagramStoreSchema
> = {
  EMOJI: "📸",
  DISPLAY_NAME: "Instagram",
  PLATFORM_ID: "instagram",
  ENV_KEYS: KEYS,
  STORE_SCHEMA: InstagramStoreSchema,
  FALLBACK_ENV: {
    INSTAGRAM_GRAPH_BASE_URL: "https://graph.instagram.com",
    INSTAGRAM_GRAPH_VERSION: "v24.0",
    INSTAGRAM_VIDEO_MEDIA_TYPE: "REELS",
    INSTAGRAM_SHARE_REELS_TO_FEED: "true",
  },
  async create(args) {
    if (!SYNC_INSTAGRAM) {
      throw new Error("Instagram will not be synced");
    }

    const accessToken = args.env.INSTAGRAM_ACCESS_TOKEN;
    const instagramUserId = args.env.INSTAGRAM_USER_ID;
    const graphBaseUrl = args.env.INSTAGRAM_GRAPH_BASE_URL;
    const graphVersion = args.env.INSTAGRAM_GRAPH_VERSION;
    const singleVideoMediaType = args.env.INSTAGRAM_VIDEO_MEDIA_TYPE;
    const shareReelsToFeed =
      args.env.INSTAGRAM_SHARE_REELS_TO_FEED.toLowerCase() === "true";

    async function instagramFetch<T>(
      path: string,
      init?: RequestInit,
    ): Promise<T> {
      const res = await fetch(joinUrl(graphBaseUrl, graphVersion, path), init);
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};

      if (!res.ok) {
        throw new Error(
          `Instagram API failed with status ${res.status}: ${
            getJsonMessage(data) ?? text
          }`,
        );
      }

      return data as T;
    }

    async function postToInstagram<T>(
      path: string,
      params: Record<string, string>,
    ): Promise<T> {
      const body = new URLSearchParams({
        ...params,
        access_token: accessToken,
      });

      return instagramFetch<T>(path, {
        method: "POST",
        body,
      });
    }

    async function getContainerStatus(
      containerId: string,
    ): Promise<InstagramStatusResponse> {
      const body = new URLSearchParams({
        fields: "status_code,status",
        access_token: accessToken,
      });
      return instagramFetch<InstagramStatusResponse>(
        `${containerId}?${body.toString()}`,
      );
    }

    async function waitForContainer(containerId: string): Promise<void> {
      for (let i = 0; i < CONTAINER_POLL_ATTEMPTS; i++) {
        const status = await getContainerStatus(containerId);
        debug("Instagram container status:", { containerId, status });

        if (
          status.status_code === "FINISHED" ||
          status.status_code === "PUBLISHED" ||
          status.status === "Finished"
        ) {
          return;
        }

        if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
          throw new Error(
            `Instagram container ${containerId} is ${status.status_code}`,
          );
        }

        await sleep(CONTAINER_POLL_INTERVAL_MS);
      }

      throw new Error(`Instagram container ${containerId} was not ready in time`);
    }

    async function createContainer(
      media: InstagramMediaInput,
      options: {
        caption?: string;
        carouselItem?: boolean;
      } = {},
    ): Promise<InstagramContainer> {
      const params: Record<string, string> = {};

      if (media.type === "image") {
        params.image_url = media.url;
        if (media.altText) {
          params.alt_text = media.altText;
        }
      } else {
        params.video_url = media.url;
        params.media_type = options.carouselItem
          ? "VIDEO"
          : singleVideoMediaType;
        if (!options.carouselItem && singleVideoMediaType === "REELS") {
          params.share_to_feed = String(shareReelsToFeed);
        }
      }

      if (options.carouselItem) {
        params.is_carousel_item = "true";
      }

      if (options.caption) {
        params.caption = options.caption;
      }

      return postToInstagram<InstagramContainer>(
        `${instagramUserId}/media`,
        params,
      );
    }

    async function publishContainer(
      containerId: string,
    ): Promise<InstagramPublishResponse> {
      return postToInstagram<InstagramPublishResponse>(
        `${instagramUserId}/media_publish`,
        {
          creation_id: containerId,
        },
      );
    }

    await instagramFetch<{ id: string }>(
      `${instagramUserId}?${new URLSearchParams({
        fields: "id,username",
        access_token: accessToken,
      }).toString()}`,
    );

    return {
      async syncPost(args) {
        const { tweet, log } = args;
        if (args.store.success) {
          args.log.info("skipping...");
          return { store: args.store.data };
        }

        const media: InstagramMediaInput[] = [
          ...tweet.photos.map((photo) => ({
            type: "image" as const,
            url: photo.url,
            altText: photo.alt_text,
          })),
          ...tweet.videos
            .filter((video) => video.url)
            .map((video) => ({
              type: "video" as const,
              url: video.url!,
            })),
        ].slice(0, INSTAGRAM_CAROUSEL_MAX_ITEMS);

        if (media.length === 0) {
          log.warn(
            `📸 | post skipped: Instagram requires image or video media (tweet: ${tweet.id})`,
          );
          return;
        }

        const caption = trimCaption(tweet.text || tweet.permanentUrl || VOID);
        log.text = `📸 | post sending: ${getPostExcerpt(caption)}`;

        let containerId: string;
        if (media.length === 1) {
          const container = await createContainer(media[0]!, { caption });
          containerId = container.id;
          await waitForContainer(containerId);
        } else {
          const childContainerIds: string[] = [];
          for (let i = 0; i < media.length; i++) {
            const child = await createContainer(media[i]!, {
              carouselItem: true,
            });
            await waitForContainer(child.id);
            childContainerIds.push(child.id);
            oraProgress(
              log,
              { before: "📸 | media processing: " },
              i + 1,
              media.length,
            );
          }

          const carousel = await postToInstagram<InstagramContainer>(
            `${instagramUserId}/media`,
            {
              media_type: "CAROUSEL",
              children: childContainerIds.join(","),
              caption,
            },
          );
          containerId = carousel.id;
          await waitForContainer(containerId);
        }

        const published = await publishContainer(containerId);
        debug("Published Instagram media:", published);

        return {
          store: {
            mediaId: published.id,
            containerId,
          },
        };
      },
    };
  },
};
