Mon 14 Sep 11:30pm: project-session 01: import restores v2 companion via injected desktop adapter; unreadable sidecar blocks Save
Mon 14 Sep 11:38pm: Import adds a second recording to the open session instead of replacing it
Tue 15 Sep 12:50am: guard first save from clobbering existing sidecar; refuse importing a recording already in the session
Tue 15 Sep 09:01pm: vad-options 01: sileroThresholds helper shared by cleanup detect and transcribe
Tue 15 Sep 09:11pm: playback 02: AudioPlayer constructed with a session; tests isolate playhead from the module singleton
Thu 17 Sep 10:00am: verified wave 1 incomplete then finished waveform 01 and whisper 01; landed wave 2/4 unit seams; e2e and leftover playback still open
Thu 17 Sep 12:20pm: playback/transcript/vad leftovers and Playwright e2e 01-06 plus waveform 05 green; whisper 03 fixture in; whisper 04 skip-script only, engine still external
Thu 17 Sep 12:47pm: conversation transcript groups overlapping host/guest runs by speaker instead of zipping words
Thu 17 Sep 01:02pm: transcript turns ordered by start with clocks; peel late Hi, and split sentences so Glad is not in the intro
Thu 17 Sep 01:17pm: transcript peels opening Hi then host floor then deferred guest reply; Glad to joins you here
Thu 17 Sep 01:24pm: clicking Glad seeks to the post-cut resume (~10.6s) not Whisper's 7.5s stamp
Thu 17 Sep 01:46pm: transcript clocks equal stored word times; transcribe punches amplitude silence so restored Glad/thanks match heard seconds
Thu 17 Sep 02:02pm: removed TDD tickets, delivery briefs, AGENTS.md, and scratch clock wavs
Thu 17 Sep 02:04pm: kept continue/TDD workflow as empty runbook; last-program tickets stay gone
Thu 17 Sep 04:19pm: opened markers/export-session/transcript-search TDD tickets; deferred filter and save history
Thu 17 Sep 04:34pm: unified silence and cut into one marker list; two-lane silence is one v3 record
Thu 17 Sep 04:56pm: markers type-change and drop convert-all; export merge plus stereo default; transcript find bar
Thu 17 Sep 05:06pm: transcript find matches multi-word phrases case-insensitively
Thu 17 Sep 05:17pm: select Cmd-click and Cmd-A, list all marks, Remove/Backspace one undo, type-change on multi-select
Thu 17 Sep 05:36pm: export marks overlap stay two records; Mark uses selected lanes; save/reload; paint silence-cut-export
Thu 17 Sep 05:39pm: runExport clips from export marks; skip empty; never overwrite; nested mute/cut
Thu 17 Sep 05:43pm: File Export dialog all/clips merge stereo; clips disabled at zero export marks
Thu 17 Sep 05:50pm: export dialog writes stem-transcript.txt with audio off; apply-edits drops cut/silence words; clips filter; no txt clobber
Thu 17 Sep 06:12pm: export marks drag like other marks; clip exports write one paragraph transcript txt each
Thu 17 Sep 06:18pm: export marks draw the same start/end ticks as silence and cut
Thu 17 Sep 09:46pm: find next/prev scrolls the transcript pane to the current hit
Thu 17 Sep 10:35pm: scratch tickets dropped continue idle
Thu 17 Sep 10:38pm: transcript-only export hides stereo and merge/separate
Sun 20 Sep 09:46pm: swapped app icon and favicon to the house-and-bars mark
