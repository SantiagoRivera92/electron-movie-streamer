#!/bin/bash
echo "Installing dependencies..."
npm install

# Check for MPV
if ! command -v mpv &> /dev/null; then
    echo "MPV not found. Please install it:"
    echo "Ubuntu/Debian: sudo apt install mpv"
    echo "Arch: sudo pacman -S mpv"
    echo "Fedora: sudo dnf install mpv"
    exit 1
fi

echo "Setup complete! Run 'npm start' to launch the app."
