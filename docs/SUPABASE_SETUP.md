# Supabase Configuration Guide

| | |
|---|---|
| **Project** | Critical Code Studies Workbench (CCS-WB) |
| **Author** | David M. Berry |
| **Version** | 1.0.0 |
| **Date** | 27 January 2026 |
| **Schema Version** | 2.8.1 |

---

This document explains how to **self-host** the optional Supabase backend
for Critical Code Studies Workbench (CCS-WB) if you want **real-time
multi-user Cloud sync** (the Cloud tier in `docs/COLLABORATION.md`).
Supabase is **not a hosted service we run** — CCS-WB is shipped as a
local-first client; to use Cloud you bring your own Supabase project
and either self-host the CCS-WB build pointed at it, or set the env
vars on your own Vercel deployment.

## Overview

CCS-WB has two collaboration tiers; only the second needs this guide:

1. **Local (default).** No Supabase, no accounts, no network. Code
   annotation, threaded comments on annotations, `.ccs` save/load, and
   asynchronous file-based collaboration via the *Merge annotations*
   button all work fully offline; everything persists in the `.ccs`
   file and unions correctly when collaborators exchange files.
2. **Cloud (this document).** Real-time multi-user collaboration via
   Supabase: shared projects, OAuth sign-in, members and roles, invite
   links, live sync, public library. Self-hosted: you provide the
   Supabase project and its credentials. On the free tier, the backend
   auto-pauses when idle, so the first request of a session after
   inactivity can stall briefly.

If neither runtime UI config nor env vars are set, Local is fully
functional and the Cloud UI is hidden entirely.

### Two ways to point CCS-WB at your Supabase project

| | Runtime (UI) — recommended | Build-time (env vars) |
|---|---|---|
| Where you set it | **Settings → Cloud → Cloud Backend (Supabase)** in any running CCS-WB | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` at `npm run build` time |
| Scope | Per-browser (localStorage) | Per-deployment |
| Rebuild needed | No — Save & reload | Yes |
| Best for | An end user plugging into their own backend without forking | Self-hosters running their own CCS-WB build |
| Precedence | Wins when both are set | Fallback if no runtime config |

Either way you still need to provision the Supabase project itself
(the rest of this document) — they're just two different places to
record its URL + anon key.

## Prerequisites

- A Supabase account (free tier is sufficient for most use cases)
- Access to the Supabase SQL Editor
- OAuth credentials if you want social login (Google, GitHub)

---

## Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Choose your organization
4. Enter a project name (e.g., "ccs-workbench")
5. Generate a secure database password (save this somewhere safe)
6. Select your preferred region
7. Click "Create new project" and wait for provisioning

---

## Step 2: Configure Environment Variables

Once your project is created:

1. Go to **Settings > API** in your Supabase dashboard
2. Copy the following values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (the longer one under "Project API keys")

3. Create a `.env.local` file in your CCS-WB project root:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

---

## Step 3: Create Database Schema

Go to **SQL Editor** in your Supabase dashboard and run the following SQL to create all required tables:

### 3.1 Create Custom Types

```sql
-- Annotation types
CREATE TYPE annotation_type AS ENUM (
  'observation',
  'question',
  'metaphor',
  'pattern',
  'context',
  'critique'
);

-- Member roles for project collaboration
CREATE TYPE member_role AS ENUM (
  'owner',
  'editor',
  'viewer'
);

-- Accession status for library workflow
CREATE TYPE accession_status AS ENUM (
  'draft',
  'submitted',
  'reviewed',
  'approved'
);
```

### 3.2 Create Tables

```sql
-- ================================================
-- PROFILES TABLE
-- Extended user profile information
-- ================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  initials TEXT,
  affiliation TEXT,
  avatar_url TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- PROJECTS TABLE
