# HRIS-KIOSK on Docker Compose (Ubuntu)

This sets up the **server-side** of the kiosk: the MySQL database (`tdt_ims`),
the PHP backend (Apache), and the Python face recognition server. The React
Native/Expo app itself runs on the tablet, not in Docker — you'll point it at
this server's IP afterward.

Heads up: the repo's own root `Dockerfile` doesn't actually work — it serves a
stale `public/` folder that's missing files the API depends on. The files
below replace it with a setup that uses the real `backend-php/` code.

## 0. Prerequisites on your Ubuntu box

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER   # log out/in after this
```

## 1. Clone the repo

```bash
git clone https://github.com/TDTPowersteel/HRIS-KIOSK.git
cd HRIS-KIOSK
```

## 2. Drop in these files

Copy the files from this package into the cloned repo, preserving the paths:

```
HRIS-KIOSK/
├── docker-compose.yml          ← repo root
├── .env                        ← repo root (copy from .env.example, fill in passwords)
├── db/
│   └── init.sql                ← new folder
├── backend-php/
│   └── Dockerfile              ← goes inside the EXISTING backend-php folder
└── face_server/
    └── Dockerfile              ← goes inside the EXISTING face_server folder
```

```bash
cp /path/to/this-package/docker-compose.yml ./
cp /path/to/this-package/.env.example ./.env
mkdir -p db && cp /path/to/this-package/db/init.sql ./db/
cp /path/to/this-package/backend-php/Dockerfile ./backend-php/
cp /path/to/this-package/face_server/Dockerfile ./face_server/
```

Edit `.env` and set real passwords:

```bash
nano .env
```

## 3. Build and start

```bash
docker compose up -d --build
```

First boot will take a while — the face server downloads the `buffalo_sc` and
`buffalo_l` face recognition models (a few hundred MB) on its first run. Watch it with:

```bash
docker compose logs -f face_server
```

You're looking for: `Starting HRIS Face Embedding Server on port 5001 (Production Mode)...`

## 4. Sanity-check everything is up

```bash
docker compose ps
curl http://localhost:8000/settings.php          # PHP backend — should return JSON
curl -X POST http://localhost:5001/embed_single   # face server — should return a JSON error (no image sent), confirming it's alive
```

The PHP backend talks to MySQL using the `db` service name and to the face
server using `http://face_server:5001` — both wired up automatically via the
Docker network, you don't need to touch `backend-php/.env` for any of that.

## 5. Point the kiosk app at this server

This is the one manual step Docker can't do for you. On your Ubuntu host, find
its LAN IP:

```bash
hostname -I
```

Then on the tablet/dev machine, before building the Expo app, set:
- `EXPO_PUBLIC_BACKEND_IP=<your-ubuntu-IP>` in the app's env
- `src/config/backend.ts` → base URL `http://<your-ubuntu-IP>:8000`

Ports exposed by this stack: `8000` (PHP API), `5001` (face server), `3306`
(MySQL, optional — only needed if you want to connect a DB client directly).

## 6. First-time application setup

- Default admin/settings password is `admin123` (set on first request to
  `settings.php`, stored in the `backend_storage` volume — change it via the
  app's settings screen).
- You'll need to add departments and interns to `tdt_ims` — `db/init.sql`
  only creates the schema and one "Internship" department, not any people.
  You can do this with a MySQL client (e.g. `docker exec -it hris_mysql mysql
  -u root -p tdt_ims`) or build a small admin UI later.

## Notes on `db/init.sql`

The repo doesn't ship a `.sql` schema dump, so this was reconstructed by
reading the actual queries in `backend-php/*.php` and
`docs/architecture/system-design-and-erd.md`. It matches what the code
expects (`departments`, `interns`, `dtr_entries`, `audit_trail`), but if you
already have a `tdt_ims` dump from elsewhere, use that instead and skip
mounting `init.sql`.

## Useful commands

```bash
docker compose down              # stop everything
docker compose down -v           # stop and WIPE all data (db, models, settings)
docker compose logs -f backend-php
docker compose up -d --build backend-php   # rebuild just one service after a code change
```
