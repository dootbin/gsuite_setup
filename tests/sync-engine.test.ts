import { assertEquals } from '@std/testing';
import { SyncEngine } from '../src/sync-engine.ts';
import { GoogleAPIClient } from '../src/google-api.ts';
import { OUManager } from '../src/ou-manager.ts';
import { Config, Student } from '../src/types.ts';

// Interface to access private methods for testing
interface SyncEngineWithPrivates {
  generatePassword(student: Student): string;
}

// Mock config for testing
const mockConfig: Config = {
  googleServiceAccountKeyFile: 'test.json',
  googleDomain: 'test.edu',
  googleDelegatedUser: 'admin@test.edu',
  studentCsvFile: 'test.csv',
  dryRun: true,
  logLevel: 'info',
  maxConcurrentRequests: 1,
  retryAttempts: 1,
  retryDelayMs: 100,
  requireConfirmationThreshold: 5,
  enableBackup: false,
  backupDir: './test-backup',
  passwordPrefix: 'lh00',
};

Deno.test('SyncEngine - generatePassword (backward compatibility)', () => {
  // Test default behavior without password config
  const googleAPI = {} as GoogleAPIClient; // Mock
  const ouManager = new OUManager();
  const syncEngine = new SyncEngine(googleAPI, ouManager, mockConfig);

  // Access the private method via type assertion
  const generatePassword = (syncEngine as unknown as SyncEngineWithPrivates).generatePassword.bind(
    syncEngine,
  );

  const testStudent = (studentId: string): Student => ({
    studentId,
    firstName: 'John',
    lastName: 'Doe',
    grade: '9',
    graduationYear: 2028,
  });

  // Test various student ID formats
  assertEquals(generatePassword(testStudent('STU001')), 'lh000001');
  assertEquals(generatePassword(testStudent('STU0001')), 'lh000001');
  assertEquals(generatePassword(testStudent('STU12345')), 'lh002345');
  assertEquals(generatePassword(testStudent('12345')), 'lh002345');
  assertEquals(generatePassword(testStudent('1')), 'lh000001');
  assertEquals(generatePassword(testStudent('99')), 'lh000099');
  assertEquals(generatePassword(testStudent('STUDENT123')), 'lh000123');
  assertEquals(generatePassword(testStudent('ABC999XYZ')), 'lh000999');

  // Test edge cases
  assertEquals(generatePassword(testStudent('NO_NUMBERS')), 'lh000000');
  assertEquals(generatePassword(testStudent('')), 'lh000000');
  assertEquals(generatePassword(testStudent('1234567890')), 'lh007890'); // Takes last 4 digits
});

Deno.test('SyncEngine - generatePassword with custom prefix', () => {
  const customConfig = { ...mockConfig, passwordPrefix: 'school' };
  const googleAPI = {} as GoogleAPIClient; // Mock
  const ouManager = new OUManager();
  const syncEngine = new SyncEngine(googleAPI, ouManager, customConfig);

  const generatePassword = (syncEngine as unknown as SyncEngineWithPrivates).generatePassword.bind(
    syncEngine,
  );

  const testStudent = (studentId: string): Student => ({
    studentId,
    firstName: 'John',
    lastName: 'Doe',
    grade: '9',
    graduationYear: 2028,
  });

  assertEquals(generatePassword(testStudent('STU001')), 'school0001');
  assertEquals(generatePassword(testStudent('12345')), 'school2345');
});

Deno.test('SyncEngine - generatePassword with undefined prefix', () => {
  const defaultConfig = { ...mockConfig, passwordPrefix: undefined };
  const googleAPI = {} as GoogleAPIClient; // Mock
  const ouManager = new OUManager();
  const syncEngine = new SyncEngine(googleAPI, ouManager, defaultConfig);

  const generatePassword = (syncEngine as unknown as SyncEngineWithPrivates).generatePassword.bind(
    syncEngine,
  );

  const testStudent = (studentId: string): Student => ({
    studentId,
    firstName: 'John',
    lastName: 'Doe',
    grade: '9',
    graduationYear: 2028,
  });

  // Should default to 'lh00'
  assertEquals(generatePassword(testStudent('STU001')), 'lh000001');
  assertEquals(generatePassword(testStudent('12345')), 'lh002345');
});

Deno.test('SyncEngine - configurable password generation (custom pattern)', () => {
  const configWithCustomPattern = { 
    ...mockConfig, 
    passwordConfig: {
      type: 'custom_function' as const,
      customPattern: '{firstName}{graduationYear}'
    }
  };
  const googleAPI = {} as GoogleAPIClient; // Mock
  const ouManager = new OUManager();
  const syncEngine = new SyncEngine(googleAPI, ouManager, configWithCustomPattern);

  const generatePassword = (syncEngine as unknown as SyncEngineWithPrivates).generatePassword.bind(
    syncEngine,
  );

  const testStudent: Student = {
    studentId: 'STU001',
    firstName: 'John',
    lastName: 'Doe',
    grade: '9',
    graduationYear: 2028,
  };

  assertEquals(generatePassword(testStudent), 'john2028');
});

Deno.test('SyncEngine - configurable password generation (prefix studentid)', () => {
  const configWithPrefixStudentId = { 
    ...mockConfig, 
    passwordConfig: {
      type: 'prefix_studentid' as const,
      prefix: 'test'
    }
  };
  const googleAPI = {} as GoogleAPIClient; // Mock
  const ouManager = new OUManager();
  const syncEngine = new SyncEngine(googleAPI, ouManager, configWithPrefixStudentId);

  const generatePassword = (syncEngine as unknown as SyncEngineWithPrivates).generatePassword.bind(
    syncEngine,
  );

  const testStudent: Student = {
    studentId: 'STU001',
    firstName: 'John',
    lastName: 'Doe',
    grade: '9',
    graduationYear: 2028,
  };

  assertEquals(generatePassword(testStudent), 'test0001');
});