-- Main project/session storage
-- ================================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  mode TEXT DEFAULT 'solo',
  session_data JSONB,
  is_public BOOLEAN DEFAULT FALSE,
  accession_status accession_status DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,  -- For soft delete / trash functionality
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- PROJECT_MEMBERS TABLE
-- Tracks who has access to each project
-- ================================================
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role member_role DEFAULT 'viewer',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- ================================================
-- CODE_FILES TABLE
-- Stores code files within projects
-- ================================================
CREATE TABLE code_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  language TEXT,
  content TEXT NOT NULL,
  original_content TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- ANNOTATIONS TABLE
-- Line-level annotations on code files
-- ================================================
CREATE TABLE annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES code_files(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  line_number INTEGER NOT NULL,
  end_line_number INTEGER,
  line_content TEXT,
  type annotation_type NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- CHAT_MESSAGES TABLE
-- AI conversation history per project
-- ================================================
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  is_ai BOOLEAN DEFAULT FALSE,
  is_marked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- PROJECT_INVITES TABLE
-- Shareable invite links for projects
-- ================================================
CREATE TABLE project_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  role TEXT DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
```

### 3.3 Create Indexes

```sql
-- Performance indexes
CREATE INDEX idx_projects_owner_id ON projects(owner_id);
CREATE INDEX idx_projects_is_public ON projects(is_public);
CREATE INDEX idx_projects_accession_status ON projects(accession_status);
CREATE INDEX idx_projects_deleted_at ON projects(deleted_at);
CREATE INDEX idx_project_members_project_id ON project_members(project_id);
CREATE INDEX idx_project_members_user_id ON project_members(user_id);
CREATE INDEX idx_code_files_project_id ON code_files(project_id);
CREATE INDEX idx_annotations_file_id ON annotations(file_id);
CREATE INDEX idx_annotations_project_id ON annotations(project_id);
CREATE INDEX idx_chat_messages_project_id ON chat_messages(project_id);
CREATE INDEX idx_project_invites_token ON project_invites(token);
CREATE INDEX idx_project_invites_project_id ON project_invites(project_id);
```

### 3.4 Create Updated_at Trigger

```sql
-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to relevant tables
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_code_files_updated_at
  BEFORE UPDATE ON code_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_annotations_updated_at
  BEFORE UPDATE ON annotations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## Step 4: Configure Row Level Security (RLS)

RLS policies control who can access what data. Run these in the SQL Editor:

### 4.1 Enable RLS on All Tables

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_invites ENABLE ROW LEVEL SECURITY;
```

### 4.2 Profiles Policies

```sql
-- Users can view all profiles (for displaying collaborator info)
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
```

### 4.3 Projects Policies

```sql
-- Users can view their own projects
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (owner_id = auth.uid());

-- Users can view projects they're members of
CREATE POLICY "Users can view projects they are members of"
  ON projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = projects.id
      AND project_members.user_id = auth.uid()
    )
  );

-- Anyone can view public library projects
CREATE POLICY "Anyone can view public projects"
  ON projects FOR SELECT
  USING (is_public = true AND accession_status = 'approved');

-- Users can create projects
CREATE POLICY "Users can create projects"
  ON projects FOR INSERT
  WITH CHECK (owner_id = auth.uid() OR owner_id IS NULL);

-- Users can update their own projects
CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (owner_id = auth.uid() OR owner_id IS NULL)
  WITH CHECK (owner_id = auth.uid() OR owner_id IS NULL);

-- Admins can update any project (for library management)
CREATE POLICY "Admins can update any project"
  ON projects FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Users can delete their own projects
CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (owner_id = auth.uid());

-- Admins can delete any project
CREATE POLICY "Admins can delete any project"
  ON projects FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
```

### 4.4 Project Members Policies

```sql
-- Users can view members of projects they have access to
CREATE POLICY "Users can view project members"
  ON project_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_members.project_id
      AND (
        projects.owner_id = auth.uid()
        OR projects.is_public = true
        OR EXISTS (
          SELECT 1 FROM project_members pm2
          WHERE pm2.project_id = projects.id
          AND pm2.user_id = auth.uid()
        )
      )
    )
  );

