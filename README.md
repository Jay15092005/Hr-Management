# HR Management System

An AI-assisted interview system where HR controls the hiring process, AI evaluates skills, and decisions always remain human.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- Supabase account (already configured)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Environment variables are already configured in `.env` file. If you need to set up a new environment:
   - Copy `.env.example` to `.env`
   - Fill in your Supabase credentials

3. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or the port Vite assigns).

## 📋 Current Features

### Step 0: Resume List
- View all available resumes
- Display candidate name, email, date of application, and resume file
- Resumes are stored in Supabase database

### Step 1: HR Filters
- Manually filter resumes by:
  - Date range (applied after/before)
  - Minimum years of experience
  - Location (India, Remote, etc.)
  - Degree required
- Human-controlled filtering (no AI)

### Step 2: AI Resume Evaluation
- Create and manage job descriptions
- AI evaluates shortlisted resumes using Google Gemini
- Get scores (0-100) for each resume
- View missing skills and summary
- Scores stored in database for future reference

## 🗄️ Database Schema

### Resumes Table
- `id` (UUID) - Primary key
- `name` (VARCHAR) - Candidate name
- `email` (VARCHAR) - Candidate email
- `date_of_application` (TIMESTAMP) - Application date
- `resume_file_url` (TEXT) - URL to resume file
- `resume_file_name` (VARCHAR) - Name of resume file
- `years_of_experience` (INTEGER) - Years of experience
- `location` (VARCHAR) - Candidate location
- `degree` (VARCHAR) - Degree qualification
- `created_at` (TIMESTAMP) - Record creation timestamp
- `updated_at` (TIMESTAMP) - Last update timestamp

### Job Descriptions Table
- `id` (UUID) - Primary key
- `title` (VARCHAR) - Job title
- `description` (TEXT) - Job description
- `required_skills` (TEXT[]) - Array of required skills
- `min_experience_years` (INTEGER) - Minimum experience required
- `location` (VARCHAR) - Job location
- `degree_required` (VARCHAR) - Required degree
- `is_active` (BOOLEAN) - Active status
- `created_at` (TIMESTAMP) - Record creation timestamp
- `updated_at` (TIMESTAMP) - Last update timestamp

### Resume Scores Table
- `id` (UUID) - Primary key
- `resume_id` (UUID) - Foreign key to resumes
- `job_description_id` (UUID) - Foreign key to job_descriptions
- `score` (INTEGER) - AI evaluation score (0-100)
- `missing_skills` (TEXT[]) - Array of missing skills
- `summary` (TEXT) - Evaluation summary
- `resume_text` (TEXT) - Extracted resume text
- `evaluated_at` (TIMESTAMP) - Evaluation timestamp
- `created_at` (TIMESTAMP) - Record creation timestamp

## 🛠️ Technology Stack

- **Frontend**: React + TypeScript + Vite
- **Database & Auth**: Supabase
- **Styling**: CSS

## 🔧 Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in:
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key
- `VITE_GEMINI_API_KEY` - Your Google Gemini API key (see GEMINI_SETUP.md)

### 3. Start Development Server
```bash
npm run dev
```

## 📝 Next Steps

- ✅ Resume upload functionality
- ✅ HR filtering feature
- ✅ AI resume evaluation (Google Gemini)
- ⏳ Interview scheduling system
- ⏳ Resume text extraction from PDF/DOCX files
- ⏳ Advanced filtering options
