# coros-workout-mcp

MCP server for creating COROS strength workouts via the Training Hub API. Lets Claude design workouts and push them directly to your COROS watch.

## Disclaimer

This is an **unofficial**, community-driven project. It is **not affiliated with, endorsed by, or connected to COROS** in any way.

This server communicates with the COROS Training Hub using a **reverse-engineered, undocumented API** that may change or break without notice. Use it at your own risk.

COROS is a trademark of COROS Wearables, Inc. This project is provided as-is with no warranty — see [LICENSE](LICENSE) for details.

## Setup

```bash
cd coros-workout-mcp
npm install
npm run build
```

## Usage with Claude Code

```bash
claude mcp add coros-workout -- node /path/to/coros-workout-mcp/dist/src/index.js
```

To use env var auth (avoids typing credentials in conversation):

```bash
claude mcp add coros-workout -e COROS_EMAIL=you@example.com -e COROS_PASSWORD=yourpass -e COROS_REGION=eu -- node /path/to/coros-workout-mcp/dist/src/index.js
```

## Usage with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "coros-workout": {
      "command": "/path/to/node",
      "args": ["/path/to/coros-workout-mcp/dist/src/index.js"],
      "env": {
        "COROS_EMAIL": "you@example.com",
        "COROS_PASSWORD": "yourpass",
        "COROS_REGION": "eu"
      }
    }
  }
}
```

> **Node.js 18+ required** — this server uses native `fetch()` which was added in Node 18.

> **Troubleshooting `fetch is not defined`:** Claude Desktop is a GUI app that doesn't inherit your shell PATH, so node binaries installed via version managers (mise, nvm, fnm, volta) won't be found. Use the full absolute path to your node binary in `"command"`:
>
> ```bash
> which node        # e.g. /Users/you/.mise/shims/node
> node --version    # confirm it's 18+
> ```
>
> Common locations:
> - **mise**: `~/.local/share/mise/installs/node/<version>/bin/node`
> - **nvm**: `~/.nvm/versions/node/<version>/bin/node`
> - **fnm**: `~/.local/share/fnm/node-versions/<version>/installation/bin/node`
> - **Homebrew**: `/opt/homebrew/bin/node`

## Tools

| Tool | Description |
|------|-------------|
| `authenticate_coros` | Log in with email/password (or auto-login from env vars) |
| `check_coros_auth` | Verify current auth status |
| `search_exercises` | Search ~383 exercises by name, muscle, body part, equipment |
| `create_workout` | Build and push a strength workout to COROS |
| `list_workouts` | List existing workouts |

## Example conversation

> "Search for chest exercises with bodyweight"
>
> "Create a workout called 'Quick Push' with 4x15 Push-ups, 3x10 Diamond Push-ups, and 3x20 Decline Push-ups with 45s rest"

## Auth notes

- **Region**: `eu` (Europe) or `us` (US). Defaults to `eu`.
- **Session conflict**: Logging in via this API invalidates your COROS web app session, and vice versa.
- Auth tokens are stored at `~/.config/coros-workout-mcp/auth.json` (mode 0600).

## Development

```bash
npm test           # Run unit tests
npm run test:watch # Watch mode
npm run build      # Compile TypeScript
```
