import fs from 'fs';
export { Config, readConfig };

type Config = {
  k: number;
  delta: number;
  slotsPerEpoch: number;
  slotsPerSubWindow: number;
  subWindowsPerWindow: number;
  blockWindowDuration: number;
  gracePeriodEnd: number;
};

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
