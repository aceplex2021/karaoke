# ⚡ Quick Reference - Safe Fix Process

**Print this and keep it handy!**

---

## 🚨 **Before ANY Code Change**

1. **Document Issue** → Use `ISSUE_FIX_TEMPLATE.md`
2. **Map Dependencies** → What could break?
3. **Create Test Plan** → How to verify fix + regression?
4. **Get Approval** → Review and approve approach

---

## 🔧 **Making the Fix**

1. **Create Checkpoint**
   ```powershell
   .\scripts\create-checkpoint.ps1 "Issue description"
   ```

2. **Make Isolated Change**
   - Change ONLY what's needed
   - Don't refactor unrelated code
   - Keep it small and focused

3. **Test Immediately**
   - Build passes: `npm run build`
   - Fix works
   - No errors

4. **Regression Test**
   - Device page works
   - TV page works
   - Cross-device sync works
   - Error handling works

5. **Commit or Rollback**
   - ✅ All tests pass → `git commit`
   - ❌ Any test fails → `git reset --hard checkpoint-tag`

---

## ✅ **Mandatory Regression Checklist**

After EVERY fix, verify:

**Device Page:**
- [ ] Join room → Search → Add → Queue shows song
- [ ] Queue shows only user's songs
- [ ] Remove song works
- [ ] Version selector works

**TV Page:**
- [ ] Video plays
- [ ] Auto-advances to next song
- [ ] Queue shows first 3 songs
- [ ] Controls work

**Cross-Device:**
- [ ] Changes appear on both devices
- [ ] Real-time sync works
- [ ] Multiple users work

**Error Handling:**
- [ ] Network errors handled
- [ ] Invalid states don't crash

---

## 🚨 **Red Flags - STOP**

If you see:
- ❌ Fix requires > 3 files
- ❌ Touches core shared logic
- ❌ Tests reveal side effects
- ❌ Not 100% sure why it works

**Action:** Stop, document, reassess, get approval.

---

## 📚 **Full Documentation**

- **Process:** `DEVELOPMENT_PROCESS.md`
- **Workflow:** `FIX_WORKFLOW.md`
- **Template:** `ISSUE_FIX_TEMPLATE.md`
- **Strategy:** `SAFE_FIX_STRATEGY.md`

---

**Remember:** One issue = One branch = One fix. Test before and after. Checkpoint first.

---

*Last Updated: 2026-01-13*
