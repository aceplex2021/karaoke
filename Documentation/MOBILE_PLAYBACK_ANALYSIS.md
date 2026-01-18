# Mobile Playback Analysis: Why Mobile Devices Can't Be Used as Media Players

## Current Implementation Review

### Video Element Configuration
**File**: `src/app/tv/page.tsx` (lines 442-454)

```tsx
<video
  key={`${currentSong?.id || 'no-video'}-${currentSong?.song?.media_url || ''}`}
  ref={videoRef}
  autoPlay
  playsInline
  onEnded={handleEnded}
  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
/>
```

**Current Attributes:**
- ✅ `autoPlay` - Present
- ✅ `playsInline` - Present (required for iOS)
- ❌ `muted` - **MISSING** (critical for mobile autoplay)
- ❌ `webkit-playsinline` - Missing (needed for older iOS versions)

### Autoplay Handling Logic
**File**: `src/app/tv/page.tsx` (lines 294-319)

```typescript
const handleLoadedData = () => {
  setTimeout(() => {
    video.play().then(() => {
      // Success
    }).catch((err: any) => {
      if (err.name === 'NotAllowedError') {
        // Shows user interaction overlay
        setNeedsUserInteraction(true);
      } else {
        // Error - skips to next song
      }
    });
  }, 100);
};
```

**Current Behavior:**
- Attempts to play video after 100ms delay
- Catches `NotAllowedError` and shows overlay
- But video is **NOT muted**, so autoplay will fail on mobile

## Mobile Autoplay Restrictions (2024/2025)

### iOS Safari / WebKit

**Key Restrictions:**
1. **Autoplay with sound is BLOCKED** - Requires user interaction
2. **Autoplay with muted video is ALLOWED** - No user interaction needed
3. **`playsinline` attribute is REQUIRED** - Without it, video goes fullscreen
4. **Low Power Mode disables ALL autoplay** - Even muted videos won't autoplay
5. **Video must be visible** - Hidden or off-screen videos won't autoplay

**What Works:**
```html
<video autoplay muted playsinline>
  <!-- This will autoplay on iOS -->
</video>
```

**What Doesn't Work:**
```html
<video autoplay playsinline>
  <!-- This will NOT autoplay on iOS (has sound) -->
</video>
```

### Android Chrome / Chromium

**Key Restrictions:**
1. **Muted autoplay is ALWAYS allowed** - No restrictions
2. **Autoplay with sound requires:**
   - User interaction (click/touch), OR
   - High Media Engagement Index (MEI) for the site
3. **PWA/Home screen apps** - May have more lenient policies

**What Works:**
```html
<video autoplay muted>
  <!-- This will autoplay on Android -->
</video>
```

**What Doesn't Work:**
```html
<video autoplay>
  <!-- This may NOT autoplay on Android (has sound) -->
</video>
```

## Root Cause Analysis

### Primary Issue: Video Not Muted

**Problem:**
The video element does NOT have the `muted` attribute, which means:
- **iOS Safari**: Autoplay will ALWAYS fail (blocked by policy)
- **Android Chrome**: Autoplay will fail unless user has interacted with site before

**Why This Matters:**
- Mobile browsers block autoplay of videos with sound to prevent unwanted audio
- This is a security/privacy feature to prevent websites from playing audio automatically
- The only way to autoplay on mobile is to mute the video

### Secondary Issues

1. **No Mobile Detection**
   - Code doesn't detect mobile devices
   - Same logic used for desktop and mobile
   - Mobile may need different handling

2. **User Interaction Overlay May Not Be Sufficient**
   - Overlay shows when `NotAllowedError` occurs
   - But on mobile, this happens EVERY time (video not muted)
   - User must tap "Play" for every song, which defeats the purpose of TV mode

3. **No Handling for iOS Low Power Mode**
   - Low Power Mode disables ALL autoplay on iOS
   - No way to detect or work around this
   - User must manually start each video

