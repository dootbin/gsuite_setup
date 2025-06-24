import { parse } from '@std/flags';
import { load } from '@std/dotenv';
import { Config, PasswordConfig } from './types.ts';
import { CSVParser } from './csv-parser.ts';
import { GoogleAPIClient } from './google-api.ts';
import { OUManager } from './ou-manager.ts';
import { SyncEngine } from './sync-engine.ts';
import { logger } from './logger.ts';

async function loadExternalConfig(): Promise<{ passwordConfig?: PasswordConfig; ouRoot?: string }> {
  const configPaths = [
    'config/config.json',
    'config.json',
    './config.json'
  ];

  for (const path of configPaths) {
    try {
      const configText = await Deno.readTextFile(path);
      const configData = JSON.parse(configText);
      
      return {
        passwordConfig: configData.passwordConfig as PasswordConfig | undefined,
        ouRoot: configData.ouRoot as string | undefined,
      };
    } catch {
      // File doesn't exist or invalid JSON, try next path
      continue;
    }
  }

  return {};
}

async function loadConfig(): Promise<Config> {
  await load({ export: true });

  const externalConfig = await loadExternalConfig();

  const config: Config = {
    googleServiceAccountKeyFile: Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY_FILE') || '',
    googleDomain: Deno.env.get('GOOGLE_DOMAIN') || '',
    googleDelegatedUser: Deno.env.get('GOOGLE_DELEGATED_USER') || '',
    studentCsvFile: Deno.env.get('STUDENT_CSV_FILE') || 'students.csv',
    dryRun: Deno.env.get('DRY_RUN') === 'true',
    logLevel: (Deno.env.get('LOG_LEVEL') || 'info') as Config['logLevel'],
    maxConcurrentRequests: parseInt(Deno.env.get('MAX_CONCURRENT_REQUESTS') || '10', 10),
    retryAttempts: parseInt(Deno.env.get('RETRY_ATTEMPTS') || '3', 10),
    retryDelayMs: parseInt(Deno.env.get('RETRY_DELAY_MS') || '1000', 10),
    requireConfirmationThreshold: parseInt(
      Deno.env.get('REQUIRE_CONFIRMATION_THRESHOLD') || '10',
      10,
    ),
    enableBackup: Deno.env.get('ENABLE_BACKUP') === 'true',
    backupDir: Deno.env.get('BACKUP_DIR') || './backups',
    passwordPrefix: Deno.env.get('PASSWORD_PREFIX'),
    passwordConfig: externalConfig.passwordConfig,
    ouRoot: externalConfig.ouRoot,
  };

  if (!config.googleServiceAccountKeyFile) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_FILE is required');
  }
  if (!config.googleDomain) {
    throw new Error('GOOGLE_DOMAIN is required');
  }
  if (!config.googleDelegatedUser) {
    throw new Error('GOOGLE_DELEGATED_USER is required');
  }

  return config;
}

function parseArgs() {
  const args = parse(Deno.args, {
    boolean: [
      'help',
      'dry-run',
      'create-only',
      'move-only',
      'deactivate-only',
      'generate-sample',
      'verbose',
      'no-headers',
    ],
    string: ['csv-file', 'log-level'],
    alias: {
      h: 'help',
      d: 'dry-run',
      v: 'verbose',
      f: 'csv-file',
    },
    default: {
      'dry-run': undefined,
      'verbose': false,
      'no-headers': false,
    },
  });

  return args;
}

function printHelp() {
  console.log(`
Google Workspace Student Account Sync

Usage:
  deno run --allow-net --allow-read --allow-env main.ts [options]

Options:
  -h, --help              Show this help message
  -d, --dry-run           Preview changes without making them
  -f, --csv-file FILE     Path to student CSV file (overrides env)
  -v, --verbose           Enable verbose logging
  --log-level LEVEL       Set log level (debug, info, warn, error)
  --create-only           Only create new accounts
  --move-only             Only move existing accounts
  --deactivate-only       Only deactivate accounts
  --generate-sample       Generate a sample CSV file
  --no-headers            CSV file has no header row

Examples:
  # Dry run with default settings
  deno run --allow-net --allow-read --allow-env main.ts --dry-run

  # Sync with specific CSV file
  deno run --allow-net --allow-read --allow-env main.ts -f enrollment.csv

  # Only create new accounts
  deno run --allow-net --allow-read --allow-env main.ts --create-only

  # Generate sample CSV
  deno run --allow-net --allow-read --allow-env main.ts --generate-sample
`);
}

async function generateSampleCSV() {
  const parser = new CSVParser();
  const sampleContent = parser.generateSampleCSV();
  const filename = 'sample-students.csv';

  await Deno.writeTextFile(filename, sampleContent);
  console.log(`Sample CSV file generated: ${filename}`);
}

async function main() {
  try {
    const args = parseArgs();

    if (args.help) {
      printHelp();
      Deno.exit(0);
    }

    if (args['generate-sample']) {
      await generateSampleCSV();
      Deno.exit(0);
    }

    const config = await loadConfig();

    if (args['csv-file']) {
      config.studentCsvFile = args['csv-file'] as string;
    }

    if (args['dry-run'] !== undefined) {
      config.dryRun = args['dry-run'] as boolean;
    }

    if (args.verbose || args['log-level']) {
      config.logLevel = args['log-level'] as Config['logLevel'] || 'debug';
    }

    if (args['create-only']) {
      config.createOnly = true;
    }
    if (args['move-only']) {
      config.moveOnly = true;
    }
    if (args['deactivate-only']) {
      config.deactivateOnly = true;
    }

    const logFile = `logs/sync-${new Date().toISOString().split('T')[0]}.log`;
    await logger.setup(config.logLevel, logFile);

    logger.info('Starting Google Workspace Student Account Sync');
    logger.info(`Configuration: ${
      JSON.stringify(
        {
          ...config,
          googleServiceAccountKeyFile: '***',
        },
        null,
        2,
      )
    }`);

    const csvParser = new CSVParser();
    const hasHeaders = !args['no-headers'];
    const students = await csvParser.parseStudentFile(config.studentCsvFile, hasHeaders);
    logger.info(`Loaded ${students.length} students from CSV`);

    // Skip Google API initialization in dry run mode
    let googleAPI: GoogleAPIClient;
    if (config.dryRun) {
      // Create a mock Google API client for dry run
      googleAPI = {} as GoogleAPIClient;
    } else {
      googleAPI = new GoogleAPIClient(
        config.googleServiceAccountKeyFile,
        config.googleDelegatedUser,
        config.googleDomain,
      );
    }

    const ouManager = new OUManager(config.ouRoot);
    const syncEngine = new SyncEngine(googleAPI, ouManager, config);

    const summary = await syncEngine.sync(students);

    if (summary.errors > 0) {
      logger.error(`Sync completed with ${summary.errors} errors`);
      Deno.exit(1);
    } else {
      logger.info('Sync completed successfully');
      Deno.exit(0);
    }
  } catch (error) {
    console.error('Fatal error:', error instanceof Error ? error.message : 'Unknown error');
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
