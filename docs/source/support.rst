Platform Support
================

Touitomamout supports text and media synchronization across five destination
types. Profile support includes the display name, biography, avatar, and banner
where the destination implements those fields.

.. list-table::
   :header-rows: 1
   :widths: 24 12 20 14 14 16

   * - Platform
     - Text
     - Images
     - Videos
     - GIFs
     - Profile
   * - Mastodon
     - Yes
     - Yes
     - Yes
     - Yes
     - Yes
   * - Bluesky
     - Yes
     - Yes
     - Yes
     - Yes
     - Yes
   * - Misskey
     - Yes
     - Yes
     - Yes
     - Yes
     - Yes
   * - Discord webhook
     - Yes
     - Embedded
     - Linked
     - Linked
     - No
   * - Tumblr
     - Yes
     - Yes
     - Yes
     - Yes
     - No

Destination differences
-----------------------

Bluesky and Mastodon split text that exceeds the platform limit into a reply
thread. Discord sends an embed through the configured webhook rather than
uploading a copy of every source asset. Retweet behavior also depends on
whether a corresponding destination post already exists; see the
:doc:`configuration reference <configuration>` for the related settings.
