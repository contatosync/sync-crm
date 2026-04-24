import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  'https://tsluxdsckwzvcnjwzelu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzbHV4ZHNja3d6dmNuand6ZWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzODAxNDksImV4cCI6MjA5MTk1NjE0OX0.ZJyreDvUZKpk2WqVPeauowiFbO3GIwxpu89EXhe-4Nc'
)
