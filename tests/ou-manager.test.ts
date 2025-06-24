import { assertEquals, assertThrows } from '@std/testing';
import { OUManager } from '../src/ou-manager.ts';
import { EmailConfig, Student } from '../src/types.ts';

Deno.test('OUManager - getSchoolLevel', () => {
  const ouManager = new OUManager();

  assertEquals(ouManager.getSchoolLevel('4K'), 'elementary');
  assertEquals(ouManager.getSchoolLevel('K'), 'elementary');
  assertEquals(ouManager.getSchoolLevel('5'), 'elementary');
  assertEquals(ouManager.getSchoolLevel('6'), 'middle');
  assertEquals(ouManager.getSchoolLevel('8'), 'middle');
  assertEquals(ouManager.getSchoolLevel('9'), 'high');
  assertEquals(ouManager.getSchoolLevel('12'), 'high');

  assertThrows(() => ouManager.getSchoolLevel('13'), Error, 'Invalid grade: 13');
});

Deno.test('OUManager - getStudentOUPath', () => {
  const ouManager = new OUManager();

  const student: Student = {
    studentId: 'STU001',
    firstName: 'John',
    lastName: 'Doe',
    grade: '9',
    graduationYear: 2028,
  };

  const expectedPath = '/org/student/high/2028/john.doe';
  assertEquals(ouManager.getStudentOUPath(student), expectedPath);
});

Deno.test('OUManager - calculateGraduationYear', () => {
  const ouManager = new OUManager();
  const testDate = new Date('2024-09-01');

  assertEquals(ouManager.calculateGraduationYear('4K', testDate), 2038);
  assertEquals(ouManager.calculateGraduationYear('K', testDate), 2037);
  assertEquals(ouManager.calculateGraduationYear('1', testDate), 2036);
  assertEquals(ouManager.calculateGraduationYear('6', testDate), 2031);
  assertEquals(ouManager.calculateGraduationYear('9', testDate), 2028);
  assertEquals(ouManager.calculateGraduationYear('12', testDate), 2025);
});

Deno.test('OUManager - generateEmailAddress', () => {
  const ouManager = new OUManager();

  const student: Student = {
    studentId: 'STU001',
    firstName: 'John',
    lastName: 'Doe',
    grade: '9',
    graduationYear: 2028,
  };

  const email = ouManager.generateEmailAddress(student, 'school.edu');
  assertEquals(email, 'john.doe2028@school.edu');

  const studentWithSpecialChars: Student = {
    studentId: 'STU002',
    firstName: 'Mary-Jane',
    lastName: "O'Brien",
    grade: '6',
    graduationYear: 2031,
  };

  const email2 = ouManager.generateEmailAddress(studentWithSpecialChars, 'school.edu');
  assertEquals(email2, 'maryjane.obrien2031@school.edu');
});

Deno.test('OUManager - generateEmailAddress with two-digit year format', () => {
  const ouManager = new OUManager();

  const student: Student = {
    studentId: 'STU001',
    firstName: 'John',
    lastName: 'Doe',
    grade: '9',
    graduationYear: 2028,
  };

  // Two-digit format with dot separator
  const emailConfig1: EmailConfig = {
    graduationYearFormat: 'two-digit',
    separator: '.',
  };
  const email1 = ouManager.generateEmailAddress(student, 'school.edu', emailConfig1);
  assertEquals(email1, 'john.doe.28@school.edu');

  // Two-digit format without separator
  const emailConfig2: EmailConfig = {
    graduationYearFormat: 'two-digit',
  };
  const email2 = ouManager.generateEmailAddress(student, 'school.edu', emailConfig2);
  assertEquals(email2, 'john.doe28@school.edu');

  // Four-digit format (backward compatibility)
  const emailConfig3: EmailConfig = {
    graduationYearFormat: 'four-digit',
  };
  const email3 = ouManager.generateEmailAddress(student, 'school.edu', emailConfig3);
  assertEquals(email3, 'john.doe2028@school.edu');

  // Default behavior (no config provided)
  const email4 = ouManager.generateEmailAddress(student, 'school.edu');
  assertEquals(email4, 'john.doe2028@school.edu');
});

