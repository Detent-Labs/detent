# Node 22 LTS devcontainer base. Provides the non-root `node` user, git, and the
# Node runtime the Claude Code CLI needs. Bump the tag (for example to :24) for a
# newer LTS.
FROM mcr.microsoft.com/devcontainers/typescript-node:22

# Bun is the project standard: runtime, package manager, and test runner. Installed
# system-wide (/usr/local/bin/bun) so every user has it on PATH. BUN_VERSION is
# pinned for reproducible builds; bump it deliberately.
ENV BUN_VERSION=1.3.11
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash -s "bun-v${BUN_VERSION}"

# typescript-language-server backs LSP code intelligence (go-to-def, hover,
# document symbols) for tools that talk to it over --stdio. It resolves
# tsserver from the project's own node_modules/typescript, so no separate
# global typescript is needed here. Pinned for reproducibility; bump deliberately.
ENV TS_LANGUAGE_SERVER_VERSION=5.3.0
RUN npm install -g "typescript-language-server@${TS_LANGUAGE_SERVER_VERSION}"
