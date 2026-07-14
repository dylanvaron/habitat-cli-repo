# Deployment Notes

- Deployed Git commit hash: `f272e10`
- Local LXC confirmation: the Habitat API responded correctly when run directly on the OpenClaw LXC, including successful `habitat status` behavior against the local backend.
- Laptop-to-LXC confirmation: the laptop CLI successfully reached the LXC over Tailscale and received a valid `habitat status` response while the API server was running on the OpenClaw host.

## Observed OpenClaw Request Logs

When the laptop ran `habitat status`, the OpenClaw server logged request handling in the expected format:

```text
[kepler] GET /habitats/<habitat-id>/registration -> request
[kepler] GET /habitats/<habitat-id>/registration -> 200
[habitat-api] GET /registration -> <display-name>
```

## Observed Failure After Stopping the Manual Server

After the manually started backend process was stopped on the OpenClaw server, the laptop CLI could no longer connect to the Habitat API. Subsequent CLI requests failed until the server was started again.

## Why `0.0.0.0` Is Required

Binding the Hono server to `0.0.0.0` allows it to accept connections from outside the LXC itself. Binding only to `127.0.0.1` would limit access to loopback traffic inside the container, which prevents the laptop CLI from reaching the API remotely.

## Why `.env` and the SQLite State File Stay Local

`.env` and the SQLite state file are deployment-local runtime artifacts. They remain in the checkout so the deployed environment keeps its own configuration and mutable local state, but they are ignored by Git so secrets and machine-specific state are not committed back into the repository.

Note: older deployment notes may refer to the SQLite file as `habitat.sqlite`; the current repository stores the local state database as `habitat.db`.
