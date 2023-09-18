import pwd from 'process';
import path from 'path';
import fs from 'fs/promises';

const TYPESCRIPT_OUTPUT_DIR_NAME =
  process.env.TYPESCRIPT_OUTPUT_DIR_NAME || 'precomputed_ts';
const OCAML_OUTPUT_DIR_NAME =
  process.env.OCAML_OUTPUT_DIR_NAME || 'precomputed_ocaml';

const TYPESCRIPT_DIR = path.join(pwd.cwd(), TYPESCRIPT_OUTPUT_DIR_NAME);
const OCAML_DIR = path.join(pwd.cwd(), OCAML_OUTPUT_DIR_NAME);

async function compareFiles() {
  const typescriptFiles = await fs.readdir(TYPESCRIPT_DIR);
  const ocamlFiles = await fs.readdir(OCAML_DIR);

  // Ensure that both directories contain the same number of files
  if (typescriptFiles.length !== ocamlFiles.length) {
    console.error('Directories do not contain the same number of files!');
    console.error(`TypeScript: ${typescriptFiles.length}`);
    console.error(`OCaml: ${ocamlFiles.length}`);
    process.exit(1);
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

    const tsContent = await fs.readFile(
      path.join(TYPESCRIPT_DIR, tsFile),
      'utf-8'
    );
    const ocamlContent = await fs.readFile(
      path.join(OCAML_DIR, ocamlFile),
      'utf-8'
    );

    const tsContentJson = JSON.parse(tsContent);
    const ocamlContentJson = JSON.parse(ocamlContent);

    // Check if the file contents are equal
    if (
      tsContentJson['height'] !== ocamlContentJson['height'] ||
      tsContentJson['previous_state_hash'] !==
        ocamlContentJson['previous_state_hash']
    ) {
      console.error(`File contents do not match! (${tsFile}), (${ocamlFile}})`);
      console.error(`TypeScript: ${JSON.stringify(tsContentJson)}`);
      console.error(`OCaml: ${JSON.stringify(ocamlContentJson)}`);
      process.exit(1);
    }
  }
  console.log('🎉 All files match!');
  process.exit(0);
}

compareFiles();