-- Project owners and admins can add members
CREATE POLICY "Owners can add members"
  ON project_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_members.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Users can add themselves (for joining via invite)
CREATE POLICY "Users can add themselves as members"
  ON project_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Project owners can update member roles
CREATE POLICY "Owners can update members"
  ON project_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_members.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Project owners can remove members
CREATE POLICY "Owners can remove members"
  ON project_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_members.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Users can remove themselves from projects
CREATE POLICY "Users can remove themselves"
  ON project_members FOR DELETE
  USING (user_id = auth.uid());
```

### 4.5 Code Files Policies

```sql
-- Users can view code files in accessible projects
CREATE POLICY "Users can view code files"
  ON code_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = code_files.project_id
      AND (
        projects.owner_id = auth.uid()
        OR projects.is_public = true
        OR EXISTS (
          SELECT 1 FROM project_members
          WHERE project_members.project_id = projects.id
          AND project_members.user_id = auth.uid()
        )
      )
    )
  );

-- Project owners and editors can insert code files
CREATE POLICY "Editors can insert code files"
  ON code_files FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = code_files.project_id
      AND (
        projects.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM project_members
          WHERE project_members.project_id = projects.id
          AND project_members.user_id = auth.uid()
          AND project_members.role IN ('owner', 'editor')
        )
      )
    )
  );

-- Project owners and editors can update code files
CREATE POLICY "Editors can update code files"
  ON code_files FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = code_files.project_id
      AND (
        projects.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM project_members
          WHERE project_members.project_id = projects.id
          AND project_members.user_id = auth.uid()
          AND project_members.role IN ('owner', 'editor')
        )
      )
    )
  );

-- Project owners and editors can delete code files
CREATE POLICY "Editors can delete code files"
  ON code_files FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = code_files.project_id
      AND (
        projects.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM project_members
          WHERE project_members.project_id = projects.id
          AND project_members.user_id = auth.uid()
          AND project_members.role IN ('owner', 'editor')
        )
      )
    )
  );

-- Admins can manage all code files
CREATE POLICY "Admins can manage code files"
  ON code_files FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
```

### 4.6 Annotations Policies

```sql
-- Users can view annotations in accessible projects
CREATE POLICY "Users can view annotations"
  ON annotations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = annotations.project_id
      AND (
        projects.owner_id = auth.uid()
        OR projects.is_public = true
        OR EXISTS (
          SELECT 1 FROM project_members
          WHERE project_members.project_id = projects.id
          AND project_members.user_id = auth.uid()
        )
      )
    )
  );

-- Project owners and editors can create annotations
CREATE POLICY "Editors can create annotations"
  ON annotations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = annotations.project_id
      AND (
        projects.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM project_members
          WHERE project_members.project_id = projects.id
          AND project_members.user_id = auth.uid()
          AND project_members.role IN ('owner', 'editor')
        )
      )
    )
  );

-- Users can update their own annotations
CREATE POLICY "Users can update own annotations"
  ON annotations FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own annotations
CREATE POLICY "Users can delete own annotations"
  ON annotations FOR DELETE
  USING (user_id = auth.uid());

-- Project owners can delete any annotation in their project
CREATE POLICY "Owners can delete project annotations"
  ON annotations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = annotations.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Admins can manage all annotations
CREATE POLICY "Admins can manage annotations"
  ON annotations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
```

### 4.7 Chat Messages Policies

```sql
-- Users can view chat messages in accessible projects
CREATE POLICY "Users can view chat messages"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = chat_messages.project_id
      AND (
        projects.owner_id = auth.uid()
        OR projects.is_public = true
        OR EXISTS (
          SELECT 1 FROM project_members
          WHERE project_members.project_id = projects.id
          AND project_members.user_id = auth.uid()
        )
      )
    )
  );

