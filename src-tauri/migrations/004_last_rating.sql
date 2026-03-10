-- Migration 004: Add last_rating to sub_skill_mastery
-- Stores the most recent rating string (struggled/hard/good/easy) for AI prompt context.
-- Replaces the v1 profile.skills[id].entries[-1].rating field.

ALTER TABLE sub_skill_mastery ADD COLUMN last_rating TEXT;