Deno.test('OUManager - shouldMoveStudent', () => {
  const ouManager = new OUManager();

  const student: Student = {
    studentId: 'STU001',
    firstName: 'John',
    lastName: 'Doe',
    grade: '9',
    graduationYear: 2028,
  };

  assertEquals(ouManager.shouldMoveStudent(student, undefined), true);
  assertEquals(ouManager.shouldMoveStudent(student, '/org/student/high/2028/john.doe'), false);
  assertEquals(ouManager.shouldMoveStudent(student, '/org/student/middle/2028/john.doe'), true);
  assertEquals(ouManager.shouldMoveStudent(student, '/org/student/high/2027/john.doe'), true);
});

Deno.test('OUManager - parseOUPath', () => {
  const ouManager = new OUManager();

  const result1 = ouManager.parseOUPath('/org/student/high/2028/john.doe');
  assertEquals(result1.schoolLevel, 'high');
  assertEquals(result1.graduationYear, 2028);
  assertEquals(result1.studentId, 'john.doe');

  const result2 = ouManager.parseOUPath('/org/student/middle/2031');
  assertEquals(result2.schoolLevel, 'middle');
  assertEquals(result2.graduationYear, 2031);
  assertEquals(result2.studentId, undefined);

  const result3 = ouManager.parseOUPath('/org/other/path');
  assertEquals(result3.schoolLevel, undefined);
  assertEquals(result3.graduationYear, undefined);
  assertEquals(result3.studentId, undefined);
});

Deno.test('OUManager - getRequiredOUs', () => {
  const ouManager = new OUManager();

  const students: Student[] = [
    {
      studentId: 'STU001',
      firstName: 'John',
      lastName: 'Doe',
      grade: '9',
      graduationYear: 2028,
    },
    {
      studentId: 'STU002',
      firstName: 'Jane',
      lastName: 'Smith',
      grade: '6',
      graduationYear: 2031,
    },
    {
      studentId: 'STU003',
      firstName: 'Bob',
      lastName: 'Johnson',
      grade: '9',
      graduationYear: 2028,
    },
  ];

  const requiredOUs = ouManager.getRequiredOUs(students);
  const ouPaths = Array.from(requiredOUs).sort();

  assertEquals(ouPaths.includes('/org/student/high'), true);
  assertEquals(ouPaths.includes('/org/student/middle'), true);
  assertEquals(ouPaths.includes('/org/student/high/2028'), true);
  assertEquals(ouPaths.includes('/org/student/middle/2031'), true);
  assertEquals(ouPaths.includes('/org/student/high/2028/john.doe'), true);
  assertEquals(ouPaths.includes('/org/student/middle/2031/jane.smith'), true);
  assertEquals(ouPaths.includes('/org/student/high/2028/bob.johnson'), true);
});

Deno.test('OUManager - configurable OU root', () => {
  const customOuManager = new OUManager('/test');

  const student: Student = {
    studentId: 'STU001',
    firstName: 'John',
    lastName: 'Doe',
    grade: '9',
    graduationYear: 2028,
  };

  const expectedPath = '/test/high/2028/john.doe';
  assertEquals(customOuManager.getStudentOUPath(student), expectedPath);

  // Test parseOUPath with custom root
  const result = customOuManager.parseOUPath('/test/high/2028/john.doe');
  assertEquals(result.schoolLevel, 'high');
  assertEquals(result.graduationYear, 2028);
  assertEquals(result.studentId, 'john.doe');

  // Test parseOUPath with wrong root returns empty result
  const wrongResult = customOuManager.parseOUPath('/org/student/high/2028/john.doe');
  assertEquals(wrongResult.schoolLevel, undefined);
  assertEquals(wrongResult.graduationYear, undefined);
  assertEquals(wrongResult.studentId, undefined);

  // Test getRequiredOUs with custom root
  const requiredOUs = customOuManager.getRequiredOUs([student]);
  const ouPaths = Array.from(requiredOUs).sort();

  assertEquals(ouPaths.includes('/test/high'), true);
  assertEquals(ouPaths.includes('/test/high/2028'), true);
  assertEquals(ouPaths.includes('/test/high/2028/john.doe'), true);
  assertEquals(ouPaths.includes('/org/student/high'), false);
});
