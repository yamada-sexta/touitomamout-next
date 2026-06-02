import { type AppBskyFeedPost } from "@atproto/api";
import { type MetaPost } from "~/types/post";
import z from "zod";

export const BlueskyPlatformStore = z.object({
  cid: z.string(),
  rkey: z.string(),
});
export type BlueskyPostReference = {
  uri: string;
  cid: string;
  value: AppBskyFeedPost.Record;
};

export type BlueskyPost = {
  tweet: MetaPost;
  chunks: string[];
  username: string;
  quotePost?: BlueskyPostReference;
  replyPost?: BlueskyPostReference;
};
