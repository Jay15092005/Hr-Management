#!/usr/bin/env python3
"""
Quick Interview Runner
======================
Quickly start an AI interview agent with parameters.

Usage:
  python run_interview.py <room_id> <interview_type> <difficulty> <candidate_name>

Example:
  python run_interview.py 7q9z-qhvm-6ehe Python Medium "John Doe"
"""

import os
import sys
import subprocess
from dotenv import load_dotenv

load_dotenv()


def main():
    if len(sys.argv) < 2:
        print("Usage: python run_interview.py <room_id> [interview_type] [difficulty] [candidate_name]")
        print("")
        print("Examples:")
        print('  python run_interview.py 7q9z-qhvm-6ehe')
        print('  python run_interview.py 7q9z-qhvm-6ehe Python Medium "John Doe"')
        print("")
        print("Interview Types: Python, Node.js, React, Java, Angular, Vue.js, Go, Rust, C++, Other")
        print("Difficulty Levels: Easy, Medium, Hard")
        sys.exit(1)

    room_id = sys.argv[1]
    interview_type = sys.argv[2] if len(sys.argv) > 2 else "Python"
    difficulty = sys.argv[3] if len(sys.argv) > 3 else "Medium"
    candidate_name = sys.argv[4] if len(sys.argv) > 4 else "Candidate"

    # Set environment variables
    os.environ["VIDEOSDK_ROOM_ID"] = room_id
    os.environ["INTERVIEW_TYPE"] = interview_type
    os.environ["DIFFICULTY_LEVEL"] = difficulty
    os.environ["CANDIDATE_NAME"] = candidate_name

    print(f"\n{'='*50}")
    print("Starting AI Interview Agent")
    print(f"{'='*50}")
    print(f"Room ID: {room_id}")
    print(f"Interview Type: {interview_type}")
    print(f"Difficulty: {difficulty}")
    print(f"Candidate: {candidate_name}")
    print(f"{'='*50}\n")

    # Import and run the main agent
    from main import main as run_agent
    run_agent()


if __name__ == "__main__":
    main()
