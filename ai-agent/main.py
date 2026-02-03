"""
AI Interview Agent for HR Management System
============================================
This agent automatically:
1. Generates VideoSDK JWT token from API key + secret
2. Fetches active interviews from Supabase database
3. Joins the interview room and conducts the interview

Usage:
  python main.py                           # Auto-detect and join active interview
  python main.py console                   # Run in console mode for testing
  python main.py --room-id=xxx             # Join specific room

Based on VideoSDK AI Agents Framework:
  https://docs.videosdk.live/ai_agents/voice-agent-quick-start
"""

import asyncio
import os
import sys
import argparse
import time
import subprocess
import jwt  # PyJWT for token generation
import aiohttp
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

from videosdk.agents import (
    Agent,
    AgentSession,
    RealTimePipeline,
    JobContext,
    RoomOptions,
    WorkerJob,
)
from videosdk.plugins.google import GeminiRealtime, GeminiLiveConfig

# Supabase client
from supabase import create_client, Client

# Load environment variables
load_dotenv()


# ============================================
# VideoSDK Token Generation
# ============================================
def generate_videosdk_token(api_key: str, secret: str, expires_in_hours: int = 24) -> str:
    """
    Generate VideoSDK JWT token from API key and secret.
    Based on: https://docs.videosdk.live/ai_agents/authentication-and-token
    """
    payload = {
        "apikey": api_key,
        "permissions": ["allow_join"],
        "iat": int(time.time()),
        "exp": int(time.time()) + (expires_in_hours * 60 * 60),
    }
    
    token = jwt.encode(payload, secret, algorithm="HS256")
    return token


