# School Account Sync

A TypeScript/Deno script that automates Google Workspace student account lifecycle management by synchronizing student data from CSV files with Google Workspace organizational units.

## Overview

This tool ensures your Google Workspace student accounts stay in sync with your enrollment data by:

- Creating accounts for new students
- Moving students between grade-level organizational units
- Deactivating accounts for students no longer enrolled
- **Device rostering**: Automatically moving Chrome devices to student OUs based on serial numbers
- Maintaining device access restrictions through OU-based policies

## How It Works

The script treats your CSV file as the **source of truth** and performs a complete sync operation:

1. **Parse CSV Data** - Reads student enrollment data from CSV file
2. **Fetch Existing Accounts** - Retrieves all current student accounts from Google Workspace
3. **Compare & Sync** - Determines what actions need to be taken
4. **Execute Changes** - Creates, moves, or deactivates accounts as needed

## Organizational Unit Structure

Students are organized in a hierarchical OU structure that supports device access controls:

```
/org/student/
├── elementary/
│   ├── 2038/           # Graduation year
│   │   ├── student1.example/
│   │   │   ├── [user account]
│   │   │   └── [computer object]
│   │   └── student2.example/
│   └── 2039/
├── middle/
│   ├── 2035/
│   └── 2036/
└── high/
    ├── 2028/
    ├── 2029/
    ├── 2030/
    └── 2031/
```

## Grade Progression Logic

- **4K-5th Grade** → Elementary School OU
- **6th-8th Grade** → Middle School OU
- **9th-12th Grade** → High School OU
- **Graduated/Transferred** → Account deactivated

Students are automatically moved between school levels based on grade advancement.

## Prerequisites

### Google Workspace Setup

Follow these detailed steps to set up the required Google Workspace Admin configuration in 2025:

#### Step 1: Create Service Account in Google Cloud Console

1. **Create or Select a Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Click the project selector and either create a new project or select an existing one
   - Note your project ID for later use

2. **Enable Required APIs**
   - Navigate to **APIs & Services** → **Library**
   - Search for and enable **"Admin SDK API"**
   - This API provides access to the Directory API

3. **Create Service Account**
   - Go to **IAM & Admin** → **Service Accounts**
   - Click **"Create Service Account"**
   - Enter service account details:
     - **Name**: `google-workspace-sync` (or your preferred name)
     - **Description**: `Service account for automated student account synchronization`
   - Click **"Create and Continue"**
   - Skip the optional roles section (click **"Continue"**)
   - Click **"Done"**

4. **Generate Service Account Key**
   - Click on your newly created service account
   - Go to the **"Keys"** tab
   - Click **"Add Key"** → **"Create new key"**
   - Select **JSON** format and click **"Create"**
   - **Important**: Securely store the downloaded JSON file - this contains your private key

#### Step 2: Configure Domain-Wide Delegation in Google Workspace Admin

1. **Get Service Account Client ID**
   - In Google Cloud Console, go to your service account details
   - Copy the **Client ID** (long numeric string)

