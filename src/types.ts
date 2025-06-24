export interface Student {
  studentId: string;
  firstName: string;
  lastName: string;
  grade: string;
  email?: string;
  graduationYear: number;
  enrollmentDate?: string;
  parentEmail?: string;
  status?: 'active' | 'transferred' | 'graduated';
  deviceSerial?: string;
}

export enum CSVColumns {
  CUR_SCHOOL_NAME = 0,
  STU_LEGAL_FIRST = 1,
  STU_LEGAL_LAST = 2,
  CUR_SCHOOL_NAME_DUPLICATE = 3,
  CUR_SCHOOL_CODE = 4,
  ENTITY_ID = 5,
  STUDENT_ID = 6,
  SCHL_EMAIL_ADDR = 7,
  GRADUATED = 8,
  STUDENT_GRADE = 9,
  PROP_GRAD_DATE = 10,
  STU_GRAD_YR = 11,
  DEVICE_SERIAL = 12,
}

export type CSVRow = string[];

export interface GoogleUser {
  kind?: string;
  id?: string;
  etag?: string;
  primaryEmail: string;
  name: {
    givenName: string;
    familyName: string;
    fullName?: string;
  };
  isAdmin?: boolean;
  isDelegatedAdmin?: boolean;
  lastLoginTime?: string;
  creationTime?: string;
  agreedToTerms?: boolean;
  suspended?: boolean;
  archived?: boolean;
  changePasswordAtNextLogin?: boolean;
  ipWhitelisted?: boolean;
  emails?: Array<{
    address: string;
    type?: string;
    customType?: string;
    primary?: boolean;
  }>;
  aliases?: string[];
  nonEditableAliases?: string[];
  customerId?: string;
  orgUnitPath?: string;
  isMailboxSetup?: boolean;
  includeInGlobalAddressList?: boolean;
  externalIds?: Array<{
    value: string;
    type: string;
    customType?: string;
  }>;
  organizations?: Array<{
    name?: string;
    title?: string;
    primary?: boolean;
    type?: string;
    department?: string;
    description?: string;
  }>;
  customSchemas?: {
    [key: string]: {
      [field: string]: unknown;
    };
  };
  password?: string;
  recoveryEmail?: string;
  recoveryPhone?: string;
}

export interface OrganizationalUnit {
  kind?: string;
  name: string;
  description?: string;
  etag?: string;
  blockInheritance?: boolean;
  orgUnitId?: string;
  orgUnitPath?: string;
  parentOrgUnitId?: string;
  parentOrgUnitPath?: string;
}

export interface ChromeDevice {
  kind?: string;
  etag?: string;
  deviceId?: string;
  serialNumber?: string;
  status?: string;
  lastSync?: string;
  supportEndDate?: string;
  deviceType?: string;
  model?: string;
  meid?: string;
  orderNumber?: string;
  willAutoRenew?: boolean;
  osVersion?: string;
  platformVersion?: string;
  firmwareVersion?: string;
  macAddress?: string;
  bootMode?: string;
  lastEnrollmentTime?: string;
  orgUnitPath?: string;
  orgUnitId?: string;
  recentUsers?: Array<{
    type?: string;
    email?: string;
  }>;
  activeTimeRanges?: Array<{
    date?: string;
    activeTime?: number;
  }>;
  tpmVersionInfo?: {
    family?: string;
    specLevel?: string;
    manufacturer?: string;
    tpmModel?: string;
    firmwareVersion?: string;
    vendorSpecific?: string;
  };
  cpuStatusReports?: Array<{
    reportTime?: string;
    cpuUtilizationPercentageInfo?: number[];
    cpuTemperatureInfo?: Array<{
      temperature?: number;
      label?: string;
    }>;
  }>;
  systemRamTotal?: string;
  systemRamFreeReports?: Array<{
    reportTime?: string;
    systemRamFreeInfo?: string[];
  }>;
  diskVolumeReports?: Array<{
    volumeInfo?: Array<{
      volumeId?: string;
      storageFree?: string;
      storageTotal?: string;
    }>;
  }>;
  notes?: string;
}

export interface SyncAction {
  type: 'create' | 'move' | 'deactivate' | 'update' | 'move_device';
  student: Student;
  currentUser?: GoogleUser;
  currentDevice?: ChromeDevice;
  targetOUPath: string;
  reason: string;
}

export interface SyncResult {
  success: boolean;
  action: SyncAction;
  error?: Error;
  details?: unknown;
}

export interface SyncSummary {
  totalProcessed: number;
  created: number;
  moved: number;
  deactivated: number;
  updated: number;
  errors: number;
  results: SyncResult[];
  startTime: Date;
  endTime?: Date;
  duration?: number;
}

export interface EmailConfig {
  graduationYearFormat: 'two-digit' | 'four-digit';
  separator?: string;
}

export interface PasswordConfig {
  type: 'prefix_studentid' | 'random' | 'custom_function';
  prefix?: string;
  length?: number;
  includeUppercase?: boolean;
  includeLowercase?: boolean;
  includeNumbers?: boolean;
  includeSymbols?: boolean;
  customPattern?: string;
}

export interface Config {
  googleServiceAccountKeyFile: string;
  googleDomain: string;
  googleDelegatedUser: string;
  studentCsvFile: string;
  dryRun: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  maxConcurrentRequests: number;
  retryAttempts: number;
  retryDelayMs: number;
  requireConfirmationThreshold: number;
  enableBackup: boolean;
  backupDir: string;
  createOnly?: boolean;
  moveOnly?: boolean;
  deactivateOnly?: boolean;
  passwordConfig?: PasswordConfig;
  emailConfig?: EmailConfig;
  ouRoot?: string;
  // Keep for backward compatibility
  passwordPrefix?: string;
}

export interface OUMapping {
  grade: string;
  schoolLevel: 'elementary' | 'middle' | 'high';
  graduationYear: number;
}

export interface StudentComputerOU {
  studentOUPath: string;
  computerOUPath: string;
}

export interface APIError {
  code: number;
  message: string;
  errors?: Array<{
    domain: string;
    reason: string;
    message: string;
  }>;
}

export type SchoolLevel = 'elementary' | 'middle' | 'high';

export interface GradeMapping {
  [grade: string]: {
    schoolLevel: SchoolLevel;
    gradeNumber: number;
  };
}
