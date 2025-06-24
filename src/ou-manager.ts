import { GradeMapping, SchoolLevel, Student } from './types.ts';

export class OUManager {
  private readonly baseStudentOU: string;
  constructor(ouRoot: string = '/org/student') {
    this.baseStudentOU = ouRoot;
  }

  private readonly gradeMapping: GradeMapping = {
    '4K': { schoolLevel: 'elementary', gradeNumber: -1 },
    'K': { schoolLevel: 'elementary', gradeNumber: 0 },
    '1': { schoolLevel: 'elementary', gradeNumber: 1 },
    '2': { schoolLevel: 'elementary', gradeNumber: 2 },
    '3': { schoolLevel: 'elementary', gradeNumber: 3 },
    '4': { schoolLevel: 'elementary', gradeNumber: 4 },
    '5': { schoolLevel: 'elementary', gradeNumber: 5 },
    '6': { schoolLevel: 'middle', gradeNumber: 6 },
    '7': { schoolLevel: 'middle', gradeNumber: 7 },
    '8': { schoolLevel: 'middle', gradeNumber: 8 },
    '9': { schoolLevel: 'high', gradeNumber: 9 },
    '10': { schoolLevel: 'high', gradeNumber: 10 },
    '11': { schoolLevel: 'high', gradeNumber: 11 },
    '12': { schoolLevel: 'high', gradeNumber: 12 },
  };

  getSchoolLevel(grade: string): SchoolLevel {
    const mapping = this.gradeMapping[grade];
    if (!mapping) {
      throw new Error(`Invalid grade: ${grade}`);
    }
    return mapping.schoolLevel;
  }

  getSchoolLevelFromGradYear(graduationYear: number): SchoolLevel {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const isBeforeSchoolYearEnd = currentMonth < 6;
    const currentSchoolYear = isBeforeSchoolYearEnd ? currentYear - 1 : currentYear;

    const yearsUntilGraduation = graduationYear - currentSchoolYear;

    // Determine school level based on years until graduation
    // 12th grade graduates this year (yearsUntilGraduation = 1)
    // 9th grade graduates in 4 years (yearsUntilGraduation = 4)
    // K graduates in 13 years (yearsUntilGraduation = 13)

    if (yearsUntilGraduation <= 4) {
      return 'high'; // 9th-12th grade
    } else if (yearsUntilGraduation <= 7) {
      return 'middle'; // 6th-8th grade
    } else {
      return 'elementary'; // K-5th grade
    }
  }

  generateStudentOUName(student: Student): string {
    // Create a clean OU name from student's first and last name
    const firstName = student.firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const lastName = student.lastName.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Format: firstname.lastname (e.g., "john.smith")
    return `${firstName}.${lastName}`;
  }

  getStudentOUPath(student: Student): string {
    const schoolLevel = this.getSchoolLevelFromGradYear(student.graduationYear);
    const graduationYear = student.graduationYear;
    const studentName = this.generateStudentOUName(student);

    return `${this.baseStudentOU}/${schoolLevel}/${graduationYear}/${studentName}`;
  }

  getStudentComputerOUPath(studentOUPath: string): string {
    return studentOUPath;
  }

  getSchoolLevelOUPath(schoolLevel: SchoolLevel): string {
    return `${this.baseStudentOU}/${schoolLevel}`;
  }

  getGraduationYearOUPath(schoolLevel: SchoolLevel, graduationYear: number): string {
    return `${this.baseStudentOU}/${schoolLevel}/${graduationYear}`;
  }

  parseOUPath(ouPath: string): {
    schoolLevel?: SchoolLevel;
    graduationYear?: number;
    studentId?: string;
  } {
    const result: {
      schoolLevel?: SchoolLevel;
      graduationYear?: number;
      studentId?: string;
    } = {};

    // Check if the path starts with our base OU path
    if (!ouPath.startsWith(this.baseStudentOU)) {
      return result;
    }

    // Remove the base path and split the remaining parts
    const relativePath = ouPath.substring(this.baseStudentOU.length);
    const parts = relativePath.split('/').filter((p) => p);

    if (parts.length >= 1) {
      const schoolLevel = parts[0];
      if (this.isValidSchoolLevel(schoolLevel)) {
        result.schoolLevel = schoolLevel as SchoolLevel;
      }

      if (parts.length >= 2) {
        const year = parseInt(parts[1], 10);
        if (!isNaN(year)) {
          result.graduationYear = year;
        }
      }

      if (parts.length >= 3) {
        result.studentId = parts[2];
      }
    }

    return result;
  }

  private isValidSchoolLevel(level: string): boolean {
    return ['elementary', 'middle', 'high'].includes(level);
  }

  shouldMoveStudent(student: Student, currentOUPath?: string): boolean {
    if (!currentOUPath) {
      return true;
    }

    const expectedPath = this.getStudentOUPath(student);
    return currentOUPath !== expectedPath;
  }

  getRequiredOUs(students: Student[]): Set<string> {
    const requiredOUs = new Set<string>();

    const schoolLevels = new Set<SchoolLevel>();
    const yearsBySchool = new Map<SchoolLevel, Set<number>>();

    for (const student of students) {
      const schoolLevel = this.getSchoolLevel(student.grade);
      schoolLevels.add(schoolLevel);

      if (!yearsBySchool.has(schoolLevel)) {
        yearsBySchool.set(schoolLevel, new Set<number>());
      }
      yearsBySchool.get(schoolLevel)!.add(student.graduationYear);

      requiredOUs.add(this.getStudentOUPath(student));
    }

    for (const schoolLevel of schoolLevels) {
      requiredOUs.add(this.getSchoolLevelOUPath(schoolLevel));

      const years = yearsBySchool.get(schoolLevel);
      if (years) {
        for (const year of years) {
          requiredOUs.add(this.getGraduationYearOUPath(schoolLevel, year));
        }
      }
    }

    return requiredOUs;
  }

  calculateGraduationYear(grade: string, currentDate: Date = new Date()): number {
    const mapping = this.gradeMapping[grade];
    if (!mapping) {
      throw new Error(`Invalid grade: ${grade}`);
    }

    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const isBeforeSchoolYearEnd = currentMonth < 6;
    const currentSchoolYear = isBeforeSchoolYearEnd ? currentYear - 1 : currentYear;

    const yearsUntilGraduation = 12 - mapping.gradeNumber;
    const graduationYear = currentSchoolYear + yearsUntilGraduation + 1;

    return graduationYear;
  }

  generateEmailAddress(student: Student, domain: string): string {
    const firstName = student.firstName.toLowerCase().replace(/[^a-z]/g, '');
    const lastName = student.lastName.toLowerCase().replace(/[^a-z]/g, '');
    const year = student.graduationYear;

    return `${firstName}.${lastName}${year}@${domain}`;
  }

  getHiddenAliasOUPath(): string {
    return `${this.baseStudentOU}/hidden_aliases`;
  }

  isStudentOU(ouPath: string): boolean {
    return ouPath.startsWith(this.baseStudentOU);
  }

  isActiveStudentOU(ouPath: string): boolean {
    if (!this.isStudentOU(ouPath)) {
      return false;
    }

    return !ouPath.includes('hidden_aliases') &&
      !ouPath.includes('archived') &&
      !ouPath.includes('suspended');
  }

  getStudentStatus(student: Student): 'active' | 'graduated' | 'transferred' {
    if (student.status) {
      return student.status;
    }

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const hasGraduated = student.graduationYear < currentYear ||
      (student.graduationYear === currentYear && currentMonth >= 6);

    return hasGraduated ? 'graduated' : 'active';
  }
}
