import { test } from "node:test";
import assert from "node:assert/strict";
import { blockingSegments, crossesWall, pointInPolygon, visibilityPolygon } from "../shared/vision.ts";

const bounds = { x0: 0, y0: 0, x1: 1000, y1: 1000 };

test("parede esconde o que está atrás", () => {
  const segs = blockingSegments({ walls: [500, 300, 500, 700] }, true);
  const poly = visibilityPolygon(200, 500, segs, bounds);
  assert.ok(pointInPolygon(400, 500, poly), "na frente da parede");
  assert.ok(!pointInPolygon(700, 500, poly), "atrás da parede");
  assert.ok(pointInPolygon(700, 100, poly), "por cima da parede");
});

test("porta fechada bloqueia; aberta não; grade só bloqueia a passagem", () => {
  const door = { id: "d", x1: 500, y1: 0, x2: 500, y2: 1000, open: false };
  assert.ok(!pointInPolygon(700, 500, visibilityPolygon(200, 500, blockingSegments({ doors: [door] }, true), bounds)));
  assert.ok(pointInPolygon(700, 500, visibilityPolygon(200, 500, blockingSegments({ doors: [{ ...door, open: true }] }, true), bounds)));
  const grade = { ...door, seeThrough: true };
  assert.ok(pointInPolygon(700, 500, visibilityPolygon(200, 500, blockingSegments({ doors: [grade] }, true), bounds)));
  assert.ok(crossesWall(200, 500, 700, 500, blockingSegments({ doors: [grade] }, false)));
});

test("alcance limita a visão", () => {
  const poly = visibilityPolygon(500, 500, [], bounds, 100);
  assert.ok(pointInPolygon(550, 500, poly));
  assert.ok(!pointInPolygon(800, 500, poly));
});

test("movimento atravessando parede", () => {
  const segs = blockingSegments({ walls: [500, 300, 500, 700] }, false);
  assert.ok(crossesWall(400, 500, 600, 500, segs));
  assert.ok(!crossesWall(400, 500, 450, 500, segs));
  assert.ok(!crossesWall(400, 100, 600, 100, segs)); // passa por cima
});
