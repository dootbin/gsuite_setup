import {
  ChromeDevice,
  Config,
  GoogleUser,
  PasswordConfig,
  Student,
  SyncAction,
  SyncResult,
  SyncSummary,
} from './types.ts';
import { GoogleAPIClient } from './google-api.ts';
import { OUManager } from './ou-manager.ts';
import { logger } from './logger.ts';

export class SyncEngine {
  private googleAPI: GoogleAPIClient;
  private ouManager: OUManager;
  private config: Config;

  constructor(googleAPI: GoogleAPIClient, ouManager: OUManager, config: Config) {
    this.googleAPI = googleAPI;
    this.ouManager = ouManager;
    this.config = config;
  }

  async sync(students: Student[]): Promise<SyncSummary> {
    const startTime = new Date();
    const summary: SyncSummary = {
      totalProcessed: 0,
      created: 0,
      moved: 0,
      deactivated: 0,
      updated: 0,
      errors: 0,
      results: [],
      startTime,
    };

    try {
      logger.info('Starting sync process...');

      if (this.config.dryRun) {
        logger.info('DRY RUN MODE - Simulating sync without Google API calls');
        // In dry run mode, simulate actions without fetching real data
        const simulatedActions = this.simulateActions(students);
        logger.info(`Would perform ${simulatedActions.length} actions`);
        this.printDryRunSummary(simulatedActions);
        summary.totalProcessed = simulatedActions.length;
        return summary;
      }

      const existingUsers = await this.fetchExistingUsers();
      logger.info(`Found ${existingUsers.length} existing users`);

      const existingDevices = await this.fetchExistingDevices(students);
      logger.info(`Found ${existingDevices.size} existing devices`);

      await this.ensureRequiredOUs(students);

      const actions = this.determineActions(students, existingUsers, existingDevices);
      logger.info(`Determined ${actions.length} actions to perform`);

      const deactivateCount = actions.filter((a) => a.type === 'deactivate').length;
      if (deactivateCount > this.config.requireConfirmationThreshold) {
        const confirmed = await this.confirmBulkDeactivation(deactivateCount);
        if (!confirmed) {
          logger.info('Bulk deactivation cancelled by user');
          return summary;
        }
      }

      const results = await this.executeActions(actions);

      for (const result of results) {
        summary.results.push(result);
        summary.totalProcessed++;

        if (result.success) {
          switch (result.action.type) {
            case 'create':
              summary.created++;
              break;
            case 'move':
              summary.moved++;
              break;
            case 'deactivate':
              summary.deactivated++;
              break;
            case 'update':
              summary.updated++;
              break;
          }
        } else {
          summary.errors++;
        }
      }

      summary.endTime = new Date();
      summary.duration = summary.endTime.getTime() - startTime.getTime();

      this.printSummary(summary);

      return summary;
    } catch (error) {
      logger.error(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private async fetchExistingUsers(): Promise<GoogleUser[]> {
    const studentOUPath = this.ouManager.getSchoolLevelOUPath('elementary').replace(
      '/elementary',
      '',
    );
    const query = `orgUnitPath='${studentOUPath}'`;
    return await this.googleAPI.listUsers(query);
  }

  private async fetchExistingDevices(students: Student[]): Promise<Map<string, ChromeDevice>> {
    const serialNumbers = students
      .filter((student) => student.deviceSerial)
      .map((student) => student.deviceSerial!);

    if (serialNumbers.length === 0) {
      return new Map();
    }

    return await this.googleAPI.batchGetChromeDevices(serialNumbers);
  }

  private async ensureRequiredOUs(students: Student[]): Promise<void> {
    const requiredOUs = this.ouManager.getRequiredOUs(students);
    const existingOUs = await this.googleAPI.listOrganizationalUnits();
    const existingPaths = new Set(existingOUs.map((ou) => ou.orgUnitPath));

    const missingOUs = Array.from(requiredOUs).filter((path) => !existingPaths.has(path));

    missingOUs.sort((a, b) => a.split('/').length - b.split('/').length);

    for (const ouPath of missingOUs) {
      const parts = ouPath.split('/').filter((p) => p);
      const name = parts[parts.length - 1];
      const parentPath = '/' + parts.slice(0, -1).join('/');

      if (!this.config.dryRun) {
        logger.info(`Creating OU: ${ouPath}`);
        await this.googleAPI.createOrganizationalUnit({
          name,
          parentOrgUnitPath: parentPath,
        });
      } else {
        logger.info(`[DRY RUN] Would create OU: ${ouPath}`);
      }
    }
  }

  private determineActions(
    students: Student[],
    existingUsers: GoogleUser[],
    existingDevices: Map<string, ChromeDevice>,
  ): SyncAction[] {
    const actions: SyncAction[] = [];
    const studentsByEmail = new Map<string, Student>();
    const studentsByStudentId = new Map<string, Student>();

    for (const student of students) {
      if (student.email) {
        studentsByEmail.set(student.email.toLowerCase(), student);
      }
      studentsByStudentId.set(student.studentId, student);
    }

    const processedEmails = new Set<string>();

    for (const user of existingUsers) {
      const email = user.primaryEmail.toLowerCase();
      processedEmails.add(email);

      const student = studentsByEmail.get(email) ||
        this.findStudentByExternalId(user, studentsByStudentId);

      if (student) {
        const status = this.ouManager.getStudentStatus(student);

        if (status === 'active') {
          const targetOU = this.ouManager.getStudentOUPath(student);

          if (this.ouManager.shouldMoveStudent(student, user.orgUnitPath)) {
            actions.push({
              type: 'move',
              student,
              currentUser: user,
              targetOUPath: targetOU,
              reason: `Move from ${user.orgUnitPath} to ${targetOU}`,
            });
          }
        } else {
          if (!user.suspended) {
            actions.push({
              type: 'deactivate',
              student,
              currentUser: user,
              targetOUPath: user.orgUnitPath || '',
              reason: `Student ${status}`,
            });
          }
        }
      } else {
        if (this.ouManager.isActiveStudentOU(user.orgUnitPath || '') && !user.suspended) {
          actions.push({
            type: 'deactivate',
            student: this.createPlaceholderStudent(user),
            currentUser: user,
            targetOUPath: user.orgUnitPath || '',
            reason: 'Not found in enrollment data',
          });
        }
      }
    }

    for (const student of students) {
      const status = this.ouManager.getStudentStatus(student);
      if (
        status === 'active' && student.email && !processedEmails.has(student.email.toLowerCase())
      ) {
        actions.push({
          type: 'create',
          student,
          targetOUPath: this.ouManager.getStudentOUPath(student),
          reason: 'New student',
        });
      }
    }

    // Add device synchronization actions
    this.addDeviceSyncActions(actions, students, existingDevices);

    if (this.config.createOnly) {
      return actions.filter((a) => a.type === 'create');
    }
    if (this.config.moveOnly) {
      return actions.filter((a) => a.type === 'move');
    }
    if (this.config.deactivateOnly) {
      return actions.filter((a) => a.type === 'deactivate');
    }

    return actions;
  }

  private findStudentByExternalId(
    user: GoogleUser,
    studentsByStudentId: Map<string, Student>,
  ): Student | undefined {
    if (!user.externalIds) return undefined;

    for (const externalId of user.externalIds) {
      if (externalId.type === 'custom' && externalId.customType === 'student_id') {
        const student = studentsByStudentId.get(externalId.value);
        if (student) return student;
      }
    }

    return undefined;
  }

  private createPlaceholderStudent(user: GoogleUser): Student {
    return {
      studentId: user.id || 'unknown',
      firstName: user.name.givenName,
      lastName: user.name.familyName,
      grade: 'unknown',
      email: user.primaryEmail,
      graduationYear: 0,
    };
  }

  private simulateActions(students: Student[]): SyncAction[] {
    const actions: SyncAction[] = [];

    // In dry run mode, assume all students are new and need to be created
    for (const student of students) {
      const status = this.ouManager.getStudentStatus(student);
      if (status === 'active') {
        actions.push({
          type: 'create',
          student,
          targetOUPath: this.ouManager.getStudentOUPath(student),
          reason: 'New student (simulated)',
        });

        // If student has a device, simulate device move action
        if (student.deviceSerial) {
          actions.push({
            type: 'move_device',
            student,
            targetOUPath: this.ouManager.getStudentOUPath(student),
            reason: `Move device ${student.deviceSerial} to student OU (simulated)`,
          });
        }
      } else {
        actions.push({
          type: 'deactivate',
          student,
          targetOUPath: this.ouManager.getStudentOUPath(student),
          reason: `Student ${status} (simulated)`,
        });
      }
    }

    return actions;
  }

  private addDeviceSyncActions(
    actions: SyncAction[],
    students: Student[],
    existingDevices: Map<string, ChromeDevice>,
  ): void {
    for (const student of students) {
      if (!student.deviceSerial) {
        continue; // Skip students without assigned devices
      }

      const device = existingDevices.get(student.deviceSerial);
      if (!device) {
        logger.warn(`Device ${student.deviceSerial} not found for student ${student.studentId}`);
        continue;
      }

      const status = this.ouManager.getStudentStatus(student);
      if (status !== 'active') {
        continue; // Only sync devices for active students
      }

      const targetOUPath = this.ouManager.getStudentOUPath(student);

      // Check if device needs to be moved
      if (device.orgUnitPath !== targetOUPath) {
        actions.push({
          type: 'move_device',
          student,
          currentDevice: device,
          targetOUPath,
          reason: `Move device from ${device.orgUnitPath || 'unknown'} to ${targetOUPath}`,
        });
      }
    }
  }

  private async executeActions(actions: SyncAction[]): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    const batchSize = this.config.maxConcurrentRequests;

    for (let i = 0; i < actions.length; i += batchSize) {
      const batch = actions.slice(i, i + batchSize);
      const batchPromises = batch.map((action) => this.executeAction(action));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  private async executeAction(action: SyncAction): Promise<SyncResult> {
    try {
      logger.info(
        `Executing ${action.type} for ${action.student.email || action.student.studentId}`,
      );

      switch (action.type) {
        case 'create':
          await this.createUser(action);
          break;
        case 'move':
          await this.moveUser(action);
          break;
        case 'deactivate':
          await this.deactivateUser(action);
          break;
        case 'update':
          await this.updateUser(action);
          break;
        case 'move_device':
          await this.moveDevice(action);
          break;
      }

      return {
        success: true,
        action,
      };
    } catch (error) {
      logger.error(
        `Failed to ${action.type} user: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return {
        success: false,
        action,
        error: error instanceof Error ? error : new Error('Unknown error'),
      };
    }
  }

  private async createUser(action: SyncAction): Promise<void> {
    const { student, targetOUPath } = action;

    if (!student.email) {
      student.email = this.ouManager.generateEmailAddress(student, this.config.googleDomain, this.config.emailConfig);
    }

    const newUser: GoogleUser = {
      primaryEmail: student.email,
      name: {
        givenName: student.firstName,
        familyName: student.lastName,
      },
      password: this.generatePassword(student),
      changePasswordAtNextLogin: true,
      orgUnitPath: targetOUPath,
      externalIds: [{
        value: student.studentId,
        type: 'custom',
        customType: 'student_id',
      }],
      customSchemas: {
        student_info: {
          graduation_year: student.graduationYear.toString(),
          enrollment_date: student.enrollmentDate || new Date().toISOString().split('T')[0],
          parent_email: student.parentEmail || '',
        },
      },
    };

    await this.googleAPI.createUser(newUser);
  }

  private async moveUser(action: SyncAction): Promise<void> {
    if (!action.currentUser) {
      throw new Error('Current user not provided for move action');
    }

    await this.googleAPI.moveUserToOU(
      action.currentUser.primaryEmail,
      action.targetOUPath,
    );
  }

  private async deactivateUser(action: SyncAction): Promise<void> {
    if (!action.currentUser) {
      throw new Error('Current user not provided for deactivate action');
    }

    await this.googleAPI.suspendUser(action.currentUser.primaryEmail);
  }

  private async updateUser(action: SyncAction): Promise<void> {
    if (!action.currentUser) {
      throw new Error('Current user not provided for update action');
    }

    const updates: Partial<GoogleUser> = {
      externalIds: [{
        value: action.student.studentId,
        type: 'custom',
        customType: 'student_id',
      }],
    };

    await this.googleAPI.updateUser(action.currentUser.primaryEmail, updates);
  }

  private async moveDevice(action: SyncAction): Promise<void> {
    if (!action.currentDevice || !action.currentDevice.deviceId) {
      throw new Error('Current device or device ID not provided for move device action');
    }

    await this.googleAPI.moveChromeDeviceToOU(
      action.currentDevice.deviceId,
      action.targetOUPath,
    );
  }

  private generatePassword(student: Student): string {
    // Get password configuration from config or use backward compatibility
    const passwordConfig = this.config.passwordConfig || this.getDefaultPasswordConfig();

    switch (passwordConfig.type) {
      case 'prefix_studentid':
        return this.generatePrefixStudentIdPassword(student.studentId, passwordConfig);
      case 'random':
        return this.generateRandomPassword(passwordConfig);
      case 'custom_function':
        return this.generateCustomPatternPassword(student, passwordConfig);
      default:
        // Fallback to original method for backward compatibility
        return this.generatePrefixStudentIdPassword(student.studentId, {
          type: 'prefix_studentid',
          prefix: this.config.passwordPrefix || 'lh00',
        });
    }
  }

  private getDefaultPasswordConfig(): PasswordConfig {
    return {
      type: 'prefix_studentid',
      prefix: this.config.passwordPrefix || 'lh00',
    };
  }

  private generatePrefixStudentIdPassword(studentId: string, config: PasswordConfig): string {
    // Extract numeric part from student ID (e.g., "STU001" -> "001", "12345" -> "2345")
    const numericPart = studentId.replace(/\D/g, ''); // Remove non-digits

    // Take last 4 digits, pad with zeros if needed
    const last4Digits = numericPart.slice(-4).padStart(4, '0');

    const prefix = config.prefix || 'lh00';
    return `${prefix}${last4Digits}`;
  }

  private generateRandomPassword(config: PasswordConfig): string {
    const length = config.length || 12;
    const chars = this.buildCharacterSet(config);

    if (chars.length === 0) {
      throw new Error('No character sets enabled for random password generation');
    }

    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return password;
  }

  private generateCustomPatternPassword(student: Student, config: PasswordConfig): string {
    if (!config.customPattern) {
      throw new Error('Custom pattern not provided for custom_function password type');
    }

    return config.customPattern
      .replace('{firstName}', student.firstName.toLowerCase())
      .replace('{lastName}', student.lastName.toLowerCase())
      .replace('{studentId}', student.studentId)
      .replace('{graduationYear}', student.graduationYear.toString())
      .replace('{firstInitial}', student.firstName.charAt(0).toLowerCase())
      .replace('{lastInitial}', student.lastName.charAt(0).toLowerCase());
  }

  private buildCharacterSet(config: PasswordConfig): string {
    let chars = '';

    if (config.includeUppercase !== false) { // Default to true
      chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    }

    if (config.includeLowercase !== false) { // Default to true
      chars += 'abcdefghijklmnopqrstuvwxyz';
    }

    if (config.includeNumbers !== false) { // Default to true
      chars += '0123456789';
    }

    if (config.includeSymbols) { // Default to false
      chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    }

    return chars;
  }

  private async confirmBulkDeactivation(count: number): Promise<boolean> {
    logger.warn(`WARNING: About to deactivate ${count} users`);
    logger.warn('This action requires manual confirmation');

    if (Deno.stdin.isTerminal()) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      await Deno.stdout.write(
        encoder.encode(`Type "yes" to confirm deactivation of ${count} users: `),
      );

      const buf = new Uint8Array(1024);
      const n = await Deno.stdin.read(buf);
      if (n === null) return false;

      const answer = decoder.decode(buf.subarray(0, n)).trim().toLowerCase();
      return answer === 'yes';
    }

    return false;
  }

  private printDryRunSummary(actions: SyncAction[]): void {
    const summary = {
      create: actions.filter((a) => a.type === 'create').length,
      move: actions.filter((a) => a.type === 'move').length,
      deactivate: actions.filter((a) => a.type === 'deactivate').length,
      update: actions.filter((a) => a.type === 'update').length,
      move_device: actions.filter((a) => a.type === 'move_device').length,
    };

    logger.info('\n=== DRY RUN SUMMARY ===');
    logger.info(`Users to create: ${summary.create}`);
    logger.info(`Users to move: ${summary.move}`);
    logger.info(`Users to deactivate: ${summary.deactivate}`);
    logger.info(`Users to update: ${summary.update}`);
    logger.info(`Devices to move: ${summary.move_device}`);
    logger.info(`Total actions: ${actions.length}`);

    if (actions.length > 0 && actions.length <= 20) {
      logger.info('\nDetailed actions:');
      for (const action of actions) {
        logger.info(
          `  ${action.type}: ${
            action.student.email || action.student.studentId
          } - ${action.reason}`,
        );
      }
    }
  }

  private printSummary(summary: SyncSummary): void {
    logger.info('\n=== SYNC SUMMARY ===');
    logger.info(`Total processed: ${summary.totalProcessed}`);
    logger.info(`Created: ${summary.created}`);
    logger.info(`Moved: ${summary.moved}`);
    logger.info(`Deactivated: ${summary.deactivated}`);
    logger.info(`Updated: ${summary.updated}`);
    logger.info(`Errors: ${summary.errors}`);

    if (summary.duration) {
      const seconds = Math.round(summary.duration / 1000);
      logger.info(`Duration: ${seconds} seconds`);
    }

    if (summary.errors > 0) {
      logger.error('\nErrors encountered:');
      for (const result of summary.results.filter((r) => !r.success)) {
        logger.error(
          `  ${result.action.type} ${
            result.action.student.email || result.action.student.studentId
          }: ${result.error?.message}`,
        );
      }
    }
  }
}
