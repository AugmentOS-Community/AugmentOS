# AugmentOS Cloud Microservices Docker Setup

This document explains how to run AugmentOS Cloud services as individual Docker containers rather than a single container managed by PM2.

## Architecture

The AugmentOS Cloud services have been separated into individual containers:

1. **cloud** - Main cloud service and agent gatekeeper (ports 8002, 8013)
2. **dashboard-manager** - Dashboard management service (port 8012)
3. **flash** - Flash application service (port 8011)
4. **live-captions** - Live captions service (port 8010)
5. **miraai** - Mira AI service (port 8015)
6. **notify** - Notifications service (port 8014)
7. **mongodb** - Shared MongoDB database (port 27017)

Each service container is built from a common base image (`augmentos-cloud-base`) that contains all the shared dependencies and packages.

## Prerequisites

- Docker and Docker Compose installed
- Environment variables configured in `.env` file (see `.env.example` for required variables)

## Building and Running

### 1. Build and start all services

```bash
docker compose up -d
```

This will build all service images (if not already built) and start them in detached mode.

### 2. Build without starting

```bash
docker compose build
```

### 3. Start a specific service

```bash
docker compose up -d cloud
```

Replace `cloud` with the name of the service you want to start.

### 4. View logs

```bash
# View logs for all services
docker compose logs -f

# View logs for a specific service
docker compose logs -f live-captions
```

### 5. Stop all services

```bash
docker compose down
```

### 6. Rebuild a specific service

```bash
docker compose build dashboard-manager
```

## Understanding the Build Process and Rebuilding Requirements

In this microservices architecture, understanding when to rebuild containers is crucial for ensuring your changes take effect properly.

### Build Dependency Chain

The build process follows this dependency chain:

1. **Base Image** (`augmentos-cloud-base`) - Contains all shared packages and their dependencies
2. **Service Images** - Each service depends on the base image

### When to Rebuild Containers

#### Base Image Rebuild Required

You MUST rebuild the base image when:

- Changes are made to any shared package:
  - `packages/config`
  - `packages/types`
  - `packages/utils`
  - `packages/sdk`
  - `packages/agents`
- Dependencies are added/updated in `package.json` at the root level
- Changes to global build configurations are made

To rebuild the base image:

```bash
docker compose build augmentos-cloud-base
```

**IMPORTANT**: After rebuilding the base image, you MUST rebuild all service images, as they depend on the base image:

```bash
docker compose build
```

#### Individual Service Rebuild Required

You only need to rebuild a specific service when:

- Changes are made only to that service's code
- The service's dependencies or configuration have changed
- The base image hasn't been modified

For example, to rebuild just the dashboard-manager:

```bash
docker compose build dashboard-manager
```

### Rebuild vs. Restart

- **Rebuild** (build): Creates a new image with updated code
- **Restart** (restart): Restarts a container without code changes

If you've made code changes but haven't rebuilt, restarting won't apply those changes.

### Troubleshooting Build Issues

If you encounter issues with dependencies not being found after changes:

1. Verify you've rebuilt the necessary containers
2. Check the build logs for errors
3. In some cases, you might need to clean Docker's build cache:
   ```bash
   docker compose build --no-cache augmentos-cloud-base
   ```

## Volumes

- MongoDB data is persisted in a Docker volume `mongodb-data`
- Logs are stored in the host's `./logs` directory and mounted into each container

## Networks

All services communicate over the `augmentos-network` bridge network.

## Environment Variables

Each service container inherits environment variables from:
1. Variables defined in the `docker-compose.yml` file
2. Variables from the `.env` file

Make sure to configure all required environment variables in your `.env` file before starting the services. 