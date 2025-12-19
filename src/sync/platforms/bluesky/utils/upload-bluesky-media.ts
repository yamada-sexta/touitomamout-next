import {type Agent, type ComAtprotoRepoUploadBlob} from '@atproto/api';
import {debug} from 'utils/logs';
import {parseBlobForBluesky} from './parse-blob-for-bluesky';

/**
 * An async method to upload a media to Bluesky.
 * @returns the bluesky media references
 */
export const uploadBlueskyMedia = async (
	mediaBlob: Blob,
	blueskyClient: Agent,
): Promise<ComAtprotoRepoUploadBlob.Response | undefined> => parseBlobForBluesky(mediaBlob)
	.then(async ({blobData, mimeType}) =>
		blueskyClient?.uploadBlob(blobData, {
			encoding: mimeType,
		}))
	.catch(error => {
		debug('Error uploading media to Bluesky:', error);
		return undefined;
	});
