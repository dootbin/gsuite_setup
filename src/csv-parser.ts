import { CSVColumns, CSVRow, Student } from './types.ts';

export class CSVParser {
  private expectedColumnCount = 12;

  async parseStudentFile(filePath: string, hasHeaders = true): Promise<Student[]> {
    try {
      const fileContent = await Deno.readTextFile(filePath);
      return this.parseCSVContent(fileContent, hasHeaders);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(`CSV file not found: ${filePath}`);
      }
      throw new Error(
        `Failed to read CSV file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  parseCSVContent(content: string, hasHeaders = true): Student[] {
    const lines = content.trim().split('\n');

    if (lines.length === 0) {
      throw new Error('CSV file is empty');
    }

    const dataLines = hasHeaders ? lines.slice(1) : lines;

    if (dataLines.length === 0) {
      throw new Error('No data rows found in CSV');
    }

    return dataLines.map((line, index) => {
      try {
        const row = this.parseLine(line);
        this.validateRowLength(row, index + (hasHeaders ? 2 : 1));
        return this.transformRow(row);
      } catch (error) {
        throw new Error(
          `Error parsing row ${index + (hasHeaders ? 2 : 1)}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    });
  }

  private parseLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  private validateRowLength(row: string[], rowNumber: number): void {
    if (row.length < this.expectedColumnCount) {
      throw new Error(
        `Row ${rowNumber}: Expected ${this.expectedColumnCount} columns, got ${row.length}`,
      );
    }
  }

  private transformRow(row: CSVRow): Student {
    const student: Student = {
      studentId: this.validateRequired(row[CSVColumns.STUDENT_ID], 'Student ID'),
      firstName: this.validateRequired(row[CSVColumns.STU_LEGAL_FIRST], 'Stu Legal First'),
      lastName: this.validateRequired(row[CSVColumns.STU_LEGAL_LAST], 'Stu Legal Last'),
      grade: row[CSVColumns.STUDENT_GRADE] || 'unknown', // Don't validate grade since we use graduation year
      graduationYear: this.parseGraduationYear(row[CSVColumns.STU_GRAD_YR]),
    };

    if (row[CSVColumns.SCHL_EMAIL_ADDR] && row[CSVColumns.SCHL_EMAIL_ADDR].trim()) {
      student.email = this.validateEmail(row[CSVColumns.SCHL_EMAIL_ADDR]);
    }

    if (row[CSVColumns.PROP_GRAD_DATE] && row[CSVColumns.PROP_GRAD_DATE].trim()) {
      student.enrollmentDate = row[CSVColumns.PROP_GRAD_DATE];
    }

    if (row[CSVColumns.GRADUATED] && row[CSVColumns.GRADUATED].trim()) {
      const graduated = row[CSVColumns.GRADUATED].toLowerCase();
      if (graduated === 'true' || graduated === 'yes' || graduated === '1') {
        student.status = 'graduated';
      }
    }

    if (row[CSVColumns.DEVICE_SERIAL] && row[CSVColumns.DEVICE_SERIAL].trim()) {
      student.deviceSerial = row[CSVColumns.DEVICE_SERIAL].trim();
    }

    return student;
  }

  private validateRequired(value: string | undefined, fieldName: string): string {
    if (!value || value.trim() === '') {
      throw new Error(`${fieldName} is required`);
    }
    return value.trim();
  }

  private parseGraduationYear(year: string): number {
    const graduationYear = parseInt(year, 10);

    if (isNaN(graduationYear)) {
      throw new Error(`Invalid graduation year: ${year}`);
    }

    const currentYear = new Date().getFullYear();
    const minYear = currentYear;
    const maxYear = currentYear + 15;

    if (graduationYear < minYear || graduationYear > maxYear) {
      throw new Error(
        `Graduation year ${graduationYear} is out of range (${minYear}-${maxYear})`,
      );
    }

    return graduationYear;
  }

  private validateEmail(email: string): string {
    const trimmed = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(trimmed)) {
      throw new Error(`Invalid email format: ${email}`);
    }

    return trimmed;
  }

  generateSampleCSV(): string {
    const headers = [
      'Cur School Name',
      'Stu Legal First',
      'Stu Legal Last',
      'Cur School Name',
      'Cur School Code',
      'Entity ID',
      'Student ID',
      'Schl Email Addr',
      'Graduated',
      'Student Grade',
      'Prop Grad Date',
      'Stu Grad Yr',
      'Device Serial',
    ];

    const sampleData = [
      [
        'Example Elementary',
        'John',
        'Doe',
        'Example Elementary',
        'EE01',
        'ENT001',
        'STU001',
        'john.doe2028@school.edu',
        'false',
        '9',
        '2028-06-15',
        '2028',
        'CHR001234567',
      ],
      [
        'Example Middle',
        'Jane',
        'Smith',
        'Example Middle',
        'EM01',
        'ENT002',
        'STU002',
        'jane.smith2031@school.edu',
        'false',
        '6',
        '2031-06-15',
        '2031',
        'CHR002345678',
      ],
      [
        'Example High',
        'Bob',
        'Johnson',
        'Example High',
        'EH01',
        'ENT003',
        'STU003',
        'bob.johnson2025@school.edu',
        'false',
        '12',
        '2025-06-15',
        '2025',
        'CHR003456789',
      ],
      [
        'Example Elementary',
        'Alice',
        'Williams',
        'Example Elementary',
        'EE01',
        'ENT004',
        'STU004',
        '',
        'false',
        '4K',
        '2038-06-15',
        '2038',
        '',
      ],
    ];

    const lines = [headers, ...sampleData];
    return lines.map((row) => row.join(',')).join('\n');
  }
}
