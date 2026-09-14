import { test } from "node:test";
import assert from "node:assert/strict";
import { sceneIntervals } from "./src/compositions/campaign-timing.ts";

for (const wide of [false, true]) {
  test(`${wide ? "Homepage" : "Social"} has continuous scenes and complete wipe coverage`, () => {
    const scenes = sceneIntervals(wide);
    assert.equal(scenes.length, 6);
    assert.equal(scenes[0].from, 0);
    scenes.forEach((scene, index) => {
      assert.ok(scene.duration >= 60, "Each scene has at least two seconds");
      if (index < scenes.length - 1) {
        assert.equal(scene.from + scene.duration, scenes[index + 1].from);
        assert.equal(scene.mountedDuration - scene.duration, 10);
      }
    });
    const last = scenes.at(-1);
    assert.equal(last.from + last.mountedDuration, wide ? 900 : 600);
  });
  test(`${wide ? "Homepage" : "Social"} leaves time for reading and CTA`, () => {
    const scenes = sceneIntervals(wide);
    assert.ok(scenes[3].duration >= 120, "Answer readable for four seconds");
    assert.ok(scenes[4].duration >= 135, "Library builds across at least 4.5 seconds");
    assert.ok(scenes[5].duration >= 90, "CTA readable for at least three seconds");
  });
}
