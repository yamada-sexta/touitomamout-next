export type ReplyEntry = {
	root: {
		cid: string;
		uri: string;
	};
	parent: {
		cid: string;
		uri: string;
	};
};

export const buildReplyEntry = (
	rootPost: {cid: string; uri: string},
	parentPost?: {cid: string; uri: string},
): ReplyEntry => ({
	root: {
		cid: rootPost.cid,
		uri: rootPost.uri,
	},
	parent: {
		cid: (parentPost ?? rootPost).cid,
		uri: (parentPost ?? rootPost).uri,
	},
});
