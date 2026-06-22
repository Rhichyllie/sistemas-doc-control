import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://pljbbqbfiwctsucektgg.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsamJicWJmaXdjdHN1Y2VrdGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODgzOTIsImV4cCI6MjA5NzM2NDM5Mn0.cSNeI0VpfZKR3mSwlkMl1xib6KP6VX2aNJuYT9hD-Hg";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "analyst" | "viewer";
  created_at: string;
}