4. **Video Format/Codec Issues**
   - Mobile devices may not support certain codecs
   - No fallback or error handling for unsupported formats
   - Error just skips to next song without explanation

## Current Flow Analysis

### Desktop Flow (Works)
1. Video loads → `handleLoadedData` fires
2. `video.play()` called → Succeeds (desktop allows autoplay with sound)
3. Video plays automatically ✅

### Mobile Flow (Broken)
1. Video loads → `handleLoadedData` fires
2. `video.play()` called → **Fails with `NotAllowedError`** (mobile blocks autoplay with sound)
3. User interaction overlay appears
4. User must tap "Play" button
5. Video plays after user interaction
6. **Next song**: Process repeats (autoplay fails again) ❌

## Why Mobile Can't Be Used as Media Player

### The Core Problem

**TV Mode is designed for passive playback:**
- Backend controls what plays
- TV page just displays what backend says
- No user interaction expected
- Songs should advance automatically

**Mobile browsers block this:**
- Autoplay with sound is blocked
- Requires user interaction for each video
- Defeats the purpose of "TV mode" (passive playback)

### Specific Blockers

1. **iOS Safari:**
   - Autoplay with sound = BLOCKED
   - Even with user interaction, next song will fail again
   - Low Power Mode = ALL autoplay blocked

2. **Android Chrome:**
   - Autoplay with sound = BLOCKED (unless high MEI)
   - First song might work if user interacted before
   - Subsequent songs will fail

3. **No Workaround:**
   - Can't bypass browser autoplay policies
   - Must either mute video OR require user interaction
   - TV mode needs sound, so muting isn't an option

## Potential Solutions (For Future Consideration)

### Option 1: Mute Video Initially, Unmute After User Interaction
**Pros:**
- Allows autoplay to work
- User can enable sound with one tap

**Cons:**
- First song plays muted (not ideal for karaoke)
- Still requires one user interaction per session

### Option 2: Detect Mobile and Require Initial User Interaction
**Pros:**
- One tap to "start playback session"
- After that, all songs autoplay (if browser allows)

**Cons:**
- May not work on all mobile browsers
- iOS Low Power Mode still blocks everything

### Option 3: Use Web Audio API to Play Sound Separately
**Pros:**
- Video can be muted (autoplay works)
- Audio plays via Web Audio API

**Cons:**
- Complex implementation
- Sync issues between video and audio
- May not work on all devices

### Option 4: Accept Limitation - Mobile Not Supported for TV Mode
**Pros:**
- Honest about limitations
- Focus on desktop/TV browser support

**Cons:**
- Users can't use mobile as TV display
- Need separate mobile app or different approach

## Recommendations

1. **Document the Limitation**
   - Clearly state that mobile devices are not supported for TV mode
   - Explain why (browser autoplay restrictions)
   - Suggest using desktop/TV browser instead

2. **Add Mobile Detection**
   - Detect mobile devices
   - Show helpful message explaining limitation
   - Suggest alternatives (desktop browser, TV browser)

3. **Consider Alternative Approach**
   - If mobile support is critical, consider:
     - Native mobile app (bypasses browser restrictions)
     - Different playback mechanism for mobile
     - Accept muted autoplay with manual unmute

## Files to Review

- `src/app/tv/page.tsx` - Main TV page implementation
- `src/app/tv/page.tsx:442-454` - Video element
- `src/app/tv/page.tsx:294-319` - Autoplay handling
- `src/app/tv/page.tsx:456-499` - User interaction overlay

## Key Takeaways

1. **Mobile browsers block autoplay with sound** - This is by design, not a bug
2. **Current code doesn't mute video** - So autoplay will always fail on mobile
3. **TV mode requires passive playback** - But mobile requires user interaction
4. **These are incompatible** - Mobile can't be used as passive TV display
5. **No code fix can bypass browser policies** - Must work within browser restrictions
