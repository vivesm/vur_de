#!/usr/bin/env python3
import subprocess
import sys
import time

print("Starting Vur-De web server...")
print("The server will run at: http://localhost:8080")
print("Press Ctrl+C to stop the server")

try:
    subprocess.run([sys.executable, "app.py"])
except KeyboardInterrupt:
    print("\nServer stopped.")