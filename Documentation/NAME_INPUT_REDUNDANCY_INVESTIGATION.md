# Name Input Redundancy Investigation
**Date**: 2026-01-24  
**Issue**: App asks for user name multiple times when joining rooms  
**Status**: Root causes identified

---

## Summary

Users are being asked to enter their name **multiple times** when joining rooms:
- **Android**: Name entered on join page → App asks again on room page (1 redundant prompt)
- **iOS/Computer**: Name entered on join page → App asks 2 more times on room page (2 redundant prompts)

---

## Root Cause Analysis

### Issue 1: localStorage Key Mismatch

**Join Page** (`src/app/join/page.tsx`):
- Line 83: Stores name as `user_name` in localStorage
  ```typescript
  localStorage.setItem('user_name', userName);
  ```
- Line 87: Navigates to room page (does NOT call join API)

**Room Page** (`src/app/room/[code]/page.tsx`):
- Line 861: Looks for `user_display_name` in localStorage
  ```typescript
  const storedName = localStorage.getItem('user_display_name');
  ```
- Line 870: Checks if `storedName` exists to auto-join
- **Problem**: Join page stores as `user_name`, but room page looks for `user_display_name`
- **Result**: `storedName` is always `null` → Always shows name input modal

### Issue 2: Join Page Doesn't Call API

**Current Flow:**
```
1. User enters name on /join page
2. Join page stores name as "user_name" in localStorage
3. Join page navigates to /room/{code} (NO API CALL)
4. Room page loads, looks for "user_display_name" (NOT FOUND)
5. Room page shows NameInputModal
6. User enters name again
7. handleNameConfirm stores as "user_display_name" and calls joinRoom()
```

**Why This Design?**
- Join page is just a form - doesn't actually join
- Room page handles the actual join logic
- But this creates redundant name collection

### Issue 3: NameInputModal Shows Even When Name Exists

**Room Page Logic** (lines 858-880):
```typescript
const storedName = localStorage.getItem('user_display_name');
const alreadyInThisRoom = storedRoomCode?.toUpperCase() === code.toUpperCase();

if (storedName && (userRole === 'host' || alreadyInThisRoom)) {
  // Auto-join
  joinRoom(storedName);
} else {
  // Show name input
  setShowNameInput(true);
}
```

