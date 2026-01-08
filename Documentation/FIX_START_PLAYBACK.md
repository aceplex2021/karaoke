# Fix: Phase B Database Schema Issues

## Problems
You may be seeing these errors:
1. `Could not find the function public.start_playback(p_entry_id, p_room_id) in the schema cache`
2. `column "current_entry_id" does not exist`
3. `column "last_singer_id" does not exist`

This means Phase B database changes haven't been applied to your Supabase database.

## Solution

### Step 1: Run the Complete Fix Script (Recommended)

1. **Open Supabase Dashboard:**
   - Go to: https://supabase.com/dashboard/project/kddbyrxuvtqgumvndphi
   - Click **SQL Editor** in the left sidebar

2. **Run the complete fix script:**
   - Open `database/fix_all_phase_b.sql` from this project
   - Copy and paste the entire SQL into the editor
   - Click **Run** (or press Ctrl+Enter)
   - You should see verification results showing columns, index, and function

This script will:
- Add `current_entry_id` and `last_singer_id` columns to `kara_rooms`
- Add the foreign key constraint
- Create the partial unique index
- Create/fix the `start_playback` function

### Alternative: Run Individual Fixes

If you prefer to fix issues one at a time:
- For missing columns: Run `database/fix_rooms_columns.sql`
- For missing function: Run `database/fix_start_playback.sql`

### Step 2: Verify Function Exists

After running the script, verify the function exists with correct signature:

```sql
SELECT 
    proname as function_name,
    pg_get_function_arguments(oid) as arguments
FROM pg_proc 
WHERE proname = 'start_playback';
```

You should see:
- `function_name`: `start_playback`
- `arguments`: `p_room_id uuid, p_entry_id uuid`

### Step 3: Restart Backend Server

After creating the function, restart your backend server to refresh the connection:

```bash
# Stop the server (Ctrl+C)
# Then restart
npm run dev:backend
```

## Why This Happens

Supabase's PostgREST layer caches function signatures. If the function was created with parameters in a different order, or doesn't exist, you'll see this error. The fix script ensures the function exists with the correct signature.

## Alternative: Run Full Schema

If you prefer, you can run the entire `database/schema.sql` file, which includes all functions. The fix script is just a targeted solution for this specific function.

