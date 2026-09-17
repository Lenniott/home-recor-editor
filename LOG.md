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