**Problem**: 
- If user came from `/join` page, `storedName` is null (key mismatch)
- `alreadyInThisRoom` is false (user hasn't joined yet)
- So it always shows the modal

### Issue 4: iOS-Specific Double Prompt

**Potential Causes:**
1. **React Strict Mode**: In development, React renders components twice, which could cause useEffect to run twice
2. **Multiple useEffect Triggers**: The useEffect at line 858 might be triggered multiple times
3. **State Updates**: If `showNameInput` state changes multiple times, modal could appear/disappear/reappear

**Evidence Needed:**
- Check if `useEffect` dependencies cause re-runs
- Check if React Strict Mode is enabled
- Check if there are multiple instances of the component mounting

---

## Current Flow Analysis

### Android Flow (Expected vs Actual)

**Expected:**
```
1. User goes to /join
2. Enters room code + name
3. Clicks "Join Room"
4. App calls join API with name
5. User is in room ✅
```

**Actual:**
```
1. User goes to /join
2. Enters room code + name
3. Clicks "Join Room"
4. App stores name as "user_name" (wrong key!)
5. Navigates to /room/{code}
6. Room page looks for "user_display_name" (not found)
7. Shows NameInputModal ❌ (1st redundant prompt)
8. User enters name again
9. App calls join API
10. User is in room ✅
```

### iOS/Computer Flow (Expected vs Actual)

**Expected:**
```
1. User goes to /join
2. Enters room code + name
3. Clicks "Join Room"
4. App calls join API with name
5. User is in room ✅
```

**Actual:**
```
1. User goes to /join
2. Enters room code + name
3. Clicks "Join Room"
4. App stores name as "user_name" (wrong key!)
5. Navigates to /room/{code}
6. Room page looks for "user_display_name" (not found)
7. Shows NameInputModal ❌ (1st redundant prompt)
8. User enters name
9. handleNameConfirm called
10. ??? Something causes modal to show again ❌ (2nd redundant prompt)
11. User enters name again
12. App calls join API
13. User is in room ✅
```

---

## Why This Design Exists

### Historical Context

1. **Join Page** (`/join`): Originally just a form to collect room code and name
   - Doesn't actually join - just navigates
   - Designed for simplicity

2. **Room Page** (`/room/[code]`): Handles actual join logic
   - Calls join API
   - Manages room state
   - Shows approval queue if needed

3. **NameInputModal**: Fallback for direct room access
   - If user navigates directly to `/room/ABC123` (without going through `/join`)
   - Modal ensures name is collected before joining

### The Problem

The design assumes:
- Users might access `/room/{code}` directly (bypassing `/join`)
- So room page always checks for name

But in practice:
- Most users go through `/join` page first
- They already provided name, but it's stored with wrong key
- Room page doesn't find it, shows modal again

---

## Files Involved

1. **`src/app/join/page.tsx`**
   - Line 83: Stores name as `user_name` (should be `user_display_name`)
   - Line 87: Navigates to room (doesn't call API)

2. **`src/app/room/[code]/page.tsx`**
   - Line 861: Looks for `user_display_name` (mismatch with join page)
   - Line 870: Auto-join logic (doesn't work because of key mismatch)
   - Line 877: Shows NameInputModal
   - Line 848-855: `handleNameConfirm` stores name and calls join

3. **`src/app/api/rooms/join/route.ts`**
   - Line 14: Accepts `display_name` in request
   - Line 67: Updates user's display_name
   - Line 76: Creates user with display_name

---

## localStorage Keys Used

| Key | Set By | Read By | Purpose |
|-----|--------|---------|---------|
| `user_name` | `/join` page (line 83) | ❌ Nothing reads this | **UNUSED** - Wrong key! |
| `user_display_name` | Room page (line 850), Join API response (line 812) | Room page (line 861) | Actual name storage |
| `current_room_code` | Room page (line 817) | Join page (line 26), Room page (line 862) | Track current room |
| `current_room_id` | Room page (line 816) | Various | Track current room ID |
| `user_id` | Room page (line 818) | Various | Track user ID |
| `user_role` | Room page (line 819) | Room page (line 860) | Track if user is host |

---

## Why iOS Has 2 Prompts (Hypothesis)

**Possible Causes:**

1. **React Strict Mode Double Render** ⚠️ **LIKELY CAUSE**
   - Next.js enables React Strict Mode in development by default
   - React 18 Strict Mode renders components twice to detect side effects
   - useEffect runs twice → modal shows twice
   - **Evidence**: `src/app/share-target/page.tsx` has a guard for this (line 33)
   - **Room page has NO guard** → Double execution in development

2. **useEffect Dependency Issue**
   - Line 899: `useEffect(..., [code, joinRoom])`
   - `joinRoom` is a `useCallback` (line 780)
   - If `joinRoom` dependencies change, function reference changes
   - useEffect sees new `joinRoom` reference → re-runs
   - Could cause modal to show/hide/show again

3. **State Race Condition**
   - `showNameInput` set to `true` (line 877)
   - Modal renders
   - useEffect runs again (Strict Mode or dependency change)
   - Modal state persists → shows again

4. **Component Re-mount**
   - If room page component unmounts/remounts
   - useEffect runs again
   - Modal shows again

**Evidence Found:**
- `share-target/page.tsx` has guard: `hasProcessedRef.current` to prevent double execution
- Room page has NO such guard
- Next.js likely has Strict Mode enabled in development
- Production might not have this issue (Strict Mode disabled)

**iOS vs Android Difference:**
- iOS might trigger more re-renders or have different React behavior
- Or iOS users are testing in development mode (Strict Mode active)
- Android users might be in production mode (Strict Mode disabled)

---

## Impact Assessment

### User Experience

**Android:**
- User enters name once on join page
- App asks again on room page
- **Frustration**: "I already entered my name!"

**iOS/Computer:**
- User enters name once on join page
- App asks again (1st time)
- App asks again (2nd time)
- **High Frustration**: "Why does it keep asking?!"

### Business Impact

- Users call support for instructions (as mentioned)
- Poor first impression
- Users might abandon the app
- Support burden increases

---

## Recommended Fixes

### Fix 1: Unify localStorage Key (Critical - Fixes Android Issue)

**Change Join Page:**
```typescript
// Line 83: Change from
localStorage.setItem('user_name', userName);
// To
localStorage.setItem('user_display_name', userName);
```

**Result**: Room page will find the name and auto-join (no redundant prompt for Android)

**Why This Works:**
- Join page stores name with correct key
- Room page finds it (line 861)
- Auto-join logic works (line 870)
- No modal shown ✅

### Fix 2: Pass Name via URL or Call API from Join Page

**Option A: Pass via URL**
```typescript
// Join page
router.push(`/room/${roomCode.toUpperCase()}?name=${encodeURIComponent(userName)}`);

// Room page
const searchParams = useSearchParams();
const nameFromUrl = searchParams.get('name');
if (nameFromUrl) {
  localStorage.setItem('user_display_name', nameFromUrl);
  // Auto-join
}
```

**Option B: Call API from Join Page**
```typescript
// Join page - actually join before navigating
const fingerprint = getOrCreateFingerprint();
await api.joinRoom({
  room_code: roomCode.toUpperCase(),
  user_fingerprint: fingerprint,
  display_name: userName,
});
// Then navigate
router.push(`/room/${roomCode.toUpperCase()}`);
```

### Fix 3: Check Both Keys (Backward Compatibility)

**Room Page:**
```typescript
// Check both keys for backward compatibility
const storedName = localStorage.getItem('user_display_name') 
  || localStorage.getItem('user_name'); // Fallback to old key
```

### Fix 4: Prevent Double Modal (iOS - React Strict Mode Guard)

**Add Guard (Similar to share-target page):**
```typescript
const hasCheckedNameRef = useRef(false);

useEffect(() => {
  if (code && !hasCheckedNameRef.current) {
    hasCheckedNameRef.current = true; // Prevent double execution
    
    const userRole = localStorage.getItem('user_role');
    const storedName = localStorage.getItem('user_display_name') 
      || localStorage.getItem('user_name'); // Check both keys
    const storedRoomCode = localStorage.getItem('current_room_code');
    
    const alreadyInThisRoom = storedRoomCode?.toUpperCase() === code.toUpperCase();
    
    if (storedName && (userRole === 'host' || alreadyInThisRoom)) {
      joinRoom(storedName);
    } else {
      setShowNameInput(true);
    }
  }
}, [code, joinRoom]);
```

**Why This Works:**
- `useRef` persists across re-renders
- Prevents useEffect from running twice (React Strict Mode)
- Similar pattern used in `share-target/page.tsx` (proven to work)

---

## Files to Modify

1. **`src/app/join/page.tsx`**
   - Line 83: Change `user_name` → `user_display_name`
   - OR: Call join API before navigating
   - OR: Pass name via URL

2. **`src/app/room/[code]/page.tsx`**
   - Line 861: Check both keys (backward compatibility)
   - Line 858-880: Add guard to prevent double modal
   - Consider: Remove name input if name already provided

---

## Testing Checklist

After fixes:
- [ ] Android: Enter name on join page → Should auto-join (no modal)
- [ ] iOS: Enter name on join page → Should auto-join (no modal)
- [ ] Direct access: Navigate to `/room/ABC123` directly → Should show modal (expected)
- [ ] Returning user: Leave room, rejoin same room → Should auto-join
- [ ] Different room: Join Room A, then Room B → Should show modal for Room B (expected)

---

## Notes

- The join page was designed as a simple form, not an actual join endpoint
- Room page was designed to handle all join logic
- This separation causes the redundancy
- **Primary Issue**: localStorage key mismatch (`user_name` vs `user_display_name`)
- **Secondary Issue**: No guard against React Strict Mode double execution (iOS double-prompt)
- The design assumes users might access `/room/{code}` directly, but most go through `/join` first
- Fix 1 (unify key) will fix Android issue
- Fix 1 + Fix 4 (add guard) will fix iOS double-prompt issue
