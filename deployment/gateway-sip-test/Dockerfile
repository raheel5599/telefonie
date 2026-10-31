FROM debian:bookworm-slim
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends kamailio ca-certificates \
 && rm -rf /var/lib/apt/lists/*
USER 65534:65534
