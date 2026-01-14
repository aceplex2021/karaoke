# 🛡️ Development Process - Safe Fix Workflow

**Status:** ✅ **MANDATORY PROCESS - ALWAYS FOLLOW**

This document defines the **mandatory process** for all code changes to prevent regressions and ensure stability.

---

## 🚨 **MANDATORY RULES**

### **Rule 1: No Changes Without Process**
- ❌ **NEVER** make code changes without following this process
- ❌ **NEVER** skip documentation
- ❌ **NEVER** skip testing
- ❌ **NEVER** skip checkpoints

### **Rule 2: One Issue, One Fix**
- ✅ One issue = One branch = One fix
- ✅ Never mix fixes
- ✅ Never "improve" unrelated code
- ✅ Keep changes minimal and focused

### **Rule 3: Test Before & After**
- ✅ Document current behavior first
- ✅ Test the fix works
- ✅ Run regression tests
- ✅ Both must pass

### **Rule 4: Checkpoint First**
- ✅ Create git tag/branch BEFORE any changes
- ✅ Easy rollback if something breaks
- ✅ Never skip this step

---

## 📋 **The Process (Always Follow)**

### **PHASE 1: Planning** (No Code Changes)

#### **Step 1: Document the Issue**
Use `Documentation/ISSUE_FIX_TEMPLATE.md`:
- [ ] What's broken? (with steps to reproduce)
- [ ] What should happen?
- [ ] What files are involved?
- [ ] What could break if we change this?

**Output:** Completed issue template

#### **Step 2: Analyze Dependencies**
- [ ] List all files that need changes
- [ ] List all features that use those files
- [ ] Identify shared/core code
- [ ] Assess risk level (high/medium/low)

**Output:** Dependency map and risk assessment

#### **Step 3: Create Test Plan**
- [ ] How to test the fix works?
- [ ] How to test nothing else broke?
- [ ] What are the edge cases?

**Output:** Test plan with checklist

#### **Step 4: Get Approval**
- [ ] Review approach
- [ ] Confirm it's safe
- [ ] **APPROVAL TO PROCEED** (required)

**Output:** Approval documented

---

### **PHASE 2: Implementation**

#### **Step 5: Create Safety Checkpoint**
```powershell
# Create branch for this specific fix
git checkout -b fix/issue-description

# Create checkpoint tag
git tag -a checkpoint-before-fix -m "Checkpoint before fixing [issue]"
```

**Output:** Branch and checkpoint tag created

#### **Step 6: Make Isolated Change**
- [ ] Change **ONLY** what's needed
- [ ] Don't refactor unrelated code
- [ ] Keep changes **small and focused**
- [ ] Don't "improve" other things

**Output:** Code changes made

#### **Step 7: Test Immediately**
- [ ] Build passes: `npm run build`
- [ ] Fix works (specific issue resolved)
- [ ] No console errors
- [ ] No TypeScript errors

**Output:** Fix verified

#### **Step 8: Regression Test**
Run the **MANDATORY REGRESSION CHECKLIST** (see below)

**Output:** All regression tests pass

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

**Output:** Committed fix or rolled back

---

## ✅ **MANDATORY REGRESSION CHECKLIST**

After **EVERY** fix, verify these still work:

### **Device Page** (Critical Path)
- [ ] Can join room with code
- [ ] Search works and shows results
- [ ] Version selector shows metadata correctly
- [ ] Can add song to queue
- [ ] Queue shows only user's songs
- [ ] Can remove song from queue
- [ ] Toast notifications appear
- [ ] Loading states work
- [ ] Position numbers display correctly

### **TV Page** (Critical Path)
- [ ] Video plays when song is in queue
- [ ] Video URL constructs correctly
- [ ] Auto-advances to next song
- [ ] Queue shows first 3 songs
- [ ] QR code visible and outside video area
- [ ] Play Next button works
- [ ] No Skip button visible
- [ ] Controls overlay works

### **Cross-Device** (Critical Path)
- [ ] Device page polls every 2.5s
- [ ] Changes from device appear on TV
- [ ] Changes from TV appear on device
- [ ] No stale data issues
- [ ] Multiple users can add songs
- [ ] Users can only remove their own songs

### **Error Handling** (Critical Path)
- [ ] Network errors handled gracefully
- [ ] Invalid states don't crash
- [ ] Error toasts appear (not alerts)
- [ ] Can recover from errors

---

## 🚨 **Red Flags - STOP and Reassess**

Stop immediately if:
- ❌ Fix requires changing > 3 files
- ❌ Fix touches core shared logic
- ❌ Tests reveal unexpected side effects
- ❌ You're not 100% sure why it works
- ❌ Fix feels "hacky" or temporary

**Action:** Document the issue, propose alternative approach, get approval before proceeding.

---

## 📚 **Reference Documents**

- **Quick Reference:** `Documentation/FIX_WORKFLOW.md`
- **Detailed Strategy:** `Documentation/SAFE_FIX_STRATEGY.md`
- **Issue Template:** `Documentation/ISSUE_FIX_TEMPLATE.md`
- **Testing Checklist:** `Documentation/PHASE2_TESTING_CHECKLIST.md`

---

## 🛠️ **Helper Scripts**

### **Create Checkpoint** (PowerShell)
```powershell
# scripts/create-checkpoint.ps1
param(
    [Parameter(Mandatory=$true)]
    [string]$IssueDescription
)

$branchName = "fix/$($IssueDescription.ToLower().Replace(' ', '-'))"
$tagName = "checkpoint-$($IssueDescription.ToLower().Replace(' ', '-'))"

git checkout -b $branchName
git tag -a $tagName -m "Checkpoint before fixing: $IssueDescription"

Write-Host "✅ Created branch: $branchName"
Write-Host "✅ Created checkpoint tag: $tagName"
```

**Usage:**
```powershell
.\scripts\create-checkpoint.ps1 "Remove button color"
```

---

## 📊 **Process Enforcement**

### **Pre-Commit Checklist**
Before committing any fix:
- [ ] Issue documented (template completed)
- [ ] Dependencies mapped
- [ ] Test plan created
- [ ] Approval obtained
- [ ] Checkpoint created
- [ ] Fix verified
- [ ] Regression tests passed
- [ ] Ready to commit

### **Code Review Checklist**
When reviewing fixes:
- [ ] Process was followed
- [ ] Issue template completed
- [ ] Tests documented
- [ ] Regression tests passed
- [ ] Code is clean
- [ ] No unrelated changes

---

## 🎯 **Quick Start**

1. **Found an issue?**
   → Open `Documentation/ISSUE_FIX_TEMPLATE.md`
   → Fill it out completely
   → Get approval

2. **Ready to fix?**
   → Create checkpoint: `.\scripts\create-checkpoint.ps1 "issue description"`
   → Make isolated change
   → Test fix + regression
   → Commit or rollback

3. **Not sure?**
   → Review `Documentation/SAFE_FIX_STRATEGY.md`
   → Check `Documentation/FIX_WORKFLOW.md`
   → Ask before proceeding

---

## 📝 **Process History**

- **2026-01-13:** Process established after Phase II completion
- **Rationale:** Prevent regressions when fixing issues
- **Status:** Mandatory for all future fixes

---

## ⚠️ **Important Notes**

- This process is **mandatory**, not optional
- Skipping steps increases risk of breaking working features
- When in doubt, follow the process
- Better to be thorough than to break things

---

**Last Updated:** 2026-01-13  
**Status:** ✅ **ACTIVE - MANDATORY PROCESS**
