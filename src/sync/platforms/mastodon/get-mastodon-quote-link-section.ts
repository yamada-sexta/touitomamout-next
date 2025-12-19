export function getMastodonQuoteLinkSection(args: {
  mastodonQuotedId: string;
  mastodonUsername: string;
  mastodonInstance: string;
}) {
  return `\n\nhttps://${args.mastodonInstance}/@${args.mastodonUsername}/${args.mastodonQuotedId}`;
}
