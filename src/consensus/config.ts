import fs from 'fs';
import path from 'path';
export { CONFIG };

type Config = {
  k: number;
  delta: number;
  slotsPerEpoch: number;
  slotsPerSubWindow: number;
  subWindowsPerWindow: number;
  blockWindowDuration: number;
  gracePeriodEnd: number;
};

const CONFIG = readConfig(path.join('src', 'consensus', 'config.mlh'));

function readConfig(path: string): Config {
  const contents = fs.readFileSync(path, 'utf8');

  const blockWindowDuration = extractValue(contents, 'block_window_duration');
  const slotsPerEpoch = extractValue(contents, 'slots_per_epoch');
  const gracePeriodEnd = genGracePeriodEnd(slotsPerEpoch, blockWindowDuration);

  return {
    k: extractValue(contents, 'k'),
    delta: extractValue(contents, 'delta'),
    slotsPerEpoch,
    slotsPerSubWindow: extractValue(contents, 'slots_per_sub_window'),
    subWindowsPerWindow: extractValue(contents, 'sub_windows_per_window'),
    blockWindowDuration,
    gracePeriodEnd,
  };
}

function extractValue(contents: string, key: string): number {
  const regex = new RegExp(`\\[%%define ${key} (?:")?(\\d+)(?:")?\\]`);
  const match = contents.match(regex);
  if (!match) {
    throw new Error(`Key ${key} not found in config file.`);
  }
  return parseInt(match[1], 10);
}

function genGracePeriodEnd(
  slotsPerEpoch: number,
  blockWindowDuration: number
): number {
  const numDays = 3;
  const gracePeriodEnd = Math.min(
    (numDays * 24 * 60 * 60 * 1000) / blockWindowDuration,
    slotsPerEpoch
  );
  return gracePeriodEnd;
}
