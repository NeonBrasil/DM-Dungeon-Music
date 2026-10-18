// Backup: .zip de ida e volta, zip refeito (deflate, dentro de pasta, nome malicioso) e cópias automáticas.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// a pasta de dados vem do ambiente na hora do import
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "mesa-backup-"));
process.env.DM_VTT_DATA = DATA;
const store = await import("../server/store.ts");
const backup = await import("../server/backup.ts");
store.loadConfig();
after(() => fs.rmSync(DATA, { recursive: true, force: true }));

const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");

function sample() {
  const camp = store.createCampaign("Teste Zip");
  fs.writeFileSync(path.join(store.filesDir(camp.id), "abc123.png"), PNG);
  fs.writeFileSync(path.join(store.filesDir(camp.id), "upload-x.tmp"), "lixo");
  camp.colls.assets.a1 = { id: "a1", name: "x", url: `/files/${camp.id}/abc123.png`, type: "image" };
  store.saveCampaign(camp);
  return camp;
}

/** .zip com deflate, como o do Windows/7-Zip (sem descritores). */
function deflateZip(entries: [string, Buffer][]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let off = 0;
  for (const [name, data] of entries) {
    const n = Buffer.from(name);
    const comp = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(n.length, 26);
    parts.push(lh, n, comp);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(off, 42);
    central.push(cd, n);
    off += 30 + n.length + comp.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, dir, end]);
}

test("backup .zip: exporta e importa com arquivos e endereços novos", async () => {
  const camp = sample();
  const plan = backup.planBackup(camp);
  assert.deepEqual(plan.entries.map((e) => e.name.toString()), ["campaign.json", "files/abc123.png"]); // .tmp fica de fora
  const out = path.join(DATA, "ida.zip");
  await pipeline(Readable.from(backup.zipStream(plan)), fs.createWriteStream(out));
  assert.equal(fs.statSync(out).size, plan.length);

  const imp = await backup.importBackup(out);
  assert.notEqual(imp.id, camp.id);
  assert.notEqual(imp.invite, camp.invite);
  assert.equal(imp.colls.settings.main.name, "Teste Zip");
  assert.equal(imp.colls.assets.a1.url, `/files/${imp.id}/abc123.png`);
  assert.deepEqual(fs.readFileSync(path.join(store.filesDir(imp.id), "abc123.png")), PNG);
  assert.equal(store.loadCampaign(imp.id)?.id, imp.id);
});

test("backup .zip refeito: deflate, dentro de pasta e sem nomes perigosos", async () => {
  const camp = sample();
  const zip = deflateZip([
    ["Minha campanha/campaign.json", Buffer.from(JSON.stringify(camp))],
    ["Minha campanha/files/abc123.png", PNG],
    ["Minha campanha/files/../../fora.png", PNG],
    ["Minha campanha/files/virus.exe", Buffer.from("MZ")],
  ]);
  const file = path.join(DATA, "refeito.zip");
  fs.writeFileSync(file, zip);
  const imp = await backup.importBackup(file);
  assert.deepEqual(fs.readdirSync(store.filesDir(imp.id)), ["abc123.png"]);
  assert.deepEqual(fs.readFileSync(path.join(store.filesDir(imp.id), "abc123.png")), PNG);
  assert.equal(fs.existsSync(path.join(DATA, "fora.png")), false);
});

test("backup .zip inválido dá erro claro", async () => {
  const file = path.join(DATA, "ruim.zip");
  fs.writeFileSync(file, "isto não é zip");
  await assert.rejects(backup.importBackup(file), /não é um arquivo \.zip/);
  fs.writeFileSync(file, deflateZip([["leia-me.txt", Buffer.from("oi")]]));
  await assert.rejects(backup.importBackup(file), /não tem campaign\.json/);
});

test("cópias automáticas: grava, lista e só lê as da própria campanha", () => {
  const a = sample();
  const b = sample();
  backup.snapshot(a.id, "-teste");
  const list = backup.listSnapshots(a.id);
  assert.equal(list.length, 1);
  assert.match(list[0].name, /^\d{4}-\d\d-\d\d-\d\d-\d\d-\d\d-teste\.json$/);
  assert.equal(backup.readSnapshot(a.id, list[0].name)?.id, a.id);
  assert.equal(backup.readSnapshot(b.id, list[0].name), null);
  assert.equal(backup.readSnapshot(a.id, "../campaign.json"), null);
});
