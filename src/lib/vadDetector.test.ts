import { beforeEach, expect, it, vi } from "vitest";
import { VadDetector } from "./vadDetector";

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = [];
  posted: unknown[] = [];
  terminated = false;
  constructor() { super(); FakeWorker.instances.push(this); }
  postMessage(message: unknown) { this.posted.push(message); }
  terminate() { this.terminated = true; }
  done(start: number) { this.dispatchEvent(new MessageEvent("message",{data:{type:"done",segments:[{start,end:start+1}]}})); }
}
const options = {positiveSpeechThreshold:.5,negativeSpeechThreshold:.35};
beforeEach(() => { FakeWorker.instances=[]; vi.stubGlobal("Worker",FakeWorker); });
it("serializes consumers so each receives only its own result", async () => {
  const detector = new VadDetector();
  const a = detector.detect(new Float32Array(1),16000,options);
  const b = detector.detect(new Float32Array(2),16000,options);
  await Promise.resolve();
  const worker = FakeWorker.instances[0];
  expect(worker.posted).toHaveLength(1);
  worker.done(1);
  expect(await a).toEqual([{start:1,end:2}]);
  await vi.waitFor(() => expect(worker.posted).toHaveLength(2));
  worker.done(4);
  expect(await b).toEqual([{start:4,end:5}]);
});
it("terminates a cancelled scan and starts the next consumer with a fresh worker", async () => {
  const detector = new VadDetector(), controller = new AbortController();
  const a = detector.detect(new Float32Array(1),16000,options,undefined,controller.signal);
  const rejected = expect(a).rejects.toThrow("Cancelled");
  const b = detector.detect(new Float32Array(2),16000,options);
  await Promise.resolve();
  controller.abort();
  await rejected;
  expect(FakeWorker.instances[0].terminated).toBe(true);
  await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(2));
  FakeWorker.instances[1].done(7);
  expect(await b).toEqual([{start:7,end:8}]);
});
