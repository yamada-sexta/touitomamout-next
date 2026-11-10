CREATE TABLE `pinned_post` (
  `user_handle` text NOT NULL,
  `platform` text NOT NULL,
  `tweet_id` text NOT NULL,
  PRIMARY KEY (`user_handle`, `platform`)
);
