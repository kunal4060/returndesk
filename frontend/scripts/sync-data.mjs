#!/usr/bin/env node
/**
 * sync-data.mjs — copy the seeded dataset into the Next app.
 *
 * Next.js cannot reliably import JSON/Markdown from outside its own root,
 * so every dataset file in ../dataset/ is mirrored into src/data/ and the
 * pages import from "@/data/...". Runs automatically via the predev /
 * prebuild npm scripts; can also be run directly: `npm run sync-data`.
 *
 * If a dataset file has not been seeded yet, a minimal placeholder is
 * written (only when no target exists) so imports still resolve and the
 * pages render their honest empty states. Re-running after the real
 * dataset lands overwrites the placeholders with the real files.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, "..");
const datasetDir = path.resolve(frontendRoot, "..", "dataset");
const targetDir = path.resolve(frontendRoot, "src", "data");

const JSON_FALLBACKS = {
  "scenario.json": "{}",
  "evidence.json": "[]",
  "test-orders.json": "[]",
  "heavy-returners.json": "[]",
  "detector-scores.json": "[]",
};

const MD_FALLBACKS = {
  "data-card.md":
    "# Data card\n\nThe seeded data card has not been added to the dataset yet.\n",
  "threat-model.md":
    "# Threat model\n\nThe threat model has not been added to the dataset yet.\n",
};

async function main() {
  await fs.mkdir(targetDir, { recursive: true });

  let copied = 0;
  let entries = [];
  try {
    entries = await fs.readdir(datasetDir);
  } catch {
    console.warn(`[sync-data] dataset directory not found: ${datasetDir}`);
  }

  for (const name of entries) {
    if (!name.endsWith(".json") && !name.endsWith(".md")) continue;
    const src = path.join(datasetDir, name);
    const dest = path.join(targetDir, name);
    await fs.copyFile(src, dest);
    copied += 1;
    console.log(`[sync-data] ${name} -> src/data/${name}`);
  }

  // Placeholders only for files the dataset has not provided yet.
  for (const [name, body] of Object.entries(JSON_FALLBACKS)) {
    const dest = path.join(targetDir, name);
    try {
      await fs.access(dest);
    } catch {
      await fs.writeFile(dest, body + "\n", "utf8");
      console.warn(`[sync-data] ${name} missing from dataset — wrote empty placeholder`);
    }
  }
  for (const [name, body] of Object.entries(MD_FALLBACKS)) {
    const dest = path.join(targetDir, name);
    try {
      await fs.access(dest);
    } catch {
      await fs.writeFile(dest, body, "utf8");
      console.warn(`[sync-data] ${name} missing from dataset — wrote placeholder`);
    }
  }

  console.log(`[sync-data] done (${copied} file(s) copied)`);
}

main().catch((err) => {
  console.error("[sync-data] failed:", err);
  process.exit(1);
});
