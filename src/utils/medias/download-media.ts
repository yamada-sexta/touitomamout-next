import {type Ora} from 'ora';
import {logError, oraProgress} from 'utils/logs';
/**
 * A method to download the media.
 */
export async function download(
	url?: string,
	log?: Ora,
	description?: string,
	filename?: string,
): Promise<File | undefined> {
	if (!url) {
		return;
	}

	const displayUrl
    = description ?? (url.length > 50 ? `${url.slice(0, 50)}...` : url);
	log && (log.text = `Connecting: ${displayUrl}`);
	try {
		// 1. Start the fetch request
		const res = await fetch(url);
		if (!res.ok) {
			throw new Error(`HTTP error! Status: ${res.status} ${res.statusText}`);
		}

		if (!res.body) {
			throw new Error('Response body is not readable.');
		}

		const contentType
      = res.headers.get('content-type') || 'application/octet-stream';
		const contentLength = Number(res.headers.get('content-length')) || 0;

		const reader = res.body.getReader();

		let received = 0;
		const chunks: BlobPart[] = [];

		while (true) {
			const {done, value} = await reader.read();
			if (done) {
				break;
			}

			if (value) {
				chunks.push(value);
				received += value.length;
				// Update progress bar
				log
				&& oraProgress(
					log,
					{before: 'Downloading', after: displayUrl},
					received,
					contentLength,
				);
			}
		}

		// Derive a filename:
		let finalName = filename;
		if (!finalName) {
			// Try Content-Disposition header
			const contentDisposition = res.headers.get('content-disposition');
			const match = contentDisposition?.match(/filename="?([^"]+)"?/);
			if (match) {
				finalName = match[1];
			} else {
				// Fallback to last part of URL
				finalName = url.split('/').pop() || 'downloaded-file';
			}
		}

		const file = new File(chunks, finalName, {
			type: contentType,
			lastModified: Date.now(),
		});

		log?.succeed(`${displayUrl} downloaded successfully`);

		return file;
	} catch (error) {
		log && logError(log, error)`Unable to download media: ${error}`;
		return undefined;
	}
}
