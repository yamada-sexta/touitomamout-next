Getting Started
===============

Docker is the recommended way to run Touitomamout. It provides a reproducible
runtime and keeps the synchronization database on the host.

Run with Docker
---------------

Create a directory with the following structure:

.. code-block:: text

   touitomamout/
   ├── docker-compose.yml
   ├── .env
   └── data/

Create ``docker-compose.yml``:

.. code-block:: yaml

   services:
     touitomamout:
       container_name: "touitomamout"
       image: ghcr.io/yamada-sexta/touitomamout-next:latest
       restart: unless-stopped
       env_file: ".env"
       environment:
         - DATABASE_PATH=/data/database.sqlite
       volumes:
         - ./data:/data

Create ``.env`` using the :doc:`configuration reference <configuration>`, then
start the service:

.. code-block:: console

   $ docker compose pull
   $ docker compose up -d

Follow the application log while verifying a new setup:

.. code-block:: console

   $ docker compose logs -f touitomamout

Update an installation
~~~~~~~~~~~~~~~~~~~~~~

Pull the current image and recreate the container so that image and environment
changes take effect:

.. code-block:: console

   $ docker compose pull
   $ docker compose up -d --force-recreate

``docker compose restart`` does not reload values changed in ``.env``.

Local development
-----------------

Install `Bun <https://bun.sh/>`_, clone the repository, and install its
dependencies:

.. code-block:: console

   $ git clone https://github.com/yamada-sexta/touitomamout-next.git
   $ cd touitomamout-next
   $ bun install

Run the application from source:

.. code-block:: console

   $ bun dev

The source checkout uses ``.env`` from the repository root. Copy
``.env.example`` to ``.env`` and replace the example credentials before
starting the application.
