# Deploy Threadline to Alibaba Cloud

This guide publishes an immutable Threadline image to Alibaba Cloud Container
Registry and runs it behind Caddy on one Alibaba ECS instance with persistent
SQLite storage.

> **Status:** The image, Compose stack, Caddy configuration, and deployment
> workflow are implemented and statically validated. This runbook has not yet
> been executed against Alibaba ACR or ECS; no public URL is currently claimed.

## Prerequisites

Create and secure the cloud resources before you copy application files.

- Provision one Linux ECS instance with Docker Engine and the Docker Compose
  plugin.
- Create a private Alibaba Cloud Container Registry repository named
  `threadline`.
- Point a domain name at the ECS public IPv4 address, or use an `sslip.io`
  hostname derived from that address.
- Permit inbound TCP 80 and 443 and UDP 443 in the ECS security group.
- Restrict inbound SSH to the operator's fixed IP range.
- Keep enough disk space for the database, backups, images, and container logs.

Do not put `QWEN_API_KEY` in an image build argument, Compose file, GitHub
variable, or repository file.

## Prepare the ECS host

Create host directories with ownership that matches the unprivileged
application user, UID 1001.

```bash
sudo install -d -m 0750 -o "$USER" -g "$USER" /opt/threadline
sudo install -d -m 2770 -o 1001 -g "$USER" /opt/threadline/data
sudo install -d -m 0700 -o "$USER" -g "$USER" /opt/threadline/secrets
sudo install -d -m 0750 -o "$USER" -g "$USER" /opt/threadline/logs
cd /opt/threadline
```

Copy `docker-compose.yml` and `Caddyfile` into `/opt/threadline`. Then create
`/opt/threadline/secrets/app.env` with the production values from
`.env.example`.

```dotenv
QWEN_API_KEY=replace-with-your-qwen-api-key
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_CHAT_MODEL=qwen3.7-plus
QWEN_FAST_MODEL=qwen3.6-flash
QWEN_EMBEDDING_MODEL=text-embedding-v4
DATABASE_URL=file:/data/threadline.db
SESSION_SECRET=replace-with-at-least-32-random-characters
APP_URL=https://threadline.example.com
ALLOW_INSECURE_LOCAL=false
CLEANUP_SECRET=replace-with-a-separate-random-secret
```

Restrict the file after saving it.

```bash
chmod 600 /opt/threadline/secrets/app.env
```

Create `/opt/threadline/.deploy.env` for non-secret Compose interpolation.

```dotenv
THREADLINE_IMAGE=registry.example.aliyuncs.com/hackathon/threadline:IMAGE_SHA
THREADLINE_ENV_FILE=/opt/threadline/secrets/app.env
THREADLINE_DATA_DIR=/opt/threadline/data
THREADLINE_SITE_ADDRESS=threadline.example.com
```

The site address must be a hostname without a path. Caddy obtains and renews
the HTTPS certificate after DNS resolves and ports 80 and 443 are reachable.

## Authenticate the ECS host to ACR

Use a least-privilege ACR credential that can pull the Threadline repository.

```bash
docker login registry.example.aliyuncs.com
```

Docker stores the credential on the ECS host. Restrict access to the deployment
user and rotate the credential if it appears in a shell transcript or log.

## Publish an image manually

Build and push an immutable commit tag from a clean repository checkout.

```bash
export ACR_REGISTRY=registry.example.aliyuncs.com
export ACR_NAMESPACE=hackathon
export IMAGE_TAG="$(git rev-parse --short=12 HEAD)"
docker login "$ACR_REGISTRY"
docker build --pull -t "$ACR_REGISTRY/$ACR_NAMESPACE/threadline:$IMAGE_TAG" .
docker push "$ACR_REGISTRY/$ACR_NAMESPACE/threadline:$IMAGE_TAG"
```

Do not reuse an existing tag, and enable tag immutability on the ACR repository.
The automated workflow additionally deploys the registry digest returned by the
build, so rollout and rollback remain pinned even if a tag policy is misconfigured.

## Start the application

Pull the selected image and start both services from `/opt/threadline`.

```bash
docker compose --env-file .deploy.env pull app
docker compose --env-file .deploy.env up -d --remove-orphans
docker compose --env-file .deploy.env ps
```

Verify the public endpoint after the app reports healthy.

