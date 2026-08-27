# Node, not Python — see the ROUTE DECISION in docs/estimator/drawing-parse-design.md.
# The image needs pixels, not a PDF toolchain: unpdf is the same pdf.js the Worker
# already bundles, so the crop box here and the geometric second opinion there
# share a coordinate space.
#
# linux/amd64 is pinned because both native dependencies ship prebuilt binaries
# per platform and the lockfile carries @img/sharp-linux-x64 and
# @napi-rs/canvas-linux-x64-gnu. -slim is Debian, so the gnu build is the right
# one; on Alpine it would need the musl variant instead.
FROM --platform=linux/amd64 node:22-slim

WORKDIR /app

# npm ci, not npm install: the build must resolve to the versions that were
# actually tested, not to whatever satisfies the ranges on the day it is built.
# The lockfile also pins @napi-rs/canvas inside unpdf's peerOptional ^0.1.69 —
# an earlier pin of 0.1.65 sat below that range and failed the install outright,
# which is the sort of thing that is only ever found by running it.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY render.mjs server.mjs ./

ENV NODE_ENV=production
EXPOSE 8080

# Drop root. The install runs as root because it writes /app; the server only
# reads its own files and returns bytes, so it needs nothing root has. This
# image exists to be a blast-radius boundary, and a boundary that runs as root
# is a smaller one than it looks.
USER node
# No credentials are passed in. If this container ever needs a secret, the
# decision that put R2 and D1 in the Worker has been reversed, and that belongs
# in the design before it belongs here.
CMD ["node", "server.mjs"]