Deno.test('SyncEngine - configurable password generation (random)', () => {
  const configWithRandom = { 
    ...mockConfig, 
    passwordConfig: {
      type: 'random' as const,
      length: 8,
      includeUppercase: true,
      includeLowercase: true,
      includeNumbers: true,
      includeSymbols: false
    }
  };
  const googleAPI = {} as GoogleAPIClient; // Mock
  const ouManager = new OUManager();
  const syncEngine = new SyncEngine(googleAPI, ouManager, configWithRandom);

  const generatePassword = (syncEngine as unknown as SyncEngineWithPrivates).generatePassword.bind(
    syncEngine,
  );

  const testStudent: Student = {
    studentId: 'STU001',
    firstName: 'John',
    lastName: 'Doe',
    grade: '9',
    graduationYear: 2028,
  };

  const password = generatePassword(testStudent);
  
  // Test that password has correct length
  assertEquals(password.length, 8);
  
  // Test that password only contains expected character types (no symbols)
  assertEquals(/^[A-Za-z0-9]+$/.test(password), true); // Only contains alphanumeric characters
  assertEquals(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password), false); // No symbols
  
  // Generate multiple passwords to test character distribution (at least one should have mixed case)
  let hasUppercase = false;
  let hasLowercase = false;
  let hasNumbers = false;
  
  for (let i = 0; i < 10; i++) {
    const testPassword = generatePassword(testStudent);
    if (/[A-Z]/.test(testPassword)) hasUppercase = true;
    if (/[a-z]/.test(testPassword)) hasLowercase = true;
    if (/[0-9]/.test(testPassword)) hasNumbers = true;
    if (hasUppercase && hasLowercase && hasNumbers) break;
  }
  
  assertEquals(hasUppercase, true); // At least one password contains uppercase
  assertEquals(hasLowercase, true); // At least one password contains lowercase  
  assertEquals(hasNumbers, true); // At least one password contains numbers
});

Deno.test('SyncEngine - device sync functionality', () => {
  const googleAPI = {} as GoogleAPIClient; // Mock
  const ouManager = new OUManager();
  const syncEngine = new SyncEngine(googleAPI, ouManager, mockConfig);

  // Test students with and without devices
  const studentsWithDevices = [
    {
      studentId: 'STU001',
      firstName: 'John',
      lastName: 'Doe',
      grade: '9',
      graduationYear: 2028,
      deviceSerial: 'CHR001234567',
    },
    {
      studentId: 'STU002',
      firstName: 'Jane',
      lastName: 'Smith',
      grade: '6',
      graduationYear: 2031,
      deviceSerial: 'CHR002345678',
    },
    {
      studentId: 'STU003',
      firstName: 'Bob',
      lastName: 'Johnson',
      grade: '3',
      graduationYear: 2034,
      // No device serial
    },
  ];

  // Access the private method for testing (this is the simulate method which runs in dry-run)
  const simulatedActions = (syncEngine as any).simulateActions(studentsWithDevices);

  // Should have 2 create actions + 2 device move actions + 1 create action (no device)
  assertEquals(simulatedActions.length, 5);

  // Count action types
  const createActions = simulatedActions.filter((a: any) => a.type === 'create');
  const deviceActions = simulatedActions.filter((a: any) => a.type === 'move_device');

  assertEquals(createActions.length, 3); // All students get user accounts
  assertEquals(deviceActions.length, 2); // Only students with device serials get device actions

  // Verify device actions contain correct information
  const johnDeviceAction = deviceActions.find((a: any) => 
    a.reason.includes('CHR001234567')
  );
  const janeDeviceAction = deviceActions.find((a: any) => 
    a.reason.includes('CHR002345678')
  );

  assertEquals(!!johnDeviceAction, true);
  assertEquals(!!janeDeviceAction, true);
  assertEquals(johnDeviceAction.targetOUPath, '/org/student/high/2028/john.doe');
  assertEquals(janeDeviceAction.targetOUPath, '/org/student/middle/2031/jane.smith');
});

Deno.test('SyncEngine - configurable OU root integration', () => {
  // Test with custom OU root
  const configWithCustomRoot = { 
    ...mockConfig, 
    ouRoot: '/test'
  };
  
  const googleAPI = {} as GoogleAPIClient; // Mock
  const ouManager = new OUManager(configWithCustomRoot.ouRoot);
  const syncEngine = new SyncEngine(googleAPI, ouManager, configWithCustomRoot);

  const testStudent: Student = {
    studentId: 'STU001',
    firstName: 'John',
    lastName: 'Doe',
    grade: '9',
    graduationYear: 2028,
    deviceSerial: 'CHR001234567',
  };

  // Test that OU paths use the custom root
  const simulatedActions = (syncEngine as any).simulateActions([testStudent]);
  
  const createAction = simulatedActions.find((a: any) => a.type === 'create');
  const deviceAction = simulatedActions.find((a: any) => a.type === 'move_device');
  
  assertEquals(createAction.targetOUPath, '/test/high/2028/john.doe');
  assertEquals(deviceAction.targetOUPath, '/test/high/2028/john.doe');
});