# ============================================
# Supabase Client
# ============================================
def get_supabase_client() -> Client:
    """Create Supabase client from environment variables."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_ANON_KEY")
    
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY are required")
    
    return create_client(url, key)


def fetch_active_interview(supabase: Client) -> dict | None:
    """
    Fetch the most recent active interview from Supabase.
    Returns interview config with candidate and job details.
    """
    # Query for active interviews with room_id
    result = supabase.from_("interview_configurations") \
        .select("""
            *,
            candidate_selections (
                id,
                resume_id,
                job_description_id,
                resumes (
                    id,
                    name,
                    email,
                    years_of_experience,
                    location,
                    degree
                ),
                job_descriptions (
                    id,
                    title,
                    description,
                    required_skills
                )
            )
        """) \
        .eq("status", "active") \
        .not_.is_("room_id", "null") \
        .order("created_at", desc=True) \
        .limit(1) \
        .execute()
    
    if result.data and len(result.data) > 0:
        return result.data[0]
    
    # If no active, check for scheduled that are due now
    now = datetime.now(timezone.utc).isoformat()
    result = supabase.from_("interview_configurations") \
        .select("""
            *,
            candidate_selections (
                id,
                resume_id,
                job_description_id,
                resumes (
                    id,
                    name,
                    email,
                    years_of_experience,
                    location,
                    degree
                ),
                job_descriptions (
                    id,
                    title,
                    description,
                    required_skills
                )
            )
        """) \
        .eq("status", "scheduled") \
        .not_.is_("room_id", "null") \
        .lte("scheduled_at", now) \
        .order("scheduled_at", desc=True) \
        .limit(1) \
        .execute()
    
    if result.data and len(result.data) > 0:
        return result.data[0]
    
    return None


def fetch_interview_by_room_id(supabase: Client, room_id: str) -> dict | None:
    """Fetch interview details by room ID."""
    result = supabase.from_("interview_configurations") \
        .select("""
            *,
            candidate_selections (
                id,
                resume_id,
                job_description_id,
                resumes (
                    id,
                    name,
                    email,
                    years_of_experience,
                    location,
                    degree
                ),
                job_descriptions (
                    id,
                    title,
                    description,
                    required_skills
                )
            )
        """) \
        .eq("room_id", room_id) \
        .limit(1) \
        .execute()
    
    if result.data and len(result.data) > 0:
        return result.data[0]
    
    return None


def update_interview_status(supabase: Client, interview_id: str, status: str):
    """Update interview status in database."""
    supabase.from_("interview_configurations") \
        .update({"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}) \
        .eq("id", interview_id) \
        .execute()


# ============================================
# Interview Question Banks by Type & Difficulty
# ============================================
INTERVIEW_QUESTIONS = {
    "Python": {
        "Easy": [
            "What are the basic data types in Python?",
            "Explain the difference between a list and a tuple.",
            "What is a dictionary in Python and how do you use it?",
            "How do you handle exceptions in Python?",
            "What is the difference between == and is operators?",
        ],
        "Medium": [
            "Explain decorators in Python with an example.",
            "What are generators and how are they different from regular functions?",
            "Explain the Global Interpreter Lock (GIL) in Python.",
            "What is the difference between deep copy and shallow copy?",
            "How does Python's garbage collection work?",
        ],
        "Hard": [
            "Explain metaclasses in Python and when you would use them.",
            "How would you implement a thread-safe singleton in Python?",
            "Explain the descriptor protocol in Python.",
            "What are context managers and how do you implement one?",
            "Explain the difference between asyncio, threading, and multiprocessing.",
        ],
    },
    "Node.js": {
        "Easy": [
            "What is Node.js and why is it used?",
            "Explain the event loop in Node.js.",
            "What is the difference between require and import?",
            "How do you handle asynchronous operations in Node.js?",
            "What is npm and what is package.json used for?",
        ],
        "Medium": [
            "Explain streams in Node.js and their types.",
            "What is the difference between process.nextTick and setImmediate?",
            "How does clustering work in Node.js?",
            "Explain middleware in Express.js.",
            "What is the purpose of the Buffer class?",
        ],
        "Hard": [
            "How would you handle memory leaks in a Node.js application?",
            "Explain the V8 engine's garbage collection mechanism.",
            "How do you implement graceful shutdown in Node.js?",
            "Explain the differences between worker threads and child processes.",
            "How would you design a rate limiter for a high-traffic API?",
        ],
    },
    "React": {
        "Easy": [
            "What is React and what are its main features?",
            "Explain the difference between state and props.",
            "What is JSX?",
            "How do you handle events in React?",
            "What are React hooks and name some common ones.",
        ],
        "Medium": [
            "Explain the virtual DOM and reconciliation.",
            "What is the difference between useEffect and useLayoutEffect?",
            "How does Context API work in React?",
            "Explain React's component lifecycle.",
            "What are higher-order components?",
        ],
        "Hard": [
            "How would you optimize a React application with millions of list items?",
            "Explain React Fiber architecture.",
            "How do you implement code splitting and lazy loading?",
            "Explain the concurrent mode in React.",
            "How would you design a state management solution from scratch?",
        ],
    },
    "Java": {
        "Easy": [
            "What is the difference between JDK, JRE, and JVM?",
            "Explain object-oriented programming principles.",
            "What is the difference between == and equals() method?",
            "What are access modifiers in Java?",
            "Explain the difference between ArrayList and LinkedList.",
        ],
        "Medium": [
            "Explain the Java memory model and heap vs stack.",
            "What is the difference between abstract classes and interfaces?",
            "Explain multithreading and synchronization in Java.",
            "What are Java Streams and how do they work?",
            "Explain the SOLID principles with examples.",
        ],
        "Hard": [
            "Explain Java's garbage collection algorithms.",
            "How would you implement a custom class loader?",
            "Explain the Java Memory Model and happens-before relationship.",
            "How do you handle deadlocks in a concurrent application?",
            "Explain reflection and its use cases.",
        ],
    },
    "Other": {
        "Easy": [
            "Tell me about your programming experience.",
            "What projects have you worked on recently?",
            "How do you approach problem-solving?",
            "What is your experience with version control systems?",
            "How do you stay updated with new technologies?",
        ],
        "Medium": [
            "Explain a challenging technical problem you solved.",
            "How do you ensure code quality in your projects?",
            "Describe your experience with agile methodologies.",
            "How do you handle technical debt?",
            "Explain your experience with testing and CI/CD.",
        ],
        "Hard": [
            "How would you design a scalable microservices architecture?",
            "Explain your approach to system design.",
            "How do you handle distributed systems challenges?",
            "Describe a time when you had to make a difficult technical decision.",
            "How would you mentor junior developers?",
        ],
    },
}

DEFAULT_QUESTIONS = INTERVIEW_QUESTIONS["Other"]


def get_questions(interview_type: str, difficulty: str) -> list:
    """Get interview questions based on type and difficulty."""
    type_questions = INTERVIEW_QUESTIONS.get(interview_type, DEFAULT_QUESTIONS)
    return type_questions.get(difficulty, type_questions.get("Medium", []))


# ============================================
# AI Interview Agent
# ============================================
class InterviewerAgent(Agent):
    """AI Agent that conducts technical interviews."""

    def __init__(
        self,
        candidate_name: str = "Candidate",
        interview_type: str = "Python",
        difficulty_level: str = "Medium",
        duration_minutes: int = 30,
        job_title: str = "Software Developer",
        job_description: str = "",
        coding_round: bool = False,
    ):
        self.candidate_name = candidate_name
        self.interview_type = interview_type
        self.difficulty_level = difficulty_level
        self.duration_minutes = duration_minutes
        self.job_title = job_title
        self.job_description = job_description
        self.coding_round = coding_round
        self.questions = get_questions(interview_type, difficulty_level)
        self.current_question_index = 0
        self.interview_started = False

        instructions = self._build_instructions()
        super().__init__(instructions=instructions, tools=[])

    def _build_instructions(self) -> str:
        """Build the AI agent's instructions based on interview parameters."""
        questions_text = "\n".join([f"{i+1}. {q}" for i, q in enumerate(self.questions)])
        
        job_context = ""
        if self.job_description:
            job_context = f"\nJOB DESCRIPTION:\n{self.job_description[:500]}..."

        return f"""You are a professional technical interviewer conducting a {self.difficulty_level} level {self.interview_type} interview for the position of {self.job_title}.

CANDIDATE NAME: {self.candidate_name}
INTERVIEW TYPE: {self.interview_type}
DIFFICULTY: {self.difficulty_level}
DURATION: {self.duration_minutes} minutes
{"INCLUDES CODING ROUND" if self.coding_round else ""}
{job_context}

YOUR ROLE:
- You are conducting a technical interview
- Be professional, friendly, and encouraging
- Ask questions clearly and give the candidate time to think
- Listen carefully to answers and ask follow-up questions when appropriate
- Provide brief positive feedback after each answer
- Keep track of time and manage the interview flow

INTERVIEW QUESTIONS TO ASK:
{questions_text}

INTERVIEW FLOW:
1. Start with a warm greeting and brief introduction
2. Explain the interview format and duration
3. Ask questions one by one from the list above
4. After each answer, provide brief feedback and move to the next question
5. If the candidate struggles, offer hints or move on gracefully
6. At the end, thank the candidate and explain next steps

IMPORTANT GUIDELINES:
- Speak clearly and at a moderate pace
- Be patient and give the candidate time to think
- Don't interrupt the candidate while they're answering
- Keep responses concise - this is a voice interview
- If the candidate goes off-topic, gently guide them back
- Be encouraging even when answers are incorrect
- Maintain a professional but friendly tone throughout

Remember: You're evaluating technical knowledge, communication skills, and problem-solving ability."""

    async def on_enter(self) -> None:
        """Called when the agent joins the meeting."""
        greeting = f"""Hello {self.candidate_name}! Welcome to your technical interview for the {self.job_title} position.

I'm your AI interviewer today, and I'll be conducting a {self.difficulty_level} level {self.interview_type} interview.

This interview will last approximately {self.duration_minutes} minutes. I'll ask you several technical questions, and please take your time to think before answering.

Are you ready to begin?"""

        await self.session.say(greeting)
        self.interview_started = True

    async def on_exit(self) -> None:
        """Called when the agent leaves the meeting."""
        closing = f"""Thank you so much for participating in this interview, {self.candidate_name}.

You've completed all the questions. Our HR team will review your responses and get back to you within the next few days.

Best of luck, and have a great day! Goodbye."""

        await self.session.say(closing)


