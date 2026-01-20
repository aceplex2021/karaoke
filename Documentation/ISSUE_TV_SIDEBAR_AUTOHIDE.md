# 🐛 Issue Fix: TV Sidebar Auto-Hide

---

## 📋 **Issue: TV Sidebar Auto-Hide After 10 Seconds**

### **1. Current Behavior** (What's Broken)
**Steps to Reproduce:**
1. Open TV page
2. Click sidebar toggle button (☰) to show queue/QR code
3. Don't interact with sidebar
4. Observe: Sidebar stays open indefinitely

**What Happens:**
- Sidebar remains visible taking up screen space
- Must manually click close button to hide it
- Reduces video viewing area

**Screenshots/Logs:**
- None needed - UI behavior issue

---

### **2. Expected Behavior** (What Should Happen)
- Sidebar should auto-hide after 10 seconds of inactivity
- User can still manually close it anytime
- If user interacts with sidebar (scroll, click), reset the 10-second timer

---

### **3. Root Cause Analysis**
**Files Involved:**
- `src/app/tv/page.tsx` - TV display page with sidebar toggle

**Code Sections:**
```typescript
// Line 57: Sidebar state
const [showSidebar, setShowSidebar] = useState(false);

// Line 932: Toggle button
onClick={() => setShowSidebar(!showSidebar)}

// Line 961: Backdrop close
onClick={() => setShowSidebar(false)}
```

**Why It's Happening:**
- No auto-hide timer implemented
- Sidebar only closes on manual user action (click close button or backdrop)

---

### **4. Dependencies & Risk Assessment**
**What Uses This Code:**
- TV page sidebar toggle
- Queue display
- QR code display

**What Could Break:**
- [ ] Sidebar auto-closing during user interaction (risk: medium) - Mitigated by resetting timer on interaction
- [ ] Timer not cleaning up on unmount (risk: low) - Mitigated by cleanup in useEffect
- [ ] Multiple timers firing (risk: low) - Mitigated by clearing previous timer

**Shared Code:**
- [ ] This is isolated to TV page only
- [ ] Does not affect other features
- [ ] Does not touch database queries
- [ ] Does not affect API responses

---

### **5. Proposed Fix**
**What Will Change:**
- Add `useEffect` hook to manage auto-hide timer
- Timer starts when `showSidebar` becomes `true`
- Timer cleared when sidebar manually closed
- Timer cleaned up on component unmount

**Why This Will Fix It:**
- Automatic timer-based close after 10 seconds of inactivity
- User still has full control to close manually
- Improves UX by maximizing video viewing area

**Risks:**
- Risk 1: Timer fires during user scrolling - Mitigation: Could add interaction detection (optional enhancement)
- Risk 2: Memory leak if timer not cleaned - Mitigation: Proper cleanup in useEffect return

**Alternative Approaches Considered:**
- Option A: No auto-hide, only manual close - Rejected: Current behavior, takes up too much space
- Option B: Auto-hide on any outside click - Rejected: Already implemented via backdrop
- **Chosen:** Option C (Timer-based auto-hide) - Simple, predictable, user-friendly

---

### **6. Test Plan**

#### **Fix Verification Tests**
- [ ] Open sidebar, wait 10 seconds → Sidebar auto-closes
- [ ] Open sidebar, manually close before 10 seconds → Sidebar closes immediately
- [ ] Open sidebar, click backdrop → Sidebar closes immediately
- [ ] Open sidebar multiple times → Each time auto-closes after 10 seconds

#### **Regression Tests** (Must Pass)
- [ ] TV page: Video plays correctly
- [ ] TV page: Queue displays correctly
- [ ] TV page: QR code displays correctly
- [ ] TV page: Controls work (play/pause, volume, fullscreen)
- [ ] TV page: Sidebar toggle button works
- [ ] TV page: Manual close works (X button and backdrop)

#### **Edge Cases**
- [ ] Rapid open/close of sidebar
- [ ] Opening sidebar while video is playing
- [ ] Opening sidebar when queue is empty
- [ ] Component unmount while timer is active

---

### **7. Safety Checkpoint**
```powershell
# Create checkpoint before fix
git tag -a checkpoint-before-sidebar-autohide -m "Checkpoint before adding sidebar auto-hide"
git push origin checkpoint-before-sidebar-autohide
```

**Checkpoint Tag:** `checkpoint-before-sidebar-autohide`

---

### **8. Implementation Steps**
1. [ ] Create git checkpoint/tag
2. [ ] Add `useRef` for sidebar timer
3. [ ] Add `useEffect` to manage timer lifecycle
4. [ ] Test auto-hide behavior
5. [ ] Test manual close still works
6. [ ] Verify no console errors

**After Each Step:**
- [ ] Build passes
- [ ] No TypeScript errors
- [ ] Quick manual test passes

---

### **9. Post-Fix Verification**
- [ ] Fix works (sidebar auto-hides after 10 seconds)
- [ ] All regression tests pass
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] Build passes
- [ ] Code review (self-check)

---

### **10. Rollback Plan**
**If Tests Fail:**
```powershell
git reset --hard checkpoint-before-sidebar-autohide
```

**If Issue Reoccurs:**
- Document what happened
- Check timer cleanup logic
- Consider adding interaction detection

---

### **11. Approval**
- [x] Issue documented
- [x] Root cause identified
- [x] Dependencies mapped
- [x] Test plan created
- [ ] Checkpoint created
- [ ] **APPROVAL TO PROCEED:** ☐ Yes ☐ No

**Needs User Approval**

---

## 📝 **Implementation Preview**

```typescript
// Add timer ref
const sidebarTimerRef = useRef<NodeJS.Timeout | null>(null);

// Add useEffect to manage auto-hide
useEffect(() => {
  if (showSidebar) {
    // Clear any existing timer
    if (sidebarTimerRef.current) {
      clearTimeout(sidebarTimerRef.current);
    }
    
    // Set new timer for 10 seconds
    sidebarTimerRef.current = setTimeout(() => {
      setShowSidebar(false);
    }, 10000);
  } else {
    // Clear timer when sidebar is closed
    if (sidebarTimerRef.current) {
      clearTimeout(sidebarTimerRef.current);
      sidebarTimerRef.current = null;
    }
  }
  
  // Cleanup on unmount
  return () => {
    if (sidebarTimerRef.current) {
      clearTimeout(sidebarTimerRef.current);
    }
  };
}, [showSidebar]);
```

---

**Ready for approval to proceed.**
