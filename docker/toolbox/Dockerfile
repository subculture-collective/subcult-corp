# Toolbox — agent execution environment
# Provides bash, Python, Node.js, and CLI tools for agent tool calls.
# Runs as a sidecar container; the unified worker uses `docker exec` to run commands.
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    # Networking & fetching
    curl wget jq ca-certificates gnupg dnsutils net-tools iputils-ping \
    # Core utilities
    coreutils findutils diffutils patch gawk sed grep less file unzip zip tar gzip bzip2 xz-utils \
    # Text processing & editing
    vim-tiny nano \
    # Development
    git make gcc g++ \
    # Python
    python3 python3-pip python3-venv \
    # Search tools
    ripgrep fd-find \
    # Process & system
    procps htop tree \
    # SSH (for git over ssh)
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y gh && rm -rf /var/lib/apt/lists/*

# Python venv for agent scripts
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir requests feedparser beautifulsoup4 html2text

# Copy repo source into the image (excludes .env, .git, node_modules via .dockerignore)
# init-workspace.sh will set this up as a git repo on the agents/workspace branch
COPY . /opt/subcult-repo

# Build context changed to repo root — init script is now at docker/toolbox/
COPY docker/toolbox/init-workspace.sh /usr/local/bin/init-workspace.sh
RUN chmod +x /usr/local/bin/init-workspace.sh

RUN echo 'umask 0000' > /etc/workspace-env.sh
# BASH_ENV is sourced by non-interactive bash (i.e. docker exec bash -c ...)
ENV BASH_ENV=/etc/workspace-env.sh
WORKDIR /workspace
CMD ["/bin/bash", "-c", "/usr/local/bin/init-workspace.sh && exec sleep infinity"]
