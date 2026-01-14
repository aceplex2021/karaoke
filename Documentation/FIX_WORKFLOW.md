# 🔧 Safe Fix Workflow - Quick Reference

**Goal:** Fix issues without breaking working features  
**Status:** ⏳ **NO CODE CHANGES UNTIL APPROVED**

---

## 🚨 **GOLDEN RULES**

1. **ONE ISSUE = ONE BRANCH = ONE FIX**
   - Never mix fixes
   - Never "improve" unrelated code
   - Keep changes minimal

2. **TEST IMMEDIATELY**
   - Don't accumulate changes
   - Test after each small change
   - Catch issues early

3. **CHECKPOINT FIRST**
   - Create git tag/branch BEFORE any changes
   - Easy rollback if something breaks

4. **REGRESSION TEST ALWAYS**
   - Fix must work
   - Nothing else must break
   - Both must be true

---

## 📋 **Step-by-Step Process**

### **BEFORE ANY CODE CHANGES**

#### **Step 1: Document the Issue**
Use `Documentation/ISSUE_FIX_TEMPLATE.md`:
- [ ] What's broken? (with steps to reproduce)
- [ ] What should happen?
- [ ] What files are involved?
- [ ] What could break if we change this?

#### **Step 2: Analyze Dependencies**
- [ ] List all files that need changes
- [ ] List all features that use those files
- [ ] Identify shared/core code
- [ ] Assess risk level (high/medium/low)

#### **Step 3: Create Test Plan**
- [ ] How to test the fix works?
- [ ] How to test nothing else broke?
- [ ] What are the edge cases?

#### **Step 4: Get Approval**
- [ ] Review with team/self
- [ ] Confirm approach is safe
- [ ] **APPROVAL TO PROCEED**

---

### **MAKING THE FIX**

#### **Step 5: Create Safety Checkpoint**
```powershell
# Create branch for this specific fix
git checkout -b fix/issue-description

# Create checkpoint tag
git tag -a checkpoint-before-fix -m "Checkpoint before fixing [issue]"
```

#### **Step 6: Make Isolated Change**
- Change **ONLY** what's needed
- Don't refactor unrelated code
- Keep changes **small and focused**
- Don't "improve" other things

#### **Step 7: Test Immediately**
- [ ] Build passes: `npm run build`
- [ ] Fix works (specific issue resolved)
- [ ] No console errors
- [ ] No TypeScript errors

#### **Step 8: Regression Test**
Run this checklist **EVERY TIME**:

**Device Page:**
- [ ] Can join room
- [ ] Search works
- [ ] Version selector works
- [ ] Add to queue works
- [ ] Queue shows user's songs only
- [ ] Remove from queue works
- [ ] Toast notifications appear
- [ ] Loading states work

**TV Page:**
- [ ] Video plays
- [ ] Queue shows first 3 songs
- [ ] QR code visible (outside video)
- [ ] Play Next button works
- [ ] Controls work

**Cross-Device:**
- [ ] Real-time updates work
- [ ] Changes reflect across devices
- [ ] Multiple users work correctly

#### **Step 9: Commit or Rollback**
**If ALL tests pass:**
```powershell
git add -A
git commit -m "Fix: [issue description]

- What was fixed
- How it was fixed
- What was tested"
```

**If ANY test fails:**
```powershell
# Rollback immediately
git reset --hard checkpoint-before-fix

# Document what broke
# Reassess approach
# Get new approval before trying again
```

---

## 🎯 **Example: Fixing a Simple Issue**

### **Issue:** Button color is wrong

#### **Step 1: Document**
- **What's broken:** Remove button is blue, should be red
- **Files:** `src/app/room/[code]/page.tsx` (line 1205)
- **Risk:** Low (only affects button styling)

#### **Step 2: Dependencies**
- **Uses:** Button component
- **Used by:** Remove functionality (but styling doesn't affect logic)
- **Risk:** Very low

#### **Step 3: Test Plan**
- Fix: Change button background color
- Test: Button is red
- Regression: Remove functionality still works

#### **Step 4: Approval**
✅ Safe to proceed (low risk, isolated change)

#### **Step 5: Checkpoint**
```powershell
git checkout -b fix/remove-button-color
git tag -a checkpoint-remove-button-color
```

#### **Step 6: Change**
```typescript
// Change one line
background: '#dc3545', // was: '#0070f3'
```

#### **Step 7: Test**
- [ ] Build passes ✅
- [ ] Button is red ✅
- [ ] Remove still works ✅

#### **Step 8: Regression**
- [ ] All device page tests pass ✅
- [ ] All TV page tests pass ✅

#### **Step 9: Commit**
```powershell
git commit -m "Fix: Remove button color (blue → red)"
```

**Result:** ✅ Fix complete, nothing broken

---

## 🚨 **Red Flags - STOP and Reassess**

Stop immediately if:
- ❌ Fix requires changing > 3 files
- ❌ Fix touches core shared logic
- ❌ Tests reveal unexpected side effects
- ❌ You're not 100% sure why it works
- ❌ Fix feels "hacky" or temporary

**Action:** Document, propose alternatives, get approval.

---

## 📊 **Regression Test Checklist** (Copy for Each Fix)

After **EVERY** fix, check these:

### **Critical Paths** (Must Work)
- [ ] Device: Join room → Search → Add song → Song appears in queue
- [ ] Device: Queue shows user's songs → Remove song → Song disappears
- [ ] TV: Video plays → Song ends → Next song plays
- [ ] Cross-device: Device adds song → TV shows song within 2.5s

### **UI Elements** (Must Work)
- [ ] Toast notifications appear and dismiss
- [ ] Loading states show during operations
- [ ] Version selector displays metadata correctly
- [ ] Buttons are clickable and work
- [ ] Modals open and close correctly

### **Error Handling** (Must Work)
- [ ] Network errors show toast (not crash)
- [ ] Invalid actions show error (not crash)
- [ ] Can recover from errors

---

## 💡 **Pro Tips**

1. **Start Small**
   - Fix the smallest possible change first
   - Verify it works
   - Then make next small change

2. **Test Frequently**
   - Don't wait until "everything is done"
   - Test after each logical unit of change
   - Catch issues early

3. **Document As You Go**
   - Note what you changed
   - Note why you changed it
   - Note what you tested

4. **When in Doubt, Ask**
   - If unsure, document the issue
   - Propose the approach
   - Get approval before proceeding

---

## 🎯 **Next Steps**

1. **List Your Issues**
   - What specific issues are you seeing?
   - What's the priority of each?

2. **We'll Create Fix Plans**
   - One template per issue
   - Dependencies mapped
   - Test plans created
   - Risk assessment done

3. **Get Approval**
   - Review each plan
   - Approve or request changes
   - Only then make code changes

4. **Fix One at a Time**
   - Follow the workflow
   - Test thoroughly
   - Commit or rollback

---

**Status:** ⏳ **WAITING FOR ISSUE LIST**

Please provide:
1. List of issues (what's broken)
2. Priority/severity
3. Any patterns (are they related?)

Then we'll create specific fix plans following this safe workflow.

---

*Last Updated: 2026-01-13*  
*Workflow: Safe Fix Process - No Changes Until Approved*
