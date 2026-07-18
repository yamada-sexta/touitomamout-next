---
title: Platform Support
description: Compare Touitomamout synchronization capabilities across supported platforms.
---

Touitomamout supports text and media synchronization across five destination
types. Profile support includes the display name, biography, avatar, and banner
where the destination implements those fields.

| Platform        | Text | Images   | Videos | GIFs   | Replies/comments | Retweets | Profile |
| --------------- | ---- | -------- | ------ | ------ | ---------------- | -------- | ------- |
| Mastodon        | Yes  | Yes      | Yes    | Yes    | Yes              | Yes      | Yes     |
| Bluesky         | Yes  | Yes      | Yes    | Yes    | Yes              | Yes      | Yes     |
| Misskey         | Yes  | Yes      | Yes    | Yes    | Yes              | Yes      | Yes     |
| Discord webhook | Yes  | Embedded | Linked | Linked | Linked           | Embedded | No      |
| Tumblr          | Yes  | Yes      | Yes    | Yes    | Reblog           | Reblog   | No      |

## Destination differences

Bluesky and Mastodon split text that exceeds the platform limit into a reply
thread. Discord sends an embed through the configured webhook rather than
uploading a copy of every source asset.

Replies and retweets use the destination's native relationship when the
referenced post has already been synchronized. When it has not, Touitomamout
falls back to linking or embedding the source X post. Discord webhooks always
use linked or embedded context, while Tumblr represents replies and retweets as
reblogs. Retweet behavior is controlled by `SYNC_RETWEETS` and
`HANDLE_RETWEETS`; see the [configuration reference](../configuration/) for the
related settings.
