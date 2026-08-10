# turks

Build a typed, polyglot application monorepo from compatible clients, backends, databases, and data layers.

Turks is a TypeScript CLI with a Chalk-powered terminal experience. Every major category supports opting out, so client-only, API-only, database-without-ORM, and minimal repositories are all valid.

## Usage

```bash
npx create-turks@latest my-app
```

To generate into the current empty directory, use a dot:

```bash
mkdir my-app && cd my-app
npx create-turks@latest .
```

For a reproducible non-interactive build:

```bash
npx create-turks@latest my-app \
  --client expo,next \
  --backend rust \
  --framework axum \
  --database postgres \
  --data-layer sqlx \
  --docker \
  --ci github \
  --yes
```

Or scaffold a complete starter template as the whole project:

```bash
npx create-turks@latest my-app --template gpui-starter --yes
```

Use `--client none`, `--backend none`, `--database none`, or `--data-layer none` to omit a layer. Use `--dry-run` to inspect the exact generation plan without writing files.

Interactive runs ask whether to start from a starter template, which client, backend, database, and data layer to compose, which package manager to use, whether to install dependencies, and whether to initialize a Git repository. Choosing a template skips the stack questions because the template defines the whole project. Use `--template none|gpui-starter`, `--package-manager npm|pnpm|bun`, `--no-install`, and `--no-git` in automated runs.

When the destination already contains files, Turks asks before merging the generated project and overwriting conflicting paths. Use `--force` for deliberate non-interactive merging.

## Support matrix

| Category | Choices |
| --- | --- |
| Clients | Expo, Next.js, React + Vite, Vue + Vite, SvelteKit, Astro, React Native, Tauri, Electron, or none |
| Templates | GPUI desktop app (gpui-starter), or none |
| Rust | Axum, Actix Web, Rocket, or no framework |
| Go | standard library, Chi, Gin, Fiber, Echo, or no framework |
| TypeScript | Hono, Express, Fastify, Nest, or no framework |
| Python | FastAPI, Django, Flask, Litestar, or no framework |
| Databases | PostgreSQL, MySQL, SQLite, MongoDB, or none |
| Rust data layers | SQLx, SeaORM, Diesel, or none |
| Go data layers | GORM, Ent, Bun, or none |
| TypeScript data layers | Drizzle, Prisma, TypeORM, Kysely, Mongoose, or none |
| Python data layers | SQLAlchemy, Django ORM, Tortoise ORM, PyMongo, Beanie, or none |
| Package managers | npm, pnpm, or Bun |
| Optional tooling | Docker Compose (requires PostgreSQL, MySQL, or MongoDB), GitHub Actions, Moon, dependency installation, Git initialization |

Turks validates compatibility before creating anything. For example, MongoDB is accepted with Prisma, TypeORM, Mongoose, PyMongo, or Beanie in their supported languages, but rejected with SQLx.

Multiple clients are comma-separated:

```bash
npx create-turks@latest my-app --client next,expo,tauri --backend go --framework chi --database sqlite --data-layer bun --yes
```

## Moon

Moon is not required to build or use Turks. npm, pnpm, Bun, Cargo, Go, and uv already provide the native workspace and build tools the generated repository needs.

Moon is an optional advanced output for teams that want a shared task graph and caching layer. It defaults to `none`; enable it with `--orchestrator moon` or `--moon`.

## Templates

Templates are vendored starters that become the whole generated project. Selecting `gpui-starter` scaffolds the [GPUI starter](https://github.com/lassejlv/gpui-starter) desktop app verbatim — same file layout — with crate names, identifiers, titles, and the window bundle id rewritten to match your project name. Run it with:

```bash
cd my-app
cargo run -p my-app-desktop
```

Turks asks whether to build the template (`cargo build`) right after scaffolding. Docker Compose and GitHub Actions are stack options and are not available with a template.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
node dist/cli.js --help
```
