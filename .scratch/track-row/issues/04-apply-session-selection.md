# 04 — Apply the ruler selection across every track

**What to build:** From the header, apply silence and apply remove on the current ruler selection bake that span into every loaded track. Same confirm-then-pause rule as today's destructive apply. You do not expand each row and apply twice. Per-track apply in the expanded row still hits that track's own markers only.

**Blocked by:** 03 — Ruler drag selects in session time and marks every track

**Status:** ready-for-agent

- [ ] Header offers apply silence / apply remove for the current session selection when one exists.
- [ ] Confirm, then pause, then bake; cancel is a no-op.
- [ ] Every loaded track is rewritten for the span that lands on it (offset-aware); a span that misses a track is skipped for that track.
- [ ] After a successful apply, the session selection is cleared.
- [ ] Expanded-row apply still affects only that track's markers.
- [ ] Joint apply (nobody-speaking regions) is unchanged.