# ============================================
# Global state for interview context
# ============================================
INTERVIEW_CONTEXT = {
    "interview_data": None,
    "room_id": None,
    "auth_token": None,
}


# ============================================
# Session Management
# ============================================
async def start_session(context: JobContext):
    """Initialize and start the AI interview session."""

    interview_data = INTERVIEW_CONTEXT.get("interview_data")
    
    # Extract interview details
    if interview_data:
        interview_type = interview_data.get("interview_type", "Python")
        difficulty_level = interview_data.get("difficulty_level", "Medium")
        duration_minutes = interview_data.get("duration_minutes", 30)
        coding_round = interview_data.get("coding_round", False)
        
        # Get candidate details
        candidate_selection = interview_data.get("candidate_selections", {})
        resume = candidate_selection.get("resumes", {}) if candidate_selection else {}
        job = candidate_selection.get("job_descriptions", {}) if candidate_selection else {}
        
        candidate_name = resume.get("name", "Candidate") if resume else "Candidate"
        job_title = job.get("title", "Software Developer") if job else "Software Developer"
        job_description = job.get("description", "") if job else ""
    else:
        # Fallback to environment variables
        interview_type = os.getenv("INTERVIEW_TYPE", "Python")
        difficulty_level = os.getenv("DIFFICULTY_LEVEL", "Medium")
        duration_minutes = int(os.getenv("DURATION_MINUTES", "30"))
        coding_round = os.getenv("CODING_ROUND", "false").lower() == "true"
        candidate_name = os.getenv("CANDIDATE_NAME", "Candidate")
        job_title = os.getenv("JOB_TITLE", "Software Developer")
        job_description = ""

    gemini_api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    gemini_voice = os.getenv("GEMINI_VOICE", "Leda")

    if not gemini_api_key:
        raise ValueError("GOOGLE_API_KEY or GEMINI_API_KEY is required")

    print(f"\n{'='*50}")
    print("AI Interview Agent Starting")
    print(f"{'='*50}")
    print(f"Candidate: {candidate_name}")
    print(f"Interview Type: {interview_type}")
    print(f"Difficulty: {difficulty_level}")
    print(f"Duration: {duration_minutes} minutes")
    print(f"Job Title: {job_title}")
    print(f"Coding Round: {coding_round}")
    print(f"{'='*50}\n")

    # Create the interviewer agent
    agent = InterviewerAgent(
        candidate_name=candidate_name,
        interview_type=interview_type,
        difficulty_level=difficulty_level,
        duration_minutes=duration_minutes,
        job_title=job_title,
        job_description=job_description,
        coding_round=coding_round,
    )

    # Initialize Gemini Realtime model - handles speech-to-speech internally
    # Gemini's native audio model handles VAD and turn detection
    model = GeminiRealtime(
        model="gemini-2.5-flash-native-audio-preview-12-2025",
        api_key=gemini_api_key,
        config=GeminiLiveConfig(
            voice=gemini_voice,
            response_modalities=["AUDIO"],
        ),
    )

    # RealTimePipeline - Gemini handles everything internally
    pipeline = RealTimePipeline(model=model)

    print("✅ Realtime Pipeline configured (Gemini Speech-to-Speech)")

    # Create session - simplified setup matching working example
    session = AgentSession(
        agent=agent,
        pipeline=pipeline,
    )

    # Update interview status to active if we have interview data
    if interview_data and interview_data.get("id"):
        try:
            supabase = get_supabase_client()
            update_interview_status(supabase, interview_data["id"], "active")
            print("✅ Interview status updated to 'active'")
        except Exception as e:
            print(f"⚠️ Could not update interview status: {e}")

    try:
        await context.connect()
        print("✅ Connected to VideoSDK room")
        await session.start()
        print("✅ Interview session started")
        # Keep the session running until manually terminated
        await asyncio.Event().wait()
    except Exception as e:
        print(f"❌ Error: {e}")
        raise
    finally:
        # Update interview status to completed
        if interview_data and interview_data.get("id"):
            try:
                supabase = get_supabase_client()
                update_interview_status(supabase, interview_data["id"], "completed")
                print("✅ Interview status updated to 'completed'")
            except Exception as e:
                print(f"⚠️ Could not update interview status: {e}")
        
        await session.close()
        await context.shutdown()
        print("Interview session ended")


