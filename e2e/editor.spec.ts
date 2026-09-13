import { test, expect, type Page } from '@playwright/test';

async function seed(page: Page) {
  await page.addInitScript(() => {
    let callback = 0;
    Object.assign(window, { __TAURI_INTERNALS__: {
      transformCallback: () => ++callback,
      invoke: async (cmd: string) => cmd === 'transcription_model_status' ? true : 1,
    } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Transcribe all tracks', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const { editor } = await import(performance.getEntriesByType('resource').map(r => r.name).find(name => name.includes('/src/lib/editor.svelte.ts')) ?? '/src/lib/editor.svelte.ts');
    const rate = 16000, duration = 30;
    const audio = (frequency: number) => {
      const buffer = new AudioBuffer({ length: rate * duration, sampleRate: rate, numberOfChannels: 1 });
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(i * frequency / rate) * .55 * Math.max(0, Math.sin(i / rate * 2));
      return buffer;
    };
    const host = audio(220), guest = audio(330);
    editor.loadAudio(host, 'Alex.wav', host.getChannelData(0));
    editor.setSpeaker(editor.tracks[0], 'Alex');
    editor.setTranscript([{text:'Welcome',start:1,end:1.5},{text:'to',start:1.6,end:1.8},{text:'the podcast.',start:1.9,end:2.8},{text:'How was your week?',start:5,end:6.5}], 'complete');
    editor.addTrack(guest, 'Sam.wav', guest.getChannelData(0));
    editor.setSpeaker(editor.tracks[1], 'Sam');
    editor.setTranscript([{text:'Thanks for having me.',start:3,end:4.5},{text:'Really good!',start:6,end:7.5}], 'complete');
    editor.setActiveTrack(editor.tracks[0].id);
  });
  await expect(page.locator('[data-track-lane]')).toHaveCount(2);
}

test('one-lane selection, cross-lane selection, and pending cuts', async ({ page }) => {
  await seed(page);
  const canvases = page.locator('[data-track-lane] canvas');
  const a = (await canvases.nth(0).boundingBox())!, b = (await canvases.nth(1).boundingBox())!;
  await page.mouse.move(a.x + a.width * .3, a.y + a.height * .5);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width * .45, a.y + a.height * .5, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Mark M', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Mark M', exact: true }).click();
  expect(await page.evaluate(async () => (await import(performance.getEntriesByType('resource').map(r => r.name).find(name => name.includes('/src/lib/editor.svelte.ts')) ?? '/src/lib/editor.svelte.ts')).editor.tracks.map(t => t.rawMarkers.length))).toEqual([1, 0]);
  await page.mouse.move(a.x + a.width * .6, a.y + a.height * .5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * .75, b.y + b.height * .5, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Mark M', exact: true })).toBeEnabled();
  await page.getByLabel('Marker action').selectOption('cut');
  await page.getByRole('button', { name: 'Mark M', exact: true }).click();
  expect(await page.evaluate(async () => (await import(performance.getEntriesByType('resource').map(r => r.name).find(name => name.includes('/src/lib/editor.svelte.ts')) ?? '/src/lib/editor.svelte.ts')).editor.displayKeptDuration)).toBe(30);
  await expect(page.locator('.mark.cut')).toHaveCount(1);
  await page.screenshot({ path: '/tmp/hre-editor-default.png' });
  await page.getByRole('button', { name: 'Preview edits', exact: true }).click();
  expect(await page.evaluate(async () => (await import(performance.getEntriesByType('resource').map(r => r.name).find(name => name.includes('/src/lib/editor.svelte.ts')) ?? '/src/lib/editor.svelte.ts')).editor.displayKeptDuration)).toBeLessThan(30);
});

test('merged text selection seeks, updates immediately, and layout fits minimum size', async ({ page }) => {
  await seed(page);
  await page.locator('[data-word="4"]').click();
  expect(await page.evaluate(async () => (await import(performance.getEntriesByType('resource').map(r => r.name).find(name => name.includes('/src/lib/editor.svelte.ts')) ?? '/src/lib/editor.svelte.ts')).editor.playheadSec)).toBe(5);
  const first = page.locator('[data-word="0"]'), last = page.locator('[data-word="3"]');
  const a = (await first.boundingBox())!, b = (await last.boundingBox())!;
  await page.mouse.move(a.x + 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 2, b.y + b.height / 2, { steps: 12 });
  await expect(page.getByRole('button', { name: 'Mark M', exact: true })).toBeEnabled();
  await page.mouse.up();
  await page.setViewportSize({ width: 860, height: 560 });
  await expect(page.locator('aside')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Mark M', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  const actionBox = (await page.locator('.selection-bar').boundingBox())!;
  const lastLane = (await page.locator('[data-track-lane] canvas').last().boundingBox())!;
  expect(lastLane.y + lastLane.height).toBeLessThanOrEqual(actionBox.y);
  await page.getByLabel('Marker action').selectOption('cut');
  await page.getByRole('button', { name: 'Mark M', exact: true }).click();
  await expect(page.locator('.mark.cut')).toHaveCount(1);
  await page.screenshot({ path: '/tmp/hre-editor-minimum.png' });
});

test('export samples match the Web Audio preview at silence and cut boundaries', async ({ page }) => {
  await seed(page);
  const difference = await page.evaluate(async () => {
    const { renderEdited } = await import('/src/lib/audio/applyEdits.ts');
    const { buildPlaybackPlan } = await import('/src/lib/audio/playbackPlan.ts');
    const { visibleSpans } = await import('/src/lib/audio/timelineMap.ts');
    const rate = 16000, source = new Float32Array(rate * 2).fill(.8);
    const cuts = [{start:.8,end:1.1}], muted = [{start:.4,end:.9}];
    const exported = renderEdited([source], rate, muted, cuts)[0];
    const context = new OfflineAudioContext(1, exported.length, rate);
    const buffer = context.createBuffer(1, source.length, rate); buffer.copyToChannel(source,0);
    const plan = buildPlaybackPlan(visibleSpans(2,cuts,"hideMarked"), 0,2,[{mutedIntervals:muted}]);
    const gain = context.createGain(); gain.connect(context.destination);
    for (const event of plan.tracks[0].gainEvents) gain.gain.linearRampToValueAtTime(event.value,event.time);
    for (const chunk of plan.chunks) {
      const node = context.createBufferSource(); node.buffer = buffer; node.connect(gain);
      node.start(chunk.playAt,chunk.sourceStart,chunk.sourceEnd-chunk.sourceStart);
    }
    const preview = (await context.startRendering()).getChannelData(0);
    return Math.max(...preview.map((sample,i) => Math.abs(sample-exported[i])));
  });
  expect(difference).toBeLessThan(.00001);
});

test('long transcript selection stays responsive', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const { editor } = await import(performance.getEntriesByType('resource').map(r => r.name).find(name => name.includes('/src/lib/editor.svelte.ts')) ?? '/src/lib/editor.svelte.ts');
    editor.tracks[0].transcriptWords = Array.from({length:5000}, (_,i) => ({text:'word'+i,start:i*.005,end:i*.005+.004}));
    editor.tracks[1].transcriptWords = [];
  });
  await expect(page.locator('[data-word]')).toHaveCount(5000);
  const elapsed = await page.evaluate(async () => {
    const first = document.querySelector('[data-word="0"]')!.firstChild!;
    const last = document.querySelector('[data-word="20"]')!.firstChild!;
    const start = performance.now();
    window.getSelection()!.setBaseAndExtent(first,1,last,2);
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise(requestAnimationFrame);
    return performance.now() - start;
  });
  await expect(page.getByRole('button', {name:'Mark M',exact:true})).toBeEnabled();
  expect(elapsed).toBeLessThan(500);
});

