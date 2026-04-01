# AI Interview Agent

AI-powered voice agent that **automatically** conducts technical interviews using VideoSDK and Google Gemini.

## Features

- **Auto Token Generation**: JWT token is generated automatically from API key + secret
- **Auto Interview Detection**: Fetches active interviews from Supabase database
- **Full Interview Flow**: Greets candidate, asks questions, provides feedback
- **Status Tracking**: Updates interview status in database (active → completed)

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  HR Management  │────▶│   Supabase      │◀────│  AI Interview   │
│  (React App)    │     │   Database      │     │  Agent (Python) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │ Creates interview     │ Fetches interview     │
        │ + room_id             │ details automatically │
        ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Candidate     │────▶│   VideoSDK      │◀────│  Auto-joins     │
│   (Browser)     │     │   Room          │     │  same room      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Quick Start

### 1. Setup Python Environment

```bash
cd ai-agent

# Create virtual environment (Python 3.12+)
python3.12 -m venv venv

# Activate virtual environment
# macOS/Linux:
source venv/bin/activate
# Windows:
# venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment

The `.env` file is already configured with your credentials:
- VideoSDK API Key + Secret (for auto token generation)
- Supabase URL + Key (for auto interview detection)
- Google Gemini API Key (for voice AI)

### 4. Run the Agent

```bash
# Auto-detect active interview from database and join
python main.py

# Console mode (test locally with mic/speaker)
python main.py console

# Join specific room
python main.py --room-id=your-room-id
```

## How It Works

1. **Token Generation**: Agent generates VideoSDK JWT token from API key + secret
2. **Interview Detection**: Queries Supabase for active interviews with room_id
3. **Auto Join**: Joins the VideoSDK room where the candidate is waiting
4. **Interview Flow**:
   - Greets candidate by name
   - Explains interview format
   - Asks technical questions based on type & difficulty
   - Provides feedback on answers
   - Thanks and concludes
5. **Status Update**: Updates interview status to "completed" in database

## Automatic Features

| Feature | Description |
|---------|-------------|
| **JWT Token** | Generated from API key + secret (no manual token needed) |
| **Room ID** | Fetched from Supabase (finds active interviews) |
| **Candidate Name** | Loaded from database (resumes table) |
| **Interview Type** | Loaded from database (interview_configurations) |
| **Difficulty Level** | Loaded from database (interview_configurations) |
| **Job Title** | Loaded from database (job_descriptions) |

## Usage Examples

```bash
# Most common: auto-detect and join active interview
python main.py

# Test with console (mic/speaker)
python main.py console

# Join specific room (if you know the room ID)
python main.py --room-id=7q9z-qhvm-6ehe

# Override interview type
python main.py --interview-type=React --difficulty=Hard
```

## Configuration

### .env Variables

```env
# VideoSDK (token is auto-generated from these)
VIDEOSDK_API_KEY=cda74377-c6f8-464a-b7d2-9387c987e491
VIDEOSDK_SECRET=ea90f73abcf16af8dbc7c15b7c21d3a62d41f692aafa70aa3e6ae0c7c7e4f585

# Supabase — use SERVICE ROLE for the agent (bypasses RLS on interview rows; never ship to the browser)
# You may use only VITE_SUPABASE_URL from the frontend .env; the agent picks that up too.
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...

# Google Gemini
GOOGLE_API_KEY=AIzaSy...

# Optional
GEMINI_VOICE=Leda
AGENT_NAME=AI Interviewer
```

### Interview Types Supported

- **Python** (Easy/Medium/Hard)
- **Node.js** (Easy/Medium/Hard)
- **React** (Easy/Medium/Hard)
- **Java** (Easy/Medium/Hard)
- **Other** (General technical)

### Gemini Voices

Puck, Charon, Kore, Fenrir, Aoede, **Leda** (default), Orus, Zephyr

## Integration with HR App

1. **Create Instant Interview** in HR app → Room is created, email sent to candidate
2. **Run AI Agent** → Agent auto-detects the active interview
3. **Candidate Joins** → Both are in the same room
4. **AI Conducts Interview** → Questions, feedback, conclusion
5. **Interview Ends** → Status updated to "completed" in database

## Troubleshooting

### "No active interviews found"
- Create an instant interview from the HR app first
- Or use `--room-id=xxx` to join a specific room

### Agent never joins / polling shows no interviews
- Set **SUPABASE_SERVICE_ROLE_KEY** in `.env`. The anon key cannot read `interview_configurations` under RLS, so polling returns no rows while candidates can still join via `interview_join_context`.
- You can put credentials in the repo-root `.env` or `ai-agent/.env` (both are loaded).

### "Error connecting to Supabase"
- Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`

### "Token generation failed"
- Verify VIDEOSDK_API_KEY and VIDEOSDK_SECRET

## References

- [VideoSDK AI Agents Documentation](https://docs.videosdk.live/ai_agents/introduction)
- [VideoSDK Authentication](https://docs.videosdk.live/ai_agents/authentication-and-token)
- [VideoSDK Agents GitHub](https://github.com/videosdk-live/agents)
