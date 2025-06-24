#!/usr/bin/env -S deno run --allow-run --allow-read

/**
 * Build script to compile binaries for all platforms
 */

interface BuildTarget {
  platform: string;
  target: string;
  output: string;
}

const targets: BuildTarget[] = [
  {
    platform: 'Linux x86_64',
    target: 'x86_64-unknown-linux-gnu',
    output: 'gsuite-sync-linux',
  },
  {
    platform: 'macOS x86_64',
    target: 'x86_64-apple-darwin',
    output: 'gsuite-sync-macos',
  },
  {
    platform: 'Windows x86_64',
    target: 'x86_64-pc-windows-msvc',
    output: 'gsuite-sync-windows.exe',
  },
];

async function buildTarget(target: BuildTarget): Promise<boolean> {
  console.log(`🔨 Building for ${target.platform}...`);

  const cmd = [
    'deno',
    'compile',
    '--allow-net',
    '--allow-read',
    '--allow-env',
    '--target',
    target.target,
    '--output',
    target.output,
    'src/main.ts',
  ];

  const process = new Deno.Command('deno', {
    args: cmd.slice(1),
    stdout: 'piped',
    stderr: 'piped',
  });

  const result = await process.output();

  if (result.success) {
    console.log(`✅ Successfully built ${target.output}`);
    return true;
  } else {
    const error = new TextDecoder().decode(result.stderr);
    console.error(`❌ Failed to build ${target.platform}:`);
    console.error(error);
    return false;
  }
}

async function main() {
  console.log('🚀 Building binaries for all platforms...\n');

  let successCount = 0;

  for (const target of targets) {
    const success = await buildTarget(target);
    if (success) {
      successCount++;
    }
    console.log(''); // Empty line for readability
  }

  console.log(`📊 Build Summary: ${successCount}/${targets.length} successful`);

  if (successCount === targets.length) {
    console.log('🎉 All builds completed successfully!');
    console.log('\nGenerated binaries:');
    for (const target of targets) {
      console.log(`  - ${target.output} (${target.platform})`);
    }
  } else {
    console.log('💥 Some builds failed. Check the errors above.');
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