test('Cmd zoom and cut handles use the shared timeline', async ({ page }) => {
  await seed(page);
  await page.keyboard.press('Meta+=');
  expect(await page.evaluate(async () => (await import(performance.getEntriesByType('resource').map(r => r.name).find(name => name.includes('/src/lib/editor.svelte.ts')) ?? '/src/lib/editor.svelte.ts')).editor.viewDurationSec)).toBe(24);
  await page.keyboard.press('Meta+-');
  expect(await page.evaluate(async () => (await import(performance.getEntriesByType('resource').map(r => r.name).find(name => name.includes('/src/lib/editor.svelte.ts')) ?? '/src/lib/editor.svelte.ts')).editor.viewDurationSec)).toBe(30);
  const canvas = (await page.locator('[data-track-lane] canvas').first().boundingBox())!;
  await page.mouse.move(canvas.x+canvas.width*.2,canvas.y+canvas.height*.5);
  await page.mouse.down();
  await page.mouse.move(canvas.x+canvas.width*.4,canvas.y+canvas.height*.5,{steps:8});
  await page.mouse.up();
  await page.getByLabel('Marker action').selectOption('cut');
  await page.getByRole('button',{name:'Mark M',exact:true}).click();
  const band = (await page.locator('.mark.cut').boundingBox())!;
  await page.mouse.move(band.x+band.width-2,band.y+band.height*.5);
  await page.mouse.down();
  await page.mouse.move(band.x+band.width+40,band.y+band.height*.5,{steps:8});
  await page.mouse.up();
  const widened = (await page.locator('.mark.cut').boundingBox())!;
  expect(widened.width).toBeGreaterThan(band.width+30);
  await page.locator('.mark.cut').click({position:{x:widened.width/2,y:10}});
  await page.getByRole('button',{name:'Unmark',exact:true}).click();
  await expect(page.locator('.mark.cut')).toHaveCount(0);
  await page.keyboard.press('Meta+z');
  await expect(page.locator('.mark.cut')).toHaveCount(1);
});

