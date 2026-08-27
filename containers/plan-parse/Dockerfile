# Node, not Python — see the ROUTE DECISION in docs/estimator/drawing-parse-design.md.
# The image needs pixels, not a PDF toolchain: unpdf is the same pdf.js the Worker
# already bundles, so the crop box here and the geometric second opinion there
# share a coordinate space.
FROM node:22-slim

# @napi-rs/canvas and sharp ship prebuilt binaries for linux/amd64; no build
# toolchain is installed on purpose, because image size sets the cold start.
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY render.mjs server.mjs ./

ENV NODE_ENV=production
EXPOSE 8080
# No credentials are passed in. If this container ever needs a secret, the
# design decision that put R2 and D1 in the Worker has been reversed and that
# belongs in the design first.
CMD ["node", "server.mjs"]
