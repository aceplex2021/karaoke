# Issue: Secondary playhead seek thrash (1↔3 loop)

**Date:** 2026-11-27  
**Status:** Fixed (forward-only seek)

## Logs (follow-up)
- Bootstrap hub 32.1s OK, then thrash: `from 63 → to 60.3` forever
- Hub playhead **frozen** at 60.3 while secondary free-runs ahead

## Cause
Backward seeks to a stuck/lagging primary packet.

## Fix
- Ignore playhead packets older than 2s (`wallMs`)
- Extrapolate fresh packets by age
- **Seek forward only** when secondary is behind; never yank backward
- SW passthrough (no fetch interception)
