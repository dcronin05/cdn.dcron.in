#!/usr/bin/env sh
set -e

INSTALL_DIR="/usr/local/bin"
if [ ! -w "$INSTALL_DIR" ]; then
    INSTALL_DIR="$HOME/.local/bin"
    mkdir -p "$INSTALL_DIR"
fi

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

if [ "$ARCH" = "x86_64" ]; then
    ARCH="amd64"
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    ARCH="arm64"
fi

BINARY_NAME="cdn-${OS}-${ARCH}"
RELEASE_URL="https://github.com/dcronin05/cdn.dcron.in/releases/latest/download/${BINARY_NAME}"

echo "Downloading dcron.in CDN CLI tool for ${OS}/${ARCH}..."

if curl -fsSL "$RELEASE_URL" -o "$INSTALL_DIR/cdn" 2>/dev/null; then
    chmod +x "$INSTALL_DIR/cdn"
    echo "✔ Binary installed to $INSTALL_DIR/cdn"
else
    echo "Fallback: Downloading POSIX shell CLI script..."
    curl -fsSL https://cdn.dcron.in/cli/cdn -o "$INSTALL_DIR/cdn"
    chmod +x "$INSTALL_DIR/cdn"
    echo "✔ Script installed to $INSTALL_DIR/cdn"
fi

echo "Run 'cdn <file>' to upload files instantly."