def make_context() -> JobContext:
    """Create the job context with room configuration."""
    room_id = INTERVIEW_CONTEXT.get("room_id")
    auth_token = INTERVIEW_CONTEXT.get("auth_token")

    if not room_id:
        raise ValueError("Room ID is required")
    if not auth_token:
        raise ValueError("Auth token is required")

    agent_name = os.getenv("AGENT_NAME", "AI Interviewer")

    room_options = RoomOptions(
        room_id=room_id,
        auth_token=auth_token,
        name=agent_name,
        playground=True,
    )

    return JobContext(room_options=room_options)


# ============================================
# Polling Loop for Auto-Join
# ============================================
def poll_and_join_interviews():
    """
    Continuously poll for new interviews and spawn a separate agent process
    for each interview. This avoids event-loop issues by running one
    VideoSDK WorkerJob per Python process.
    """
    import time as time_module

    api_key = os.getenv("VIDEOSDK_API_KEY")
    secret = os.getenv("VIDEOSDK_SECRET")

    if not api_key or not secret:
        print("❌ ERROR: VIDEOSDK_API_KEY and VIDEOSDK_SECRET are required")
        return

    print("\n" + "=" * 60)
    print("🤖 AI Interview Agent - Polling Mode")
    print("=" * 60)
    print("Agent will automatically join interviews when created.")
    print("Create an interview in the HR app and the agent will join!")
    print("=" * 60 + "\n")

    processed_room_ids: set[str] = set()

    while True:
        try:
            # Connect to Supabase
            supabase = get_supabase_client()

            # Look for newest interview that needs an AI agent
            result = (
                supabase.from_("interview_configurations")
                .select(
                    """
                    *,
                    candidate_selections (
                        id,
                        resume_id,
                        job_description_id,
                        resumes (
                            id,
                            name,
                            email,
                            years_of_experience,
                            location,
                            degree
                        ),
                        job_descriptions (
                            id,
                            title,
                            description,
                            required_skills
                        )
                    )
                    """
                )
                .in_("status", ["scheduled", "active"])
                .not_.is_("room_id", "null")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )

            if result.data and len(result.data) > 0:
                interview_data = result.data[0]
                room_id = interview_data.get("room_id")

                # Skip if we've already started an agent for this room
                if room_id in processed_room_ids:
                    time_module.sleep(3)
                    continue

                candidate_selection = interview_data.get("candidate_selections", {}) or {}
                resume = candidate_selection.get("resumes", {}) or {}
                candidate_name = resume.get("name", "Unknown")

                print("\n🎯 New interview detected!")
                print(f"   Room ID: {room_id}")
                print(f"   Candidate: {candidate_name}")
                print(f"   Type: {interview_data.get('interview_type')}")
                print(f"   Difficulty: {interview_data.get('difficulty_level')}")

                processed_room_ids.add(room_id)

                # Spawn a separate process that runs this script in 'run' mode
                print("\n🚀 Spawning AI agent process for this room...")
                cmd = [
                    sys.executable,
                    os.path.abspath(__file__),
                    "run",
                    f"--room-id={room_id}",
                ]
                try:
                    subprocess.Popen(cmd)
                    print("✅ Agent process started")
                except Exception as e:
                    print(f"❌ Failed to start agent process: {e}")
            else:
                print("⏳ No scheduled interviews. Waiting for new interview...")

            time_module.sleep(3)

        except KeyboardInterrupt:
            print("\n👋 Agent stopped by user")
            break
        except Exception as e:
            print(f"⚠️ Error: {e}")
            time_module.sleep(3)


