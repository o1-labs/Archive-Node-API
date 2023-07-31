/**
 * Usage: npx ts-node ./src/consensus/run-compare.ts
 */

import pwd from 'process';
import path from 'path';
import fs from 'fs/promises';

// TODO: Make these paths configurable
const TYPESCRIPT_DIR = path.join(pwd.cwd(), 'compare-ts');
const OCAML_DIR = path.join(pwd.cwd(), 'compare-ocaml');

async function compareFiles() {
  // Get all file names in each directory
  const typescriptFiles = await fs.readdir(TYPESCRIPT_DIR);
  const ocamlFiles = await fs.readdir(OCAML_DIR);

  // Ensure that both directories contain the same number of files
  if (typescriptFiles.length !== ocamlFiles.length) {
    console.error('Directories do not contain the same number of files!');
    console.error(`TypeScript: ${typescriptFiles.length}`);
    console.error(`OCaml: ${ocamlFiles.length}`);
    return;
  }

  // Iterate through each file
  for (let i = 0; i < typescriptFiles.length; i++) {
    const tsFile = typescriptFiles[i];
    const ocamlFile = ocamlFiles[i];

    // Ensure we're comparing files with the same name
    if (tsFile !== ocamlFile) {
      console.error(`File names do not match! (${tsFile} vs ${ocamlFile})`);
      continue;
    }

    // Read each file's contents
    const tsContent = await fs.readFile(
      path.join(TYPESCRIPT_DIR, tsFile),
      'utf-8'
    );
    const tsContentJson = JSON.parse(tsContent);
    const ocamlContent = await fs.readFile(
      path.join(OCAML_DIR, ocamlFile),
      'utf-8'
    );
    const ocamlContentJson = JSON.parse(ocamlContent);

    // Check if the file contents are equal
    if (tsContentJson['height'] !== ocamlContentJson['height']) {
      console.error(`File contents do not match! (${tsFile}), (${ocamlFile}})`);
      console.error(`TypeScript: ${tsContentJson}`);
      console.error(`OCaml: ${ocamlContentJson}`);
    }

    if (
      tsContentJson['previous_state_hash'] !==
      ocamlContentJson['previous_state_hash']
    ) {
      console.error(`File contents do not match! (${tsFile}), (${ocamlFile}})`);
      console.error(`TypeScript: ${tsContentJson}`);
      console.error(`OCaml: ${ocamlContentJson}`);
    }
  }
  console.log('🎉 All files match!');
}

// Call the function
compareFiles();
