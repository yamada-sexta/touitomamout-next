import {DEBUG} from 'env';
import {type Ora} from 'ora';

export function logError(
	log: Ora,
	error: unknown,
	type: 'fail' | 'warn' = 'fail',
) {
	const errorString = error instanceof Error ? error.message : String(error);

	return (strings: TemplateStringsArray, ...values: unknown[]) => {
		const message = strings.reduce((out, string_, i) => {
			let value = '';
			if (i < values.length) {
				// If the interpolated value is the *same object* as error
				value = values[i] === error ? errorString : String(values[i]);
			}

			return out + string_ + value;
		}, '');

		switch (type) {
			case 'fail': {
				log.fail(message);
				console.warn(error);
				break;
			}

			case 'warn': {
				log.warn(message);
				break;
			}
		}
	};
}

export const oraPrefix = (prefix: string): string => prefix.padEnd(15, ' ');

const SEGMENT_DONE = '█';
const SEGMENT_UNDONE = '░';
export const oraProgress = (
	ora: Ora,
	text: {
		before?: string;
		after?: string;
	},
	index: number,
	maximum: number,
) => {
	const textBefore = text.before ?? ' ';
	const textAfter = text.after ?? ' ';
	const progress = Math.round((index / maximum) * 100);
	const segments = Math.round(progress / 5);
	const bar = `${SEGMENT_DONE.repeat(segments)}${SEGMENT_UNDONE.repeat(20 - segments)}`;
	ora.text = `${textBefore + ' '}${bar} ${progress}% ${textAfter}`;
};

export function debug(...args: unknown[]) {
	if (DEBUG) {
		console.log('[DEBUG]', ...args);
	}
}
