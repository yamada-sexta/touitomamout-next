export function getMastodonQuoteLinkSection(args: {
  mastodonQuotedId: string;
  mastodonUsername: string;
  mastodonInstance: URL;
}) {
  const statusURL = new URL(
    `/@${args.mastodonUsername}/${args.mastodonQuotedId}`,
    args.mastodonInstance,
  );

  return `\n\n${statusURL.href}`;
}
