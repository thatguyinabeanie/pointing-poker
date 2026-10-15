# Pointing Poker

Pointing Poker is a small app for estimating Jira tickets as a team. Someone loads a ticket,
everyone picks a card from a Fibonacci deck in private, and the team reveals the votes together.
When the team agrees on a number, it is saved to the ticket's Story Points field in Jira. It runs
as a service on the hosting platform, and it has one shared room per deployed instance.

## Running locally

1. Copy `.env.example` to `.env` and fill in the values. Set `ALLOW_DEV_USER=1` so the
   `?devUser=` shortcut works.
2. Install Node 26 and npm 12 with `mise trust && mise install` (the versions pinned in
   `mise.toml`), then install dependencies with `npm install`.
3. Start the app with `npm run dev`.
4. Open `http://localhost:3838/?devUser=alice` in one window and
   `http://localhost:3838/?devUser=bob` in a second window.
5. Load a ticket you can safely change, vote in both windows, reveal, and save.
6. Check that the Story Points value changed in Jira.
7. Edit a component file and confirm the page updates without a full reload.

## Run with Docker Compose

`compose.yaml` builds the image from the Dockerfile and starts it on port 3838.

```sh
docker compose up --build        # build and start
HOST_PORT=3840 docker compose up --build   # use a different host port
docker compose down              # stop and remove the container
```

The port binds to localhost (127.0.0.1) by default because the app trusts identity headers and there is no auth proxy locally, so other machines on your network could otherwise impersonate a user. Set `HOST_BIND=0.0.0.0` only on a trusted network to expose it.

If a `.env` file exists, Compose passes it to the container. Without one, the app starts with
defaults and will not be fully configured. The image runs in production mode, so `?devUser=`
does not work. Send the identity headers named by `IDENTITY_USER_ID_HEADER` and
`IDENTITY_USERNAME_HEADER`, or use `npm run dev` for browser play.

## How it identifies people

On the hosting platform, the auth proxy adds identity headers to each request. The app reads
the header names from `IDENTITY_USER_ID_HEADER` and `IDENTITY_USERNAME_HEADER`, and uses
those headers. Nothing in a request body can change who you are.

Locally, there are two options:

- `?devUser=alice` gives you a separate identity per window. It works only when
  `ALLOW_DEV_USER=1` is set and the app is not running in production mode.
- `DEV_USER_ID` and `DEV_USERNAME` set one fixed identity for every window. They
  are subject to the same production check.

## Deploying

See [docs/deploy.md](docs/deploy.md) for the platform service settings, the outside-the-repo
checklist, and how to verify a deployment.
