.. image:: _static/touitomamout.svg
   :alt: Touitomamout
   :width: 144px
   :align: center

Touitomamout Documentation
==========================

Touitomamout synchronizes posts and profile information from X to Bluesky,
Mastodon, Misskey, Discord, and Tumblr.

Start with the Docker setup, then configure a source account and at least one
destination. The configuration reference documents every supported destination,
synchronization controls, scheduling, and multi-account conventions.

Documentation
-------------

* :doc:`Getting started <getting-started>` explains how to run Touitomamout with
  Docker and how to work on the application locally.
* :doc:`Configuration <configuration>` covers source credentials, destination
  credentials, synchronization behavior, and multiple accounts.
* :doc:`Platform support <support>` summarizes the capabilities available for
  each destination.

Project links
-------------

* `Source code <https://github.com/yamada-sexta/touitomamout-next>`_
* `Issue tracker <https://github.com/yamada-sexta/touitomamout-next/issues>`_
* `Container images <https://github.com/yamada-sexta/touitomamout-next/pkgs/container/touitomamout-next>`_

.. toctree::
   :maxdepth: 2
   :hidden:

   getting-started
   configuration
   support
