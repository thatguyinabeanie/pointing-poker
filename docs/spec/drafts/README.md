# Pointing Poker

Pointing Poker is a small app for estimating Jira tickets as a team. Someone loads a ticket,
everyone picks a card from a Fibonacci deck in private, and the team reveals the votes together.
When the team agrees on a number, it is saved to the ticket's Story Points field in Jira. It runs
as a service on the hosting platform, and it has one shared room per deployed instance.

## Running locally

1. Copy `.env.example` to `.env` and fill in the values. Set `ALLOW_DEV_USER=1` so the
   `?devUser=` shortcut works.
2. Install dependencies with `npm install`.
3. Start the app with `npm run dev`.
4. Open `http://localhost:3838/?devUser=alice` in one window and
   `http://localhost:3838/?devUser=bob` in a second window.
5. Load a ticket you can safely change, vote in both windows, reveal, and save.
6. Check that the Story Points value changed in Jira.
7. Edit a component file and confirm the page updates without a full reload.
<!-- TODO: verify the HMR port used in dev -->

## How it identifies people

On the hosting platform, the auth proxy adds identity headers to each request. The app reads
the header names from `IDENTITY_USER_ID_HEADER` and `IDENTITY_USERNAME_HEADER`, and uses those headers. Nothing in a request body can change who you are.

Locally, there are two options:

- `?devUser=alice` gives you a separate identity per window. It works only when
  `ALLOW_DEV_USER=1` is set and the app is not running in production mode.
- `DEV_USER_ID` and `DEV_USERNAME` set one fixed identity for every window. They
  are subject to the same production check.

## Deploying

See [docs/deploy.md](docs/deploy.md) for the platform service settings, the outside-the-repo
checklist, and how to verify a deployment.
