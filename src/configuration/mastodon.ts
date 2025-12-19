import {SYNC_MASTODON, type TwitterHandle} from 'env';
import {createRestAPIClient, type mastodon} from 'masto';
import ora from 'ora';
import {TouitomamoutError} from 'utils/error';
import {oraPrefix} from 'utils/logs';

export async function createMastodonClient(args: {
	handle: TwitterHandle;
}): Promise<mastodon.rest.Client | void> {
	if (!SYNC_MASTODON) {
		console.log('Mastodon will not be synced');
		return;
	}

	const instance = process.env['MASTODON_INSTANCE' + args.handle.postFix];

	if (!instance) {
		console.log('MASTODON_INSTANCE not set for ' + args.handle.handle);
		return;
	}

	const accessToken
    = process.env['MASTODON_ACCESS_TOKEN' + args.handle.postFix];
	if (!accessToken) {
		console.log('MASTODON_ACCESS_TOKEN not set for ' + args.handle.handle);
		return;
	}

	const log = ora({
		color: 'gray',
		prefixText: oraPrefix('🦣 client'),
	}).start('connecting to mastodon...');
	const mastodonClient = createRestAPIClient({
		url: `https://${instance}`,
		accessToken,
	});

	await mastodonClient.v1.accounts
		.verifyCredentials()
		.then(() => log.succeed('connected'))
		.catch(() => {
			log.fail('authentication failure');
			throw new Error(new TouitomamoutError(
				'Touitomamout was unable to connect to mastodon with the given credentials',
				['Please check your .env settings.'],
			));
		});
}