test('single-view layout keeps a compact tweak strip', async ({ page }) => {
  await seed(page);
  await page.getByRole('radiogroup', { name: 'View' }).getByRole('button', { name: 'Audio', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Transcript caption' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Transcribe all tracks', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Seek on time ruler' })).toBeVisible();
  await page.locator('[data-word="1"]').click();
  expect(await page.evaluate(async () => (await import(performance.getEntriesByType('resource').map(r => r.name).find(name => name.includes('/src/lib/editor.svelte.ts')) ?? '/src/lib/editor.svelte.ts')).editor.playheadSec)).toBe(1.6);

  await page.getByRole('radiogroup', { name: 'View' }).getByRole('button', { name: 'Transcript', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Transcribe all again', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Seek on time ruler' })).toHaveCount(0);
  await expect(page.locator('[data-track-lane] canvas')).toHaveCount(2);
  await expect(page.getByRole('slider', { name: 'Waveform vertical zoom' })).toHaveCount(0);
});

test('cleanup mode, deep dB scale, bulk conversion, and simplified transport', async ({ page }) => {
  await seed(page);
  await expect(page.getByText('Loop IN–OUT')).toHaveCount(0);
  await expect(page.getByRole('button', {name:'IN', exact:true})).toHaveCount(0);
  await page.getByRole('button', {name:'cleanup', exact:true}).click();
  const vad = page.getByRole('checkbox', {name:/Use speech detection/});
  await expect(vad).toBeChecked();
  await vad.uncheck();
  await expect(page.getByRole('button', {name:'Run silence floor only · all tracks'})).toBeVisible();
  const dbScale = page.getByRole('slider', {name:'Waveform vertical zoom'}).first();
  await expect(page.getByText('−12', {exact:true}).first()).toBeVisible();
  await dbScale.hover();
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -100);
  await expect(page.getByText('−60', {exact:true}).first()).toBeVisible();
  await dbScale.dblclick();
  await expect(dbScale).toHaveAttribute('aria-valuenow', '0');

  await page.evaluate(async () => {
    const { editor } = await import(performance.getEntriesByType('resource').map(r => r.name).find(name => name.includes('/src/lib/editor.svelte.ts')) ?? '/src/lib/editor.svelte.ts');
    editor.tracks[0].rawMarkers = [{start:1,end:3}];
    editor.tracks[1].rawMarkers = [{start:2,end:4}];
  });
  await page.getByRole('button', {name:'edits', exact:true}).click();
  await page.getByRole('button', {name:'Convert all silences to shared cuts'}).click();
  const state = await page.evaluate(async () => {
    const { editor } = await import(performance.getEntriesByType('resource').map(r => r.name).find(name => name.includes('/src/lib/editor.svelte.ts')) ?? '/src/lib/editor.svelte.ts');
    return {cuts: editor.cuts, markers: editor.tracks.map(track => track.rawMarkers)};
  });
  expect(state).toEqual({cuts:[{start:1.15,end:3.85}], markers:[[],[]]});
});

test('bundled VAD identifies speech, excludes silence, and serializes concurrent callers', async ({ page }) => {
  test.setTimeout(60000);
  const { readFile } = await import('node:fs/promises');
  const fixture = await readFile(new URL('./fixtures/speech.wav', import.meta.url));
  await page.route('**/speech-fixture.wav', route => route.fulfill({contentType:'audio/wav',body:fixture}));
  await seed(page);
  const result = await page.evaluate(async () => {
    const { vadDetector } = await import(performance.getEntriesByType('resource').map(r => r.name).find(name => name.includes('/src/lib/vadDetector.ts')) ?? '/src/lib/vadDetector.ts');
    const context = new AudioContext({sampleRate:16000});
    const decoded = await context.decodeAudioData(await (await fetch('/speech-fixture.wav')).arrayBuffer());
    const samples = new Float32Array(decoded.length+16000*8);
    samples.set(decoded.getChannelData(0),16000*4);
    const options = {positiveSpeechThreshold:.5,negativeSpeechThreshold:.35};
    const [speech,silence] = await Promise.all([
      vadDetector.detect(samples,16000,options),
      vadDetector.detect(new Float32Array(16000*4),16000,options),
    ]);
    await context.close();
    return {speech,silence,end:decoded.duration+4};
  });
  expect(result.speech.length).toBeGreaterThan(0);
  expect(result.speech[0].start).toBeGreaterThan(3);
  expect(result.speech.at(-1)!.end).toBeLessThan(result.end+1);
  expect(result.silence).toEqual([]);
});