-- Project members can create chat messages
CREATE POLICY "Members can create chat messages"
  ON chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = chat_messages.project_id
      AND (
        projects.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM project_members
          WHERE project_members.project_id = projects.id
          AND project_members.user_id = auth.uid()
        )
      )
    )
  );

-- Users can update their own messages (for marking)
CREATE POLICY "Users can update own messages"
  ON chat_messages FOR UPDATE
  USING (user_id = auth.uid() OR user_id IS NULL);

-- Admins can manage all chat messages
CREATE POLICY "Admins can manage chat messages"
  ON chat_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
```

### 4.8 Project Invites Policies

```sql
-- Anyone can view invite by token (needed for join flow)
CREATE POLICY "Anyone can view invites by token"
  ON project_invites FOR SELECT
  USING (true);

-- Project owners can create invites
CREATE POLICY "Owners can create invites"
  ON project_invites FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_invites.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Project owners can delete invites
CREATE POLICY "Owners can delete invites"
  ON project_invites FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_invites.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Admins can manage all invites
CREATE POLICY "Admins can manage invites"
  ON project_invites FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
```

---

## Step 5: Create Profile Trigger

Automatically create a profile when a user signs up:

```sql
-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, initials, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    UPPER(LEFT(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'U'), 2)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call function on auth.users insert
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

---

## Step 6: Configure Authentication

### 6.1 Enable Auth Providers

Go to **Authentication > Providers** in your Supabase dashboard:

**Email (Magic Link)** - Enabled by default
- Works out of the box
- Consider configuring custom SMTP in **Authentication > Email Templates** for production

**Google OAuth** (Optional)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Go to **APIs & Services > Credentials**
4. Create **OAuth 2.0 Client ID** (Web application)
5. Add authorized redirect URI: `https://your-project.supabase.co/auth/v1/callback`
6. Copy Client ID and Client Secret to Supabase

**GitHub OAuth** (Optional)
1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new **OAuth App**
3. Set Authorization callback URL: `https://your-project.supabase.co/auth/v1/callback`
4. Copy Client ID and Client Secret to Supabase

### 6.2 Configure Site URL

In **Authentication > URL Configuration**:

- **Site URL**: Your production URL (e.g., `https://your-app.vercel.app`)
- **Redirect URLs**: Add all valid callback URLs:
  - `http://localhost:3000/auth/callback` (development)
  - `https://your-app.vercel.app/auth/callback` (production)

---

## Step 7: Set Up Admin User

To designate an admin user who can manage the library:

```sql
-- Replace with the actual user's UUID from auth.users
UPDATE profiles
SET is_admin = true
WHERE id = 'your-user-uuid-here';
```

You can find user UUIDs in **Authentication > Users** in the Supabase dashboard.

---

## Troubleshooting

### Common Issues

**"new row violates row-level security policy"**
- Check that the RLS policies are correctly applied
- Ensure the user has the necessary permissions
- For admin operations, verify the user's `is_admin` flag is set

**Projects not appearing after creation**
- Verify the project's `owner_id` matches `auth.uid()`
- Check that `deleted_at` is NULL

**Invites not working**
- Ensure the invite hasn't expired (`expires_at`)
- Verify the token is unique

**Profile not created on signup**
- Check that the trigger was created correctly
- Verify the `handle_new_user` function exists

### Debugging Tips

1. Check the Supabase logs in **Database > Logs**
2. Test policies with the SQL Editor using `SET LOCAL ROLE authenticated;`
3. Use the Supabase client debug mode:
   ```javascript
   const supabase = createClient(url, key, {
     db: { schema: 'public' },
     auth: { debug: true }
   });
   ```

---

## Schema Updates

When the schema changes, you may need to update the types file:

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/types.ts
```

Or manually update `src/lib/supabase/types.ts` to match your schema changes.

---

## Complete SQL Script

For convenience, here's the complete SQL script to set up everything at once. Copy this entire block and run it in the Supabase SQL Editor:

```sql
-- ==============================================
-- CCS-WB COMPLETE DATABASE SETUP
-- Run this entire script in Supabase SQL Editor
-- ==============================================

