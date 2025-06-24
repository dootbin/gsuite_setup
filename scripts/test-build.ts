#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run

/**
 * Script to test the build process locally
 */

async function runCommand(cmd: string[]): Promise<{ success: boolean; output: string }> {
  console.log(`Running: ${cmd.join(' ')}`);

  const process = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: 'piped',
    stderr: 'piped',
  });

  const result = await process.output();
  const output = new TextDecoder().decode(result.stdout);
  const error = new TextDecoder().decode(result.stderr);

  if (result.success) {
    console.log('✅ Success');
    if (output) console.log(output);
  } else {
    console.log('❌ Failed');
    if (error) console.error(error);
  }

  return {
    success: result.success,
    output: output + error,
  };
}

async function main() {
  console.log('🔨 Testing build process...\n');

  // Step 1: Format check
  console.log('1. Checking formatting...');
  const fmt = await runCommand(['deno', 'fmt', '--check']);
  if (!fmt.success) {
    console.log('💡 Run `deno fmt` to fix formatting issues');
    return;
  }

  // Step 2: Lint check
  console.log('\n2. Running linter...');
  const lint = await runCommand(['deno', 'lint']);
  if (!lint.success) return;

  // Step 3: Type check
  console.log('\n3. Type checking...');
  const typecheck = await runCommand(['deno', 'check', 'src/**/*.ts']);
  if (!typecheck.success) return;

  // Step 4: Run tests
  console.log('\n4. Running tests...');
  const test = await runCommand(['deno', 'test', '--allow-net', '--allow-read', '--allow-env']);
  if (!test.success) return;

  // Step 5: Test compilation
  console.log('\n5. Testing compilation...');
  const compile = await runCommand([
    'deno',
    'compile',
    '--allow-net',
    '--allow-read',
    '--allow-env',
    '--output',
    'test-binary',
    'src/main.ts',
  ]);
  if (!compile.success) return;

  // Step 6: Test binary
  console.log('\n6. Testing compiled binary...');
  const testBinary = await runCommand(['./test-binary', '--help']);
  if (!testBinary.success) return;

  // Step 7: Clean up
  console.log('\n7. Cleaning up...');
  try {
    await Deno.remove('test-binary');
    console.log('✅ Cleanup complete');
  } catch (error) {
    console.log(`⚠️  Cleanup warning: ${error.message}`);
  }

  console.log('\n🎉 All build tests passed! Ready for CI/CD pipeline.');
}

if (import.meta.main) {
  main();
}
