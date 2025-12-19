import {type Tweet} from '@the-convocation/twitter-scraper';
import {formatTweetText} from './format-tweet-text';

export const tweetFormatter = (tweet: Tweet): Tweet => ({
	...tweet,
	timestamp: (tweet.timestamp ?? 0) * 1000,
	text: formatTweetText(tweet),
});