```bash
curl --fail --retry 12 --retry-delay 5 \
  https://threadline.example.com/api/health
```

The health response must not include environment values, database paths,
secrets, or provider credentials.

After the first deployment, append the verified public URL, UTC date, deployed
image digest, and redacted health response to
[`docs/evidence/verification.md`](evidence/verification.md).

## Back up SQLite

Stop application writes before copying the database. Caddy can remain running
and will return an upstream error during the brief maintenance window.

```bash
cd /opt/threadline
docker compose --env-file .deploy.env stop app
install -d -m 0750 backups
backup="backups/threadline-$(date -u +%Y%m%dT%H%M%SZ).db"
cp --preserve=timestamps data/threadline.db \
  "$backup"
test -s "$backup"
docker compose --env-file .deploy.env start app
```

If the database uses write-ahead logging, stopping the app lets SQLite close or
checkpoint open writes before the copy. Test restoration on a non-production
path before relying on the backup.

## Roll out a new version

Back up the database, update only `THREADLINE_IMAGE` in `.deploy.env`, and then
replace the application container.

```bash
docker compose --env-file .deploy.env pull app
docker compose --env-file .deploy.env up -d --no-deps app
docker compose --env-file .deploy.env ps
```

Wait for the health check, then run the patient-clinician smoke flow. Keep the
previous image tag and database backup until the new version is verified.

## Roll back

Set `THREADLINE_IMAGE` to the last known-good immutable tag and replace the app
container.

```bash
docker compose --env-file .deploy.env pull app
docker compose --env-file .deploy.env up -d --no-deps app
```

Restore a database backup only when the failed release changed the schema in an
incompatible way. Stop the app first and preserve the failed database for
diagnosis.

## Configure GitHub Actions

The manual `Publish and deploy` workflow separates image publication from the
optional ECS rollout. Set `deploy_to_ecs` to false to publish without changing
the running host.

Create these GitHub environment secrets for `production`:

- `ALIBABA_ACR_REGISTRY`
- `ALIBABA_ACR_NAMESPACE`
- `ALIBABA_ACR_USERNAME`
- `ALIBABA_ACR_PASSWORD`
- `ECS_HOST`
- `ECS_USER`
- `ECS_SSH_KEY`
- `ECS_KNOWN_HOSTS`
- `ECS_DEPLOY_PATH`, set to `/opt/threadline`

Create these GitHub environment variables for `production`:

- `THREADLINE_SITE_ADDRESS`, set to the Caddy hostname
- `THREADLINE_PUBLIC_URL`, set to the complete HTTPS origin

The ECS host must already be authenticated to ACR. The workflow publishes the
first 12 characters of the commit SHA as the image tag, deploys the resulting
digest-pinned image reference, copies only Compose configuration to the host,
and leaves application secrets on ECS.

The workflow is configured but no GitHub Actions publish or ECS deployment run
has been recorded for this working-tree snapshot.

## Schedule cleanup

Threadline exposes `POST /api/maintenance/cleanup`. The route compares an exact
Bearer credential with `CLEANUP_SECRET` using a timing-safe check and returns no
private content. The `maintenance` Compose profile calls that route from the
same immutable image, so the standalone runtime does not need pnpm or tsx.

Test the job against staging first.

```bash
cd /opt/threadline
docker compose --env-file .deploy.env --profile maintenance run --rm cleanup
```

After verifying that it removes only expired workspaces, abandoned transcripts,
and expired rate-limit buckets, install this hourly ECS host cron entry under the
deployment user.

```cron
17 * * * * cd /opt/threadline && docker compose --env-file .deploy.env --profile maintenance run --rm cleanup >> /opt/threadline/logs/cleanup.log 2>&1
```

The secret remains in `/opt/threadline/secrets/app.env`; it is read from the
container environment and is not interpolated into the process command.

## Operational checks

Complete these operational items on the deployed host before recording the
demo.

- [ ] Confirm HTTPS redirects and certificate renewal.
- [ ] Confirm the app and Caddy restart after an ECS reboot.
- [ ] Confirm `/data` survives container replacement.
- [ ] Confirm the public endpoint rate limit prevents unbounded Qwen use.
- [ ] Confirm application logs contain no messages, prompts, memory text, or
  keys.
- [ ] Confirm the backup and rollback procedures on a disposable copy.
- [ ] Confirm the public URL matches `APP_URL` and the README value.