-- 1. CREATE TYPES
CREATE TYPE annotation_type AS ENUM (
  'observation', 'question', 'metaphor', 'pattern', 'context', 'critique'
);

CREATE TYPE member_role AS ENUM ('owner', 'editor', 'viewer');

CREATE TYPE accession_status AS ENUM ('draft', 'submitted', 'reviewed', 'approved');

-- 2. CREATE TABLES
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  initials TEXT,
  affiliation TEXT,
  avatar_url TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  mode TEXT DEFAULT 'solo',
  session_data JSONB,
  is_public BOOLEAN DEFAULT FALSE,
  accession_status accession_status DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role member_role DEFAULT 'viewer',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE TABLE code_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  language TEXT,
  content TEXT NOT NULL,
  original_content TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES code_files(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  line_number INTEGER NOT NULL,
  end_line_number INTEGER,
  line_content TEXT,
  type annotation_type NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  is_ai BOOLEAN DEFAULT FALSE,
  is_marked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE project_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  role TEXT DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- 3. CREATE INDEXES
CREATE INDEX idx_projects_owner_id ON projects(owner_id);
CREATE INDEX idx_projects_is_public ON projects(is_public);
CREATE INDEX idx_projects_accession_status ON projects(accession_status);
CREATE INDEX idx_projects_deleted_at ON projects(deleted_at);
CREATE INDEX idx_project_members_project_id ON project_members(project_id);
CREATE INDEX idx_project_members_user_id ON project_members(user_id);
CREATE INDEX idx_code_files_project_id ON code_files(project_id);
CREATE INDEX idx_annotations_file_id ON annotations(file_id);
CREATE INDEX idx_annotations_project_id ON annotations(project_id);
CREATE INDEX idx_chat_messages_project_id ON chat_messages(project_id);
CREATE INDEX idx_project_invites_token ON project_invites(token);
CREATE INDEX idx_project_invites_project_id ON project_invites(project_id);

-- 4. CREATE TRIGGERS
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_code_files_updated_at
  BEFORE UPDATE ON code_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_annotations_updated_at
  BEFORE UPDATE ON annotations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. PROFILE AUTO-CREATE TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, initials, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    UPPER(LEFT(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'U'), 2)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. ENABLE RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_invites ENABLE ROW LEVEL SECURITY;

-- 7. PROFILES POLICIES
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 8. PROJECTS POLICIES
CREATE POLICY "Users can view own projects" ON projects FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Users can view projects they are members of" ON projects FOR SELECT
  USING (EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = projects.id AND project_members.user_id = auth.uid()));
CREATE POLICY "Anyone can view public projects" ON projects FOR SELECT
  USING (is_public = true AND accession_status = 'approved');
CREATE POLICY "Users can create projects" ON projects FOR INSERT WITH CHECK (owner_id = auth.uid() OR owner_id IS NULL);
CREATE POLICY "Users can update own projects" ON projects FOR UPDATE
  USING (owner_id = auth.uid() OR owner_id IS NULL) WITH CHECK (owner_id = auth.uid() OR owner_id IS NULL);
CREATE POLICY "Admins can update any project" ON projects FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
CREATE POLICY "Users can delete own projects" ON projects FOR DELETE USING (owner_id = auth.uid());
CREATE POLICY "Admins can delete any project" ON projects FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- 9. PROJECT_MEMBERS POLICIES
CREATE POLICY "Users can view project members" ON project_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_members.project_id
    AND (projects.owner_id = auth.uid() OR projects.is_public = true
      OR EXISTS (SELECT 1 FROM project_members pm2 WHERE pm2.project_id = projects.id AND pm2.user_id = auth.uid()))));
