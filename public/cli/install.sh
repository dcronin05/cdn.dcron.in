#!/usr/bin/env sh
set -e

INSTALL_DIR="/usr/local/bin"
if [ ! -w "$INSTALL_DIR" ]; then
    INSTALL_DIR="$HOME/.local/bin"
    mkdir -p "$INSTALL_DIR"
fi

echo "Downloading dcron.in CDN CLI tool to $INSTALL_DIR/cdn..."
curl -fsSL https://cdn.dcron.in/cli/cdn -o "$INSTALL_DIR/cdn"
chmod +x "$INSTALL_DIR/cdn"

echo "✔ Installation complete!"
echo "Run 'cdn <file>' to upload files instantly."
