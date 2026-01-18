# Channel Sources Management

## Overview

The `channelSources.md` file is now the **single source of truth** for Vietnamese mixer/channel names. The parser will automatically load and use these names.

## How It Works

1. **You edit** `channelSources.md` (add/remove mixer names)
2. **Parser automatically**:
   - Loads all names from the file
   - Generates accent variants (e.g., `Trọng Hiếu` → `Trong Hieu`)
   - Uses them for channel detection

## Adding New Mixers

Just add the name to `channelSources.md` (one per line):

```markdown
Trọng Hiếu
Kim Quy
King Sing
Your New Mixer Name  ← Add here
```

**Best Practices:**
- ✅ Use Vietnamese accents (the code will auto-generate unaccented variants)
- ✅ Use proper capitalization
- ✅ One name per line
- ✅ No need to add both accented and unaccented versions (automatic)

**Example:**
```
# Good - just add the proper Vietnamese name
Công Trình

# Bad - don't add both variants manually
Công Trình
Cong Trinh  ← Don't do this, it's automatic
```

## Testing After Changes

After editing `channelSources.md`, test that it loads correctly:

```powershell
cd Controller
node test-mixer-loading.js
```

This will show:
- How many mixer names were loaded
- All variants (original + auto-generated)

## Why This is Better

**Before:**
- ❌ Had to edit `rules-enhanced.js` code
- ❌ Had to manually add both accented and unaccented versions
- ❌ Easy to forget variants or make typos

**Now:**
- ✅ Edit simple markdown file
- ✅ Auto-generates accent variants
- ✅ No code changes needed
- ✅ Easy to maintain

## Implementation Details

The code in `rules-enhanced.js` now:
1. Reads `channelSources.md` at startup
2. Parses each line as a mixer name
3. Auto-generates Vietnamese accent variants using a comprehensive character map
4. Exports all variants as `MIXER_NAMES`

### Auto-Generated Variants

The system automatically generates unaccented variants for Vietnamese characters:

| Original | Variants Generated |
|----------|-------------------|
| `Trọng Hiếu` | `Trong Hieu` |
| `Công Trình` | `Cong Trinh` |
| `Đại Nghiệp` | `Dai Nghiep` |
| `Nhật Nguyễn` | `Nhat Nguyen` |

This ensures the parser can match mixer names whether they appear with or without accents in filenames.

## Current Mixer List

See `channelSources.md` for the current list (17 mixers as of now).
