import { createClient } from '@supabase/supabase-js';

// Projeto Supabase oficial do Integra (ref: hyphsoqjyrqpbplwcotk).
// Credenciais mantidas inline para blindar contra falhas de leitura do .env no IDE.
const supabaseUrl = "https://hyphsoqjyrqpbplwcotk.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cGhzb3FqeXJxcGJwbHdjb3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MzM5MTcsImV4cCI6MjA5NzMwOTkxN30.8eEVUKB7UHs1ReBZBZSkRePZXxW4TVIStXWTBPv_ngY";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);