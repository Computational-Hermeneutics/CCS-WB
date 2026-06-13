/**
 * Supabase Database Types
 *
 * These types match the schema defined in WORKING.md.
 * When the schema changes, update these types to match.
 *
 * For full type safety, generate types from your Supabase project:
 * npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Annotation types matching the app's LineAnnotationType
export type AnnotationType =
  | "observation"
  | "question"
  | "metaphor"
  | "pattern"
  | "context"
  | "critique";

// Collaborator roles
export type CollaboratorRole = "viewer" | "editor" | "admin";

// Member roles
export type MemberRole = "owner" | "editor" | "viewer";

// Accession status for library workflow
export type AccessionStatus = "draft" | "submitted" | "reviewed" | "approved";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          initials: string | null;
          affiliation: string | null;
          avatar_url: string | null;
          is_admin: boolean;
          profile_color: string | null;
          created_at: string;
          // XP system fields
          xp: number;
          level: number;
          last_daily_login: string | null;
          created_annotations: number;
          created_replies: number;
          created_projects: number;
          library_submissions: number;
          library_approvals: number;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          initials?: string | null;
          affiliation?: string | null;
          avatar_url?: string | null;
          is_admin?: boolean;
          profile_color?: string | null;
          created_at?: string;
          // XP system fields
          xp?: number;
          level?: number;
          last_daily_login?: string | null;
          created_annotations?: number;
          created_replies?: number;
          created_projects?: number;
          library_submissions?: number;
          library_approvals?: number;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          initials?: string | null;
          affiliation?: string | null;
          avatar_url?: string | null;
          is_admin?: boolean;
          profile_color?: string | null;
          created_at?: string;
          // XP system fields
          xp?: number;
          level?: number;
          last_daily_login?: string | null;
          created_annotations?: number;
          created_replies?: number;
          created_projects?: number;
          library_submissions?: number;
          library_approvals?: number;
        };
      };
      projects: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          owner_id: string;
          mode: string;
          session_data: Json | null;
          is_public: boolean;
          accession_status: AccessionStatus;
          submitted_at: string | null;
          reviewed_at: string | null;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          owner_id: string;
          mode?: string;
          session_data?: Json | null;
          is_public?: boolean;
          accession_status?: AccessionStatus;
          submitted_at?: string | null;
          reviewed_at?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          owner_id?: string;
          mode?: string;
          session_data?: Json | null;
          is_public?: boolean;
          accession_status?: AccessionStatus;
          submitted_at?: string | null;
          reviewed_at?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      project_members: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          role: MemberRole;
          joined_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id: string;
          role?: MemberRole;
          joined_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          user_id?: string;
          role?: MemberRole;
          joined_at?: string;
        };
      };
      code_files: {
        Row: {
          id: string;
          project_id: string;
          filename: string;
          language: string | null;
          content: string;
          original_content: string | null;
          uploaded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          filename: string;
          language?: string | null;
          content: string;
          original_content?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          filename?: string;
          language?: string | null;
          content?: string;
          original_content?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      annotations: {
        Row: {
          id: string;
          file_id: string;
          user_id: string | null;
          line_number: number;
          end_line_number: number | null;
          line_content: string | null;
          type: AnnotationType;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          file_id: string;
          user_id?: string | null;
          line_number: number;
          end_line_number?: number | null;
          line_content?: string | null;
          type: AnnotationType;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          file_id?: string;
          user_id?: string | null;
          line_number?: number;
          end_line_number?: number | null;
          line_content?: string | null;
          type?: AnnotationType;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      annotation_replies: {
        Row: {
          id: string;
          annotation_id: string;
          project_id: string;
          user_id: string | null;
          added_by_initials: string | null;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          annotation_id: string;
          project_id: string;
          user_id?: string | null;
          added_by_initials?: string | null;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          annotation_id?: string;
          project_id?: string;
          user_id?: string | null;
          added_by_initials?: string | null;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      chat_messages: {
        Row: {
          id: string;
          project_id: string;
          user_id: string | null;
          content: string;
          is_ai: boolean;
          is_marked: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id?: string | null;
          content: string;
          is_ai?: boolean;
          is_marked?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          user_id?: string | null;
          content?: string;
          is_ai?: boolean;
          is_marked?: boolean;
          created_at?: string;
        };
      };
      project_invites: {
        Row: {
          id: string;
          project_id: string;
          token: string;
          role: "editor" | "viewer";
          created_by: string | null;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          token: string;
          role?: "editor" | "viewer";
          created_by?: string | null;
          created_at?: string;
          expires_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          token?: string;
          role?: "editor" | "viewer";
          created_by?: string | null;
          created_at?: string;
          expires_at?: string;
        };
      };
      project_favorites: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          user_id?: string;
          created_at?: string;
        };
      };
      project_ratings: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          rating: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id: string;
          rating: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          user_id?: string;
          rating?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      xp_transactions: {
        Row: {
          id: string;
          user_id: string;
          action_type: string;
          xp_earned: number;
          reference_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          action_type: string;
          xp_earned: number;
          reference_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          action_type?: string;
          xp_earned?: number;
          reference_id?: string | null;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      annotation_type: AnnotationType;
      collaborator_role: CollaboratorRole;
      accession_status: AccessionStatus;
    };
  };
}

// Convenience types for row data
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectMember = Database["public"]["Tables"]["project_members"]["Row"];
export type CodeFile = Database["public"]["Tables"]["code_files"]["Row"];
export type Annotation = Database["public"]["Tables"]["annotations"]["Row"];
export type AnnotationReply = Database["public"]["Tables"]["annotation_replies"]["Row"];
export type ChatMessage = Database["public"]["Tables"]["chat_messages"]["Row"];
export type ProjectInvite = Database["public"]["Tables"]["project_invites"]["Row"];
export type ProjectFavorite = Database["public"]["Tables"]["project_favorites"]["Row"];
export type ProjectRating = Database["public"]["Tables"]["project_ratings"]["Row"];
export type XPTransaction = Database["public"]["Tables"]["xp_transactions"]["Row"];

// Types for inserting data
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];
export type ProjectMemberInsert = Database["public"]["Tables"]["project_members"]["Insert"];
export type CodeFileInsert = Database["public"]["Tables"]["code_files"]["Insert"];
export type AnnotationInsert = Database["public"]["Tables"]["annotations"]["Insert"];
export type AnnotationReplyInsert = Database["public"]["Tables"]["annotation_replies"]["Insert"];
export type ChatMessageInsert = Database["public"]["Tables"]["chat_messages"]["Insert"];
export type ProjectInviteInsert = Database["public"]["Tables"]["project_invites"]["Insert"];
export type ProjectFavoriteInsert = Database["public"]["Tables"]["project_favorites"]["Insert"];
export type ProjectRatingInsert = Database["public"]["Tables"]["project_ratings"]["Insert"];
export type XPTransactionInsert = Database["public"]["Tables"]["xp_transactions"]["Insert"];

// Extended types with relations
export interface ProjectWithOwner extends Project {
  owner?: Profile;
}

export interface ProjectWithMembers extends Project {
  owner?: Profile;
  members?: (ProjectMember & { user?: Profile })[];
}

export interface AnnotationWithUser extends Annotation {
  user?: Profile;
}

export interface CodeFileWithAnnotations extends CodeFile {
  annotations?: AnnotationWithUser[];
}

export interface ProjectInviteWithProject extends ProjectInvite {
  project?: Project;
}

export interface MemberWithProfile extends ProjectMember {
  profile?: Profile;
}

// Library project with owner info for display
export interface LibraryProject extends Project {
  owner?: Profile;
}

// Library project with engagement statistics
export interface LibraryProjectWithStats extends LibraryProject {
  favorite_count: number;
  is_favorited_by_user: boolean;
  average_rating: number | null;
  rating_count: number;
  user_rating: number | null;
}

// XP action types for gamification
export type XPActionType =
  | "annotation"
  | "reply"
  | "submit"
  | "approved"
  | "favorite_received"
  | "rating_received"
  | "project_created"
  | "daily_login";