CREATE POLICY "Owners can add members" ON project_members FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_members.project_id AND projects.owner_id = auth.uid()));
CREATE POLICY "Users can add themselves as members" ON project_members FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owners can update members" ON project_members FOR UPDATE
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_members.project_id AND projects.owner_id = auth.uid()));
CREATE POLICY "Owners can remove members" ON project_members FOR DELETE
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_members.project_id AND projects.owner_id = auth.uid()));
CREATE POLICY "Users can remove themselves" ON project_members FOR DELETE USING (user_id = auth.uid());

-- 10. CODE_FILES POLICIES
CREATE POLICY "Users can view code files" ON code_files FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = code_files.project_id
    AND (projects.owner_id = auth.uid() OR projects.is_public = true
      OR EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = projects.id AND project_members.user_id = auth.uid()))));
CREATE POLICY "Editors can insert code files" ON code_files FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = code_files.project_id
    AND (projects.owner_id = auth.uid()
      OR EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = projects.id
        AND project_members.user_id = auth.uid() AND project_members.role IN ('owner', 'editor')))));
CREATE POLICY "Editors can update code files" ON code_files FOR UPDATE
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = code_files.project_id
    AND (projects.owner_id = auth.uid()
      OR EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = projects.id
        AND project_members.user_id = auth.uid() AND project_members.role IN ('owner', 'editor')))));
CREATE POLICY "Editors can delete code files" ON code_files FOR DELETE
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = code_files.project_id
    AND (projects.owner_id = auth.uid()
      OR EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = projects.id
        AND project_members.user_id = auth.uid() AND project_members.role IN ('owner', 'editor')))));
CREATE POLICY "Admins can manage code files" ON code_files FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- 11. ANNOTATIONS POLICIES
CREATE POLICY "Users can view annotations" ON annotations FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = annotations.project_id
    AND (projects.owner_id = auth.uid() OR projects.is_public = true
      OR EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = projects.id AND project_members.user_id = auth.uid()))));
CREATE POLICY "Editors can create annotations" ON annotations FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = annotations.project_id
    AND (projects.owner_id = auth.uid()
      OR EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = projects.id
        AND project_members.user_id = auth.uid() AND project_members.role IN ('owner', 'editor')))));
CREATE POLICY "Users can update own annotations" ON annotations FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own annotations" ON annotations FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "Owners can delete project annotations" ON annotations FOR DELETE
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = annotations.project_id AND projects.owner_id = auth.uid()));
CREATE POLICY "Admins can manage annotations" ON annotations FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- 12. CHAT_MESSAGES POLICIES
CREATE POLICY "Users can view chat messages" ON chat_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = chat_messages.project_id
    AND (projects.owner_id = auth.uid() OR projects.is_public = true
      OR EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = projects.id AND project_members.user_id = auth.uid()))));
CREATE POLICY "Members can create chat messages" ON chat_messages FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = chat_messages.project_id
    AND (projects.owner_id = auth.uid()
      OR EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = projects.id AND project_members.user_id = auth.uid()))));
CREATE POLICY "Users can update own messages" ON chat_messages FOR UPDATE USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "Admins can manage chat messages" ON chat_messages FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- 13. PROJECT_INVITES POLICIES
CREATE POLICY "Anyone can view invites by token" ON project_invites FOR SELECT USING (true);
CREATE POLICY "Owners can create invites" ON project_invites FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_invites.project_id AND projects.owner_id = auth.uid()));
CREATE POLICY "Owners can delete invites" ON project_invites FOR DELETE
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_invites.project_id AND projects.owner_id = auth.uid()));
CREATE POLICY "Admins can manage invites" ON project_invites FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- SETUP COMPLETE!
```

---

## Support

If you encounter issues:
1. Check the [Supabase Documentation](https://supabase.com/docs)
2. Review the application logs in the browser console
3. Check the Supabase dashboard for database logs and errors

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 27 January 2026 | Initial release with complete schema, RLS policies, and setup instructions |
