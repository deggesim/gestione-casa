# See apps/api/Dockerfile for why a Dockerfile and why this tag.
FROM oven/bun:1.3.14-alpine

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile

# PUBLIC_* variables are inlined into the bundle at BUILD time, so they must be build args:
# supplied at runtime they would arrive too late, leaving a literal `process.env.PUBLIC_API_URL`
# in the bundle, which throws in a browser (there is no `process`) before any app code runs.
# Railway exposes service variables to the build; ARG is what lets the RUN below read them.
ARG PUBLIC_API_URL
ARG PUBLIC_ENABLE_SW

# No `ENV NODE_ENV=production` here on purpose: the build script owns it, so local, CI and
# production emit the identical artifact. Setting it here would make the one thing
# smoke/preview/e2e verify differ from the one thing users get.
RUN bun run --filter '@gc/web' build

# serve.ts resolves dist/ relative to its own file, so the working directory does not matter.
# At RUNTIME it reads PORT (injected by Railway) and API_INTERNAL_URL (the private address of
# the api service) — neither belongs in the bundle.
CMD ["bun", "apps/web/serve.ts"]
