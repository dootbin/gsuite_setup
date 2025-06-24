#!/usr/bin/env -S deno run --allow-read

/**
 * Simple script to validate GitHub workflow YAML files
 */

import { parse } from 'https://deno.land/std@0.224.0/yaml/mod.ts';

async function validateWorkflow(filePath: string): Promise<boolean> {
  try {
    console.log(`Validating ${filePath}...`);

    const content = await Deno.readTextFile(filePath);
    const workflow = parse(content) as Record<string, unknown>;

    // Basic validation
    if (!workflow.name) {
      console.error(`❌ ${filePath}: Missing 'name' field`);
      return false;
    }

    if (!workflow.on) {
      console.error(`❌ ${filePath}: Missing 'on' field`);
      return false;
    }

    if (!workflow.jobs) {
      console.error(`❌ ${filePath}: Missing 'jobs' field`);
      return false;
    }

    console.log(`✅ ${filePath}: Valid`);
    return true;
  } catch (error) {
    console.error(`❌ ${filePath}: ${error.message}`);
    return false;
  }
}

async function main() {
  const workflowFiles = [
    '.github/workflows/dev-tests.yml',
    '.github/workflows/master-release.yml',
    '.github/workflows/pr-validation.yml',
  ];

  let allValid = true;

  for (const file of workflowFiles) {
    const isValid = await validateWorkflow(file);
    if (!isValid) {
      allValid = false;
    }
  }

  if (allValid) {
    console.log('\n🎉 All workflow files are valid!');
    Deno.exit(0);
  } else {
    console.log('\n💥 Some workflow files have issues');
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
