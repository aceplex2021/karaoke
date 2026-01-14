# 🐛 Issue Fix Template

**Use this template for EACH issue before making any code changes.**

---

## 📋 **Issue #X: [Brief Description]**

### **1. Current Behavior** (What's Broken)
**Steps to Reproduce:**
1. 
2. 
3. 

**What Happens:**
- 

**Screenshots/Logs:**
- 

---

### **2. Expected Behavior** (What Should Happen)
- 

---

### **3. Root Cause Analysis**
**Files Involved:**
- `src/app/.../file.ts` - [what it does]
- `src/lib/.../file.ts` - [what it does]

**Code Sections:**
```typescript
// Line X-Y: [description of problematic code]
```

**Why It's Happening:**
- 

---

### **4. Dependencies & Risk Assessment**
**What Uses This Code:**
- Feature A: [how it uses it]
- Feature B: [how it uses it]

**What Could Break:**
- [ ] Feature X (risk: high/medium/low)
- [ ] Feature Y (risk: high/medium/low)
- [ ] Feature Z (risk: high/medium/low)

**Shared Code:**
- [ ] This code is used by multiple features
- [ ] This is core/shared logic
- [ ] This touches database queries
- [ ] This affects API responses

---

### **5. Proposed Fix**
**What Will Change:**
- File 1: [specific change]
- File 2: [specific change]

**Why This Will Fix It:**
- 

**Risks:**
- Risk 1: [description] - Mitigation: [how to prevent]
- Risk 2: [description] - Mitigation: [how to prevent]

**Alternative Approaches Considered:**
- Option A: [description] - Rejected because: [reason]
- Option B: [description] - Rejected because: [reason]
- **Chosen:** Option C - [why this is best]

---

### **6. Test Plan**

#### **Fix Verification Tests**
- [ ] Test 1: [specific test case]
- [ ] Test 2: [specific test case]
- [ ] Test 3: [edge case]

#### **Regression Tests** (Must Pass)
- [ ] Device page: Queue display works
- [ ] Device page: Search works
- [ ] Device page: Add to queue works
- [ ] Device page: Remove from queue works
- [ ] Device page: Version selector works
- [ ] TV page: Video plays
- [ ] TV page: Queue displays correctly
- [ ] TV page: Controls work
- [ ] Cross-device: Real-time updates work
- [ ] Error handling: Network errors handled
- [ ] Error handling: Invalid states don't crash

#### **Edge Cases**
- [ ] Empty queue
- [ ] Single song in queue
- [ ] Many songs in queue
- [ ] Rapid add/remove actions
- [ ] Network interruption
- [ ] Multiple users

---

### **7. Safety Checkpoint**
```powershell
# Create checkpoint before fix
git checkout -b fix/issue-x-description
git tag -a checkpoint-before-fix-x -m "Checkpoint before fixing [issue description]"
```

**Checkpoint Tag:** `checkpoint-before-fix-x`

---

### **8. Implementation Steps**
1. [ ] Step 1: [description]
2. [ ] Step 2: [description]
3. [ ] Step 3: [description]

**After Each Step:**
- [ ] Build passes
- [ ] No TypeScript errors
- [ ] Quick manual test passes

---

### **9. Post-Fix Verification**
- [ ] Fix works (issue resolved)
- [ ] All regression tests pass
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] Build passes
- [ ] Code review (self-check)

---

### **10. Rollback Plan**
**If Tests Fail:**
```powershell
git reset --hard checkpoint-before-fix-x
```

**If Issue Reoccurs:**
- Document what happened
- Reassess root cause
- Consider alternative approach

---

### **11. Approval**
- [ ] Issue documented
- [ ] Root cause identified
- [ ] Dependencies mapped
- [ ] Test plan created
- [ ] Checkpoint created
- [ ] **APPROVAL TO PROCEED:** ☐ Yes ☐ No

**Approved By:** _______________  
**Date:** _______________

---

## 📝 **Notes**
- 

---

*Template for safe, isolated fixes*
