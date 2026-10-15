# Deploying Pointing Poker

This runs as a service on the hosting platform. The image is published to Docker Hub as `gabemendoza1/pointing-poker` with the repo scripts (`npm run image:build`, `npm run image:push`, `npm run image:run`). Tags are `<short-sha>` always and `latest` from a clean `main`. It is built for `linux/amd64`, cross-built from Apple Silicon. Merges to `main` publish `:<short-sha>` and `:latest` through GitHub Actions (`.github/workflows/ci.yml`). This needs repo secrets `DOCKERHUB_USERNAME` (`gabemendoza1`) and `DOCKERHUB_TOKEN` (a Docker Hub access token with read and write scope). The Docker Hub repo must be public: the platform's pre-deploy image check uses its own Docker Hub account, so private images fail; it has no pull-secret support. The settings below live outside the repo, so
they are applied by hand in the platform service's own configuration.

## Required settings

| Setting                                     | Value                                | Why                                                                                                       |
| ------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| The platform's port setting (the app reads `PORT`) | `3838`                        | Matches the image's `EXPOSE 3838`. The server binds `0.0.0.0` on this port.                              |
| The platform's health-check path setting    | `/api/status`                        | The Dockerfile has no `HEALTHCHECK`, so the platform polls this route instead.                            |
| The proxy read timeout setting              | `3600`                               | WebSocket insurance. The auth proxy's default is 15 seconds.                                              |
| The proxy write timeout setting             | `3600`                               | WebSocket insurance. The auth proxy's default is 30 seconds.                                              |
| replicas / maxReplicas                      | `1` / `1`                            | Game state lives in memory. Two instances would each hold their own rooms.                                |
| `JIRA_API_TOKEN` credential                 | Attach it                            | The platform injects it as `JIRA_API_TOKEN_USERNAME` and `JIRA_API_TOKEN_PASSWORD`.                       |
| `JIRA_BASE_URL`                             | Your Jira site, for example `https://example.atlassian.net` | Base URL for Jira REST calls and ticket links. No default in the repo. |
| `IDENTITY_USER_ID_HEADER`, `IDENTITY_USERNAME_HEADER` | The header names the auth proxy injects | No defaults in the repo. Unset in production means unauthenticated: `/ws` closes with 4401. |

The proxy timeouts matter because the game keeps a WebSocket open for each browser tab. Without
them, idle sockets can be cut at the default limits.

## Optional settings

| Setting                   | Effect if unset                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `JIRA_STORY_POINTS_FIELD` | The Story Points field is found automatically through the Jira field list. Set this only to skip that lookup. |
| `LOG_LEVEL`               | Defaults to `info`. Set to `debug` for more detail in the logs.                                                |
| `JIRA_DEFAULT_PROJECT`    | No default. Seeds the queue's Jira project.                                                                    |
| `JIRA_DEFAULT_BOARD`      | No default. A board name or numeric id (the number in `.../boards/123`) to start on. Needs `JIRA_DEFAULT_PROJECT`. An unknown or ambiguous name falls back to no board; use the id if two boards share a name. |
| `ALLOWED_ORIGINS`         | Not needed unless the WebSocket Origin check fails behind the auth proxy. See "Verifying a deployment."        |

Leave `ALLOW_DEV_USER`, `DEV_USER_ID`, and `DEV_USERNAME` unset in production. The image sets
`NODE_ENV=production`, which disables them anyway.

## Scheduling

On Demand scheduling is fine for this service. If the container sleeps, the game in memory is
lost, and the next visitor starts with an empty room. For a team that plays most days, that is
an acceptable trade.

Always On is optional. Choose it if losing a room to an idle container is a problem.

## Publish the service report

Publish the service report so people can open the app from the hosting platform. Identity comes from the
headers the auth proxy adds (named by `IDENTITY_USER_ID_HEADER` and `IDENTITY_USERNAME_HEADER`). Those headers arrive only when the
request goes through the platform, so opening the container port directly shows no user.

## One team per instance

Each instance of this service is one shared room. Another team that wants its own room deploys
another instance of the service. Do not scale a single instance past one replica.

## Checklist outside the repo

Work through this list when setting up a new deployment.

1. Publish the image to Docker Hub with `npm run image:build` and `npm run image:push`, and confirm the Service can pull it.
2. Add the GitHub repo secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`, and make the Docker Hub repo public.
3. Create a platform service that pulls the image from that registry.
4. Create a Custom credential named `JIRA_API_TOKEN`. Use the Atlassian account email as the
   username and an Atlassian API token as the password.
5. Set the `JIRA_BASE_URL` environment variable on the service.
6. Apply the required settings above.

## Verifying a deployment

After the first deploy to a staging service:

1. Check the startup log. It should say `identity mode: proxy`. Then open `GET /api/me` in the
   service and confirm it returns the viewer.
2. Open the published service report in two browsers and play a round: load a ticket, vote in
   both, reveal, and save.
3. Leave one tab idle for 90 seconds and confirm the socket survives. The server pings every 25
   seconds, and the load balancer closes idle connections after 60 seconds.
4. Confirm the WebSocket Origin check passes behind the auth proxy. If it does not, set
   `ALLOWED_ORIGINS` to the host name the browser sends.
5. Confirm assets load at the service root (`base: '/'` in `vite.config.ts`). Change it to
   `'./'` only if the platform mounts the service under a path prefix.
