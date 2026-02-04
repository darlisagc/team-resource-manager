-- Migration: Add force_password_change column to users table
-- This migration adds support for forcing users to change their password on first login

-- Add the force_password_change column with default value of 1 (true)
-- New users will be required to change password on first login
ALTER TABLE users ADD COLUMN force_password_change INTEGER DEFAULT 1;

-- Set existing admin user to not require password change
UPDATE users SET force_password_change = 0 WHERE username = 'admin';
