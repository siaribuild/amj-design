# Plan-parse container — the SKILL.md toolchain, unmodified.
#
# The reading method that reached 100% accuracy on a real plan set is a
# POPPLER AND PYTHON method, and Cloudflare Containers run it as-is. Nothing
# here is an equivalent of that method or an adaptation of it — pdfinfo,
# pdffonts, pdftotext, pdftoppm, pdfimages and pdfdetach are the
# same tools, invoked the same way (ADR 0016).
#
# linux/amd64 is required by the platform. Keep the image lean: image size is
# capped by the instance's disk (4 GB on `basic`) and it is what sets the
# 1-3s cold start.
FROM --platform=linux/amd64 python:3.12-slim

# poppler-utils is the whole of SKILL.md's command-line half.
RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY steps.py server.py ./

# Runs as an unprivileged user (semgrep dockerfile.security.missing-user) —
# this container already holds no credentials and makes no outbound call
# (§9 AB-5); it also should not be able to touch anything as root if a PDF
# parsing bug were ever exploitable.
RUN useradd --no-create-home --uid 10001 planparse
USER planparse

# The Worker talks to this over HTTP, via the PLAN_PARSE Durable Object
# binding only — no public route, no service binding, no hostname (§9 AB-5).
# One job per request; the instance sleeps when idle and stops billing then.
EXPOSE 8080
CMD ["python", "server.py"]
