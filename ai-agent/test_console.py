#!/usr/bin/env python3
"""
Console Test Script
===================
Test the AI Interview Agent locally using your microphone and speakers.
No VideoSDK room required - great for testing the agent's behavior.

Usage:
  python test_console.py
  python test_console.py Python Hard
"""

import os
import sys
from dotenv import load_dotenv

load_dotenv()


def main():
    interview_type = sys.argv[1] if len(sys.argv) > 1 else "Python"
    difficulty = sys.argv[2] if len(sys.argv) > 2 else "Medium"

    os.environ["INTERVIEW_TYPE"] = interview_type
    os.environ["DIFFICULTY_LEVEL"] = difficulty
    os.environ["CANDIDATE_NAME"] = "Test Candidate"

    # Check for required API key
    if not os.getenv("GOOGLE_API_KEY") and not os.getenv("GEMINI_API_KEY"):
        print("ERROR: GOOGLE_API_KEY or GEMINI_API_KEY is required in .env file")
        print("Get your key from: https://aistudio.google.com/app/apikey")
        sys.exit(1)

    print(f"\n{'='*50}")
    print("Console Test Mode")
    print(f"{'='*50}")
    print(f"Interview Type: {interview_type}")
    print(f"Difficulty: {difficulty}")
    print(f"{'='*50}")
    print("\nSpeak into your microphone to interact with the agent.")
    print("Press Ctrl+C to stop.\n")

    # Set console mode
    sys.argv = [sys.argv[0], "console"]

    # We need a dummy room config for console mode
    os.environ["VIDEOSDK_ROOM_ID"] = "console-test"
    os.environ["VIDEOSDK_AUTH_TOKEN"] = os.getenv("VIDEOSDK_AUTH_TOKEN", "dummy-token-for-console")

    from main import main as run_agent
    run_agent()


if __name__ == "__main__":
    main()
