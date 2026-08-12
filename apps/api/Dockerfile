# Railpack does not detect Bun projects (Railway's own Bun guide), so the build is explicit.
# The tag pins the same Bun as .github/workflows/ci.yml, so production and CI agree.
FROM oven/bun:1.3.14-alpine

WORKDIR /app

# Build context is the repo root: apps/api depends on @gc/shared-types through
# `workspace:*`, which needs the root package.json and bun.lock.
COPY . .

# ponytail: installs every workspace dependency, test tooling and the other app included.
# Switch to `bun install --filter '@gc/api'` if build time starts to matter.
RUN bun install --frozen-lockfile

# The `start` script is what sets NODE_ENV=production, which is what makes env.ts refuse to
# boot without CORS_ORIGIN and COOKIE_SECURE. Do not inline `bun run src/index.ts` here:
# that would silently disable both checks.
CMD ["bun", "run", "--filter", "@gc/api", "start"]