2. **Access Google Workspace Admin Console**
   - Sign in to [Google Admin Console](https://admin.google.com) with a **super administrator** account
   - Only super administrators can complete domain-wide delegation setup

3. **Configure API Controls**
   - Navigate to **Menu** → **Security** → **Access and data control** → **API controls**
   - Click **"Manage Domain Wide Delegation"**

4. **Add Service Account Authorization**
   - Click **"Add new"**
   - Enter your service account **Client ID**
   - In **OAuth Scopes**, add these required scopes (comma-separated):
     ```
     https://www.googleapis.com/auth/admin.directory.user,https://www.googleapis.com/auth/admin.directory.orgunit,https://www.googleapis.com/auth/admin.directory.group.readonly,https://www.googleapis.com/auth/admin.directory.device.chromeos
     ```
   - Click **"Authorize"**

#### Step 3: Set Up Delegated Admin User

1. **Create or Identify Admin User**
   - In Google Admin Console, ensure you have a user account that will be used for API delegation
   - This user needs **Users** and **Organizational Units** admin privileges
   - Note the full email address (e.g., `admin@yourschool.edu`)

2. **Assign Required Admin Roles**
   - Go to **Directory** → **Admin roles**
   - For your delegated user, ensure they have:
     - **Users Admin** role (to manage student accounts)
     - **Organizational Units Admin** role (to manage OU structure)

#### Step 4: Test Service Account Setup

1. **Verify API Access**
   - Test the setup by running the sync tool in dry-run mode
   - If you encounter authentication errors, verify:
     - Service account JSON file is correctly placed
     - Client ID matches between Cloud Console and Admin Console
     - OAuth scopes are correctly configured
     - Delegated user has appropriate admin privileges

#### Required OAuth Scopes Explanation

- **`admin.directory.user`**: Full access to create, read, update, and suspend user accounts
- **`admin.directory.orgunit`**: Full access to create and manage organizational units
- **`admin.directory.group.readonly`**: Read access to groups (for validation purposes)
- **`admin.directory.device.chromeos`**: Full access to manage Chrome OS devices

#### Security Considerations

⚠️ **Important Security Notes**:

- Service account has powerful domain-wide access to user data
- Store the JSON key file securely and never commit it to version control
- Regularly audit service account usage in Google Cloud Console
- Consider rotating service account keys periodically
- Limit the delegated admin user to minimum required privileges

#### Troubleshooting Common Issues

- **"Client ID not found"**: Ensure the Client ID is copied correctly (numeric only, no spaces)
- **"Insufficient permissions"**: Verify the delegated user has required admin roles
- **"API not enabled"**: Confirm Admin SDK API is enabled in Google Cloud Console
- **"Authentication failed"**: Check that domain-wide delegation is properly configured

#### Timing Note

Changes to domain-wide delegation can take up to 24 hours to propagate, but typically take effect within a few minutes.

### Deno Installation

```bash
# Install Deno
curl -fsSL https://deno.land/install.sh | sh
```

## Installation

1. Clone the repository:

```bash
git clone [repository-url]
cd school-account-sync
```

2. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Place your Google service account key file in the project directory

## Configuration

### Environment Variables

```env
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=path/to/service-account-key.json
GOOGLE_DOMAIN=your-school-domain.edu
STUDENT_CSV_FILE=students.csv
DRY_RUN=true
LOG_LEVEL=info
```

### Password Configuration

Password generation is configured via a JSON configuration file. The tool will look for config files in this order:

1. `config/config.json`
2. `config.json`
3. `./config.json`

#### Setting Up Password Configuration

1. **Copy the example config:**
   ```bash
   cp config/config.example.json config/config.json
   ```

2. **Edit your configuration** to match your needs:

#### Password Generation Types

**1. Prefix + Student ID (Default)**

```json
{
  "passwordConfig": {
    "type": "prefix_studentid",
    "prefix": "school"
  }
}
```

- Creates passwords like `school1234` from student ID
- Uses last 4 digits of student ID, padded with zeros

**2. Random Passwords**

```json
{
  "passwordConfig": {
    "type": "random",
    "length": 12,
    "includeUppercase": true,
    "includeLowercase": true,
    "includeNumbers": true,
    "includeSymbols": false
  }
}
```

- Generates random passwords with specified criteria
- Configurable length and character sets

**3. Custom Patterns**

```json
{
  "passwordConfig": {
    "type": "custom_function",
    "customPattern": "{firstName}{graduationYear}"
  }
}
```

- Available placeholders: `{firstName}`, `{lastName}`, `{studentId}`, `{graduationYear}`, `{firstInitial}`, `{lastInitial}`
- Example: "john2028" for John Doe graduating in 2028

#### Security Considerations

- **Keep your config file secure** - it's ignored by git by default
- **Random passwords** provide highest security but are harder to distribute
- **Custom patterns** offer flexibility but ensure they maintain adequate security
- All users are **forced to change passwords** on first login regardless of generation method

### Organizational Unit Root Configuration

By default, the tool creates all student accounts under `/org/student`. You can customize this root path using the configuration file:

```json
{
  "ouRoot": "/test",
  "passwordConfig": {
    "type": "prefix_studentid",
    "prefix": "school"
  }
}
```

**Default structure:**

```
/org/student/
├── elementary/2038/john.doe
├── middle/2035/jane.smith
└── high/2028/bob.johnson
```

**Custom root example (`"ouRoot": "/test"`):**

```
/test/
├── elementary/2038/john.doe
├── middle/2035/jane.smith
└── high/2028/bob.johnson
```

#### Use Cases for Custom OU Root

- **Testing environments**: Use `/test` to avoid affecting production OUs
- **School-specific organization**: Use `/schools/elementary-campus` for multi-campus districts
- **Migration scenarios**: Use temporary paths during transitions
- **Sandbox environments**: Isolate student accounts during development

### CSV File Format

The CSV file should contain the following columns in this exact order:

| Column              | Description                  | Required | Example                       |
| ------------------- | ---------------------------- | -------- | ----------------------------- |
| **Cur School Name** | Current school building name | Yes      | "ELEMENTARY BUILDING"         |
| **Stu Legal First** | Student's legal first name   | Yes      | "JOHN"                        |
| **Stu Legal Last**  | Student's legal last name    | Yes      | "DOE"                         |
| **Cur School Name** | Duplicate school name column | Yes      | "ELEMENTARY BUILDING"         |
| **Cur School Code** | School building code         | Yes      | "ELE"                         |
| **Entity ID**       | Entity identifier            | Yes      | "400"                         |
| **Student ID**      | Unique student identifier    | Yes      | "5976"                        |
| **Schl Email Addr** | Student email address        | No       | "john.doe@student.school.edu" |
| **Graduated**       | Graduation status            | No       | "No"                          |
| **Student Grade**   | Current grade level          | No       | "05", "KG", "K4", "PK"        |
| **Prop Grad Date**  | Proposed graduation date     | No       | "20320605"                    |
| **Stu Grad Yr**     | Graduation year              | Yes      | "2032"                        |
| **Device Serial**   | Chrome device serial number  | No       | "CHR001234567"                |

#### Device Management

- **With Device Serial**: Both user account and Chrome device will be moved to the student's OU
- **Without Device Serial**: Only the user account will be managed (device operations skipped)
- **Empty Device Serial**: Treated as no device assigned

#### Sample CSV Format

```csv
Cur School Name,Stu Legal First,Stu Legal Last,Cur School Name,Cur School Code,Entity ID,Student ID,Schl Email Addr,Graduated,Student Grade,Prop Grad Date,Stu Grad Yr,Device Serial
ELEMENTARY BUILDING,JOHN,DOE,ELEMENTARY BUILDING,ELE,400,1001,john.doe@student.school.edu,No,05,20320605,2032,CHR001234567
ELEMENTARY BUILDING,JANE,SMITH,ELEMENTARY BUILDING,ELE,400,1002,jane.smith@student.school.edu,No,03,20340605,2034,CHR002345678
ELEMENTARY BUILDING,CHARLIE,BROWN,ELEMENTARY BUILDING,ELE,400,1005,,No,K,20370605,2037,
```

## Usage

### Basic Sync

```bash
deno run --allow-net --allow-read --allow-env main.ts
```

### Dry Run Mode (Recommended First)

```bash
deno run --allow-net --allow-read --allow-env main.ts --dry-run
```

### Specific Operations

```bash
# Only create new accounts
deno run --allow-net --allow-read --allow-env main.ts --create-only

# Only move existing accounts
deno run --allow-net --allow-read --allow-env main.ts --move-only

# Only deactivate accounts not in CSV
deno run --allow-net --allow-read --allow-env main.ts --deactivate-only
```

## Safety Features

- **Dry Run Mode** - Preview all changes before execution
- **Backup Mode** - Export current OU structure before making changes
- **Rollback Capability** - Restore previous OU assignments if needed
- **Confirmation Prompts** - Manual approval for bulk deactivations
- **Detailed Logging** - Complete audit trail of all operations

## Device Access Control

This OU structure enables Chrome device policies that restrict device access:

- Students can only sign into devices within their OU
- Devices are assigned to the same OU as their primary user
- Automatic policy inheritance based on OU placement

## Monitoring & Reporting

The script generates detailed reports:

- **Summary Report** - Overview of all changes made
- **Error Log** - Failed operations and reasons
- **Audit Trail** - Complete log of API calls and changes
- **CSV Export** - Current state after sync completion

## Development

### Project Structure

```
├── src/
│   ├── main.ts              # Entry point
│   ├── csv-parser.ts        # CSV file handling
│   ├── google-api.ts        # Google Workspace API client
│   ├── sync-engine.ts       # Core sync logic
│   ├── ou-manager.ts        # OU operations
│   └── types.ts            # TypeScript interfaces
├── tests/
├── scripts/                 # Build and utility scripts
├── .github/
│   ├── workflows/          # CI/CD pipelines
│   └── ISSUE_TEMPLATE/     # GitHub issue templates
├── config/
├── logs/
└── README.md
```

### Development Workflow

This project follows a **feature → dev → master** branching strategy with automated CI/CD:

1. **Feature branches**: Create feature branches from `dev`
2. **Dev branch**: All features merge to `dev` first, triggers automated testing
3. **Master branch**: Production releases, requires 2 approvals and creates binary releases

### Available Commands

```bash
# Development
deno task dev              # Run with file watching
deno task start            # Run once

# Testing and Quality
deno task test             # Run tests
deno task test:coverage    # Run tests with coverage
deno task lint             # Run linter  
deno task fmt              # Format code
deno task fmt:check        # Check formatting
deno task typecheck        # Type checking

# Building
deno task build            # Build local binary
deno task build:all        # Build for all platforms
deno task test:build       # Test build process locally

# Utilities
deno task sample           # Generate sample CSV
deno task validate:workflows # Validate GitHub Actions
```

### CI/CD Pipeline

#### Pull Requests

- **To `dev`**: Runs tests, linting, security checks
- **To `master`**: Requires 2 approvals + all tests pass

#### Branches

- **`dev` branch**:
  - Runs comprehensive test suite
  - Validates sample CSV generation
  - Security scanning
  - Coverage reporting

- **`master` branch**:
  - All dev branch checks
  - Compiles binaries for Linux, macOS, Windows
  - Creates GitHub release with binaries
  - Auto-generated release notes

### Running Tests Locally

```bash
# Quick test
deno task test

# Full CI simulation
deno task test:build
```

## Troubleshooting

### Common Issues

- **Permission Errors** - Verify service account has necessary Google Workspace permissions
- **CSV Format Issues** - Ensure CSV headers match expected format
- **Rate Limiting** - Script includes automatic retry logic with exponential backoff
- **OU Conflicts** - Check for existing accounts in unexpected OUs

### Support

- Check the logs/ directory for detailed error information
- Run with `--verbose` flag for additional debugging output
- Use `--dry-run` to preview operations without making changes