# ============================================
# Main Entry Point
# ============================================
def main():
    """Main entry point with automatic token generation and Supabase integration."""

    parser = argparse.ArgumentParser(
        description="AI Interview Agent - Auto-connects to VideoSDK rooms from Supabase",
    )
    parser.add_argument("mode", nargs="?", default="poll", choices=["poll", "run", "console"])
    parser.add_argument("--room-id", type=str, help="Override room ID (for 'run' mode)")
    parser.add_argument("--interview-type", type=str, help="Override interview type")
    parser.add_argument("--difficulty", type=str, help="Override difficulty level")
    parser.add_argument("--candidate", type=str, help="Override candidate name")
    args = parser.parse_args()

    # Get VideoSDK credentials
    api_key = os.getenv("VIDEOSDK_API_KEY")
    secret = os.getenv("VIDEOSDK_SECRET")

    if not api_key or not secret:
        print("❌ ERROR: VIDEOSDK_API_KEY and VIDEOSDK_SECRET are required")
        print("Add them to your .env file")
        sys.exit(1)

    # Handle different modes
    if args.mode == "poll":
        # Default: Continuously poll and auto-join interviews
        print("🔐 Generating VideoSDK JWT token...")
        poll_and_join_interviews()  # Synchronous polling loop
        return

    if args.mode == "console":
        print("🔐 Generating VideoSDK JWT token...")
        auth_token = generate_videosdk_token(api_key, secret)
        INTERVIEW_CONTEXT["auth_token"] = auth_token
        print("✅ Token generated successfully")
        
        print("\n🎤 Console mode - testing with local mic/speaker")
        INTERVIEW_CONTEXT["room_id"] = "console-test"
        
        # Apply CLI overrides
        if args.interview_type:
            os.environ["INTERVIEW_TYPE"] = args.interview_type
        if args.difficulty:
            os.environ["DIFFICULTY_LEVEL"] = args.difficulty
        if args.candidate:
            os.environ["CANDIDATE_NAME"] = args.candidate
        
        sys.argv = [sys.argv[0], "console"]
        job = WorkerJob(entrypoint=start_session, jobctx=make_context)
        job.start()
        return

    # "run" mode - one-time execution
    print("🔐 Generating VideoSDK JWT token...")
    auth_token = generate_videosdk_token(api_key, secret)
    INTERVIEW_CONTEXT["auth_token"] = auth_token
    print("✅ Token generated successfully")

    # Check for room ID override
    if args.room_id:
        print(f"\n📍 Using specified room ID: {args.room_id}")
        INTERVIEW_CONTEXT["room_id"] = args.room_id
        
        # Try to fetch interview details from Supabase
        try:
            supabase = get_supabase_client()
            interview_data = fetch_interview_by_room_id(supabase, args.room_id)
            if interview_data:
                INTERVIEW_CONTEXT["interview_data"] = interview_data
                print("✅ Interview details loaded from database")
        except Exception as e:
            print(f"⚠️ Could not fetch interview details: {e}")
    else:
        # Auto-detect active interview from Supabase
        print("\n🔍 Searching for active interviews in database...")
        try:
            supabase = get_supabase_client()
            interview_data = fetch_active_interview(supabase)
            
            if interview_data:
                room_id = interview_data.get("room_id")
                candidate_selection = interview_data.get("candidate_selections", {})
                resume = candidate_selection.get("resumes", {}) if candidate_selection else {}
                candidate_name = resume.get("name", "Unknown") if resume else "Unknown"
                
                print(f"✅ Found active interview:")
                print(f"   Room ID: {room_id}")
                print(f"   Candidate: {candidate_name}")
                print(f"   Type: {interview_data.get('interview_type')}")
                print(f"   Difficulty: {interview_data.get('difficulty_level')}")
                
                INTERVIEW_CONTEXT["room_id"] = room_id
                INTERVIEW_CONTEXT["interview_data"] = interview_data
            else:
                print("❌ No active interviews found in database")
                print("\nTo start an interview:")
                print("  1. Create an instant interview from the HR app")
                print("  2. Or run with --room-id=<your-room-id>")
                sys.exit(1)
        except Exception as e:
            print(f"❌ Error connecting to Supabase: {e}")
            print("\nMake sure SUPABASE_URL and SUPABASE_ANON_KEY are set in .env")
            sys.exit(1)

    # Apply CLI overrides
    if args.interview_type and INTERVIEW_CONTEXT.get("interview_data"):
        INTERVIEW_CONTEXT["interview_data"]["interview_type"] = args.interview_type
    if args.difficulty and INTERVIEW_CONTEXT.get("interview_data"):
        INTERVIEW_CONTEXT["interview_data"]["difficulty_level"] = args.difficulty

    # Start the agent
    print("\n🚀 Starting AI Interview Agent...")
    job = WorkerJob(entrypoint=start_session, jobctx=make_context)
    job.start()


if __name__ == "__main__":
    main()
