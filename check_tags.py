#!/usr/bin/env python3
import sys
from mutagen.mp3 import MP3
from mutagen.id3 import ID3

if len(sys.argv) < 2:
    print("Usage: python3 check_tags.py <mp3_file>")
    sys.exit(1)

filepath = sys.argv[1]

try:
    audio = MP3(filepath, ID3=ID3)
    print(f"File: {filepath}")
    print(f"Duration: {audio.info.length:.2f} seconds")
    print("\nID3 Tags:")
    
    tags = audio.tags
    if tags:
        for key, value in tags.items():
            print(f"  {key}: {value}")
        
        # Print specific tags in a readable format
        print("\nFormatted tags:")
        if 'TIT2' in tags:
            print(f"  Title: {tags['TIT2'].text[0]}")
        if 'TPE1' in tags:
            print(f"  Artist: {tags['TPE1'].text[0]}")
        if 'TALB' in tags:
            print(f"  Album: {tags['TALB'].text[0]}")
        if 'TPE2' in tags:
            print(f"  Album Artist: {tags['TPE2'].text[0]}")
        if 'APIC:' in tags or 'APIC:Cover' in tags:
            print("  Cover Art: Yes")
    else:
        print("  No ID3 tags found")
        
except Exception as e:
    print(f"Error: {e}")