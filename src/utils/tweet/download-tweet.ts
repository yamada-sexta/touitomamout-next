// Import { Photo, Tweet, Video } from "@the-convocation/twitter-scraper";
// import { download } from "utils/medias/download-media";

// export type DownloadedVideo = Video & { file?: File };
// export type DownloadedPhoto = Photo & { file?: File };
// export interface DownloadedTweet extends Tweet {
//   videos: DownloadedVideo[];
//   photos: DownloadedPhoto[];
// }

// /**
//  * Checks if a tweet has already had its media downloaded.
//  * @param tweet The tweet to check.
//  * @returns True if the tweet is a DownloadedTweet, false otherwise.
//  */
// export function isDownloadedTweet(
//   tweet: Tweet | DownloadedTweet,
// ): tweet is DownloadedTweet {
//   const videosAreDownloaded = tweet.videos.every((video) =>
//     video.url ? "file" in video : true,
//   );
//   const photosAreDownloaded = tweet.photos.every((photo) =>
//     photo.url ? "file" in photo : true,
//   );
//   return videosAreDownloaded && photosAreDownloaded;
// }

// /**
//  * Converts a Tweet to a DownloadedTweet by downloading its media.
//  * If the tweet is already a DownloadedTweet, it returns it directly.
//  * @param tweet The tweet to process.
//  * @returns A promise that resolves to a DownloadedTweet.
//  */
// export async function downloadTweet(
//   tweet: Tweet | DownloadedTweet,
// ): Promise<DownloadedTweet> {
//   if (isDownloadedTweet(tweet)) {
//     return tweet;
//   }
//   const downloadedPhotos = await Promise.all(
//     tweet.photos.map(async (photo): Promise<DownloadedPhoto> => {
//       const blob = await download(photo.url);
//       return { ...photo, file: blob };
//     }),
//   );
//   const downloadedVideos = await Promise.all(
//     tweet.videos.map(async (video): Promise<DownloadedVideo> => {
//       // Assumption: The last variant has the highest bitrate/quality
//       //   const bestVariant = video.variants[video.variants.length - 1];
//       const blob = await download(video.url);
//       return { ...video, file: blob };
//     }),
//   );
//   return {
//     ...tweet,
//     photos: downloadedPhotos,
//     videos: downloadedVideos,
//   };
// }
