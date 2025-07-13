#!/bin/bash

echo "🚀 Vur-De Electron App Setup for Mac"
echo "===================================="

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js first:"
    echo "   brew install node"
    echo "   or download from https://nodejs.org"
    exit 1
fi

# Check if yt-dlp is installed
if ! command -v yt-dlp &> /dev/null; then
    echo "⚠️  yt-dlp is not installed. The app will prompt you to install it."
    echo "   You can install it now with: brew install yt-dlp"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Run the app
echo "✅ Setup complete! Starting Vur-De..."
npm start