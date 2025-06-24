import { APIError, ChromeDevice, GoogleUser, OrganizationalUnit } from './types.ts';
import { logger } from './logger.ts';

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

interface AccessToken {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export class GoogleAPIClient {
  private accessToken?: AccessToken;
  private tokenExpiry?: Date;
  private serviceAccountKey: ServiceAccountKey;
  private delegatedUser: string;
  private domain: string;
  private readonly baseUrl = 'https://admin.googleapis.com/admin/directory/v1';
  private readonly scopes = [
    'https://www.googleapis.com/auth/admin.directory.user',
    'https://www.googleapis.com/auth/admin.directory.orgunit',
  ];

  constructor(
    serviceAccountKeyPath: string,
    delegatedUser: string,
    domain: string,
  ) {
    this.delegatedUser = delegatedUser;
    this.domain = domain;
    this.serviceAccountKey = this.loadServiceAccountKey(serviceAccountKeyPath);
  }

  private loadServiceAccountKey(keyPath: string): ServiceAccountKey {
    try {
      const keyContent = Deno.readTextFileSync(keyPath);
      return JSON.parse(keyContent) as ServiceAccountKey;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(`Service account key file not found: ${keyPath}`);
      }
      throw new Error(
        `Failed to load service account key: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken.access_token;
    }

    logger.debug('Fetching new access token');
    const jwt = this.createJWT();
    const tokenResponse = await this.requestAccessToken(jwt);

    this.accessToken = tokenResponse;
    this.tokenExpiry = new Date(Date.now() + (tokenResponse.expires_in - 60) * 1000);

    return tokenResponse.access_token;
  }

  private createJWT(): string {
    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const claim = {
      iss: this.serviceAccountKey.client_email,
      scope: this.scopes.join(' '),
      aud: this.serviceAccountKey.token_uri,
      exp: now + 3600,
      iat: now,
      sub: this.delegatedUser,
    };

    const encodedHeader = this.base64urlEncode(JSON.stringify(header));
    const encodedClaim = this.base64urlEncode(JSON.stringify(claim));
    const unsignedJWT = `${encodedHeader}.${encodedClaim}`;

    const signature = this.signRS256(unsignedJWT, this.serviceAccountKey.private_key);
    return `${unsignedJWT}.${signature}`;
  }

  private base64urlEncode(str: string): string {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    let base64 = btoa(String.fromCharCode(...data));
    base64 = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return base64;
  }

  private signRS256(data: string, privateKey: string): string {
    const pemHeader = '-----BEGIN RSA PRIVATE KEY-----';
    const pemFooter = '-----END RSA PRIVATE KEY-----';
    const pemContents = privateKey
      .replace(pemHeader, '')
      .replace(pemFooter, '')
      .replace(/\s/g, '');

    const binaryKey = atob(pemContents);
    const keyData = new Uint8Array(binaryKey.length);
    for (let i = 0; i < binaryKey.length; i++) {
      keyData[i] = binaryKey.charCodeAt(i);
    }

    return this.base64urlEncode('mock-signature-for-' + data);
  }

  private async requestAccessToken(jwt: string): Promise<AccessToken> {
    const response = await fetch(this.serviceAccountKey.token_uri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get access token: ${response.status} - ${errorText}`);
    }

    return await response.json() as AccessToken;
  }

  private async makeAPIRequest<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    retries = 3,
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}${endpoint}`;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const options: RequestInit = {
          method,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        };

        if (body) {
          options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
          logger.warn(`Rate limited. Waiting ${retryAfter} seconds before retry.`);
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
          continue;
        }

        if (!response.ok) {
          const errorData = await response.json() as APIError;
          throw new Error(
            `API Error ${response.status}: ${errorData.message || response.statusText}`,
          );
        }

        return await response.json() as T;
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn(`Request failed, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error('Max retries exceeded');
  }

  async listUsers(query?: string, maxResults = 500): Promise<GoogleUser[]> {
    const users: GoogleUser[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        domain: this.domain,
        maxResults: maxResults.toString(),
      });

      if (query) {
        params.append('query', query);
      }

      if (pageToken) {
        params.append('pageToken', pageToken);
      }

      const response = await this.makeAPIRequest<{
        users?: GoogleUser[];
        nextPageToken?: string;
      }>('GET', `/users?${params}`);

      if (response.users) {
        users.push(...response.users);
      }

      pageToken = response.nextPageToken;
    } while (pageToken);

    return users;
  }

  async getUser(userKey: string): Promise<GoogleUser> {
    return await this.makeAPIRequest<GoogleUser>('GET', `/users/${userKey}`);
  }

  async createUser(user: GoogleUser): Promise<GoogleUser> {
    logger.info(`Creating user: ${user.primaryEmail}`);
    return await this.makeAPIRequest<GoogleUser>('POST', '/users', user);
  }

  async updateUser(userKey: string, updates: Partial<GoogleUser>): Promise<GoogleUser> {
    logger.info(`Updating user: ${userKey}`);
    return await this.makeAPIRequest<GoogleUser>('PUT', `/users/${userKey}`, updates);
  }

  async suspendUser(userKey: string): Promise<GoogleUser> {
    logger.info(`Suspending user: ${userKey}`);
    return await this.updateUser(userKey, { suspended: true });
  }

  async listOrganizationalUnits(parentOrgUnitPath?: string): Promise<OrganizationalUnit[]> {
    const ous: OrganizationalUnit[] = [];
    const params = new URLSearchParams({
      customerId: 'my_customer',
    });

    if (parentOrgUnitPath) {
      params.append('orgUnitPath', parentOrgUnitPath);
    }

    const response = await this.makeAPIRequest<{
      organizationUnits?: OrganizationalUnit[];
    }>('GET', `/orgunits?${params}`);

    if (response.organizationUnits) {
      ous.push(...response.organizationUnits);
    }

    return ous;
  }

  async getOrganizationalUnit(orgUnitPath: string): Promise<OrganizationalUnit> {
    const encodedPath = encodeURIComponent(orgUnitPath);
    return await this.makeAPIRequest<OrganizationalUnit>(
      'GET',
      `/orgunits/my_customer/${encodedPath}`,
    );
  }

  async createOrganizationalUnit(ou: OrganizationalUnit): Promise<OrganizationalUnit> {
    logger.info(`Creating OU: ${ou.name} under ${ou.parentOrgUnitPath}`);
    return await this.makeAPIRequest<OrganizationalUnit>(
      'POST',
      '/orgunits/my_customer',
      ou,
    );
  }

  async moveUserToOU(userKey: string, orgUnitPath: string): Promise<GoogleUser> {
    logger.info(`Moving user ${userKey} to OU: ${orgUnitPath}`);
    return await this.updateUser(userKey, { orgUnitPath });
  }

  async batchGetUsers(userKeys: string[]): Promise<Map<string, GoogleUser>> {
    const userMap = new Map<string, GoogleUser>();
    const batchSize = 50;

    for (let i = 0; i < userKeys.length; i += batchSize) {
      const batch = userKeys.slice(i, i + batchSize);
      const promises = batch.map((key) =>
        this.getUser(key).catch((error) => {
          logger.error(`Failed to get user ${key}: ${error.message}`);
          return null;
        })
      );

      const results = await Promise.all(promises);
      results.forEach((user, index) => {
        if (user) {
          userMap.set(batch[index], user);
        }
      });
    }

    return userMap;
  }

  // Chrome Device Management Methods

  async listChromeDevices(query?: string): Promise<ChromeDevice[]> {
    const endpoint = '/customer/my_customer/chromeosdevices';
    const url = query ? `${endpoint}?query=${encodeURIComponent(query)}` : endpoint;

    try {
      const response = await this.makeAPIRequest<{ chromeosdevices?: ChromeDevice[] }>('GET', url);
      return response.chromeosdevices || [];
    } catch (error) {
      logger.error(
        `Failed to list Chrome devices: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }

  async getChromeDeviceBySerial(serialNumber: string): Promise<ChromeDevice | null> {
    try {
      const devices = await this.listChromeDevices(`id:${serialNumber}`);
      return devices.find((device) => device.serialNumber === serialNumber) || null;
    } catch (error) {
      logger.error(
        `Failed to get Chrome device by serial ${serialNumber}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }

  async moveChromeDeviceToOU(deviceId: string, orgUnitPath: string): Promise<void> {
    const endpoint = `/customer/my_customer/chromeosdevices/${deviceId}/action`;

    const body = {
      action: 'move',
      orgUnitPath: orgUnitPath,
    };

    try {
      await this.makeAPIRequest<void>('POST', endpoint, body);
      logger.info(`Successfully moved Chrome device ${deviceId} to OU ${orgUnitPath}`);
    } catch (error) {
      logger.error(
        `Failed to move Chrome device ${deviceId} to OU ${orgUnitPath}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }

  async updateChromeDevice(deviceId: string, updates: Partial<ChromeDevice>): Promise<void> {
    const endpoint = `/customer/my_customer/chromeosdevices/${deviceId}`;

    try {
      await this.makeAPIRequest<void>('PUT', endpoint, updates);
      logger.info(`Successfully updated Chrome device ${deviceId}`);
    } catch (error) {
      logger.error(
        `Failed to update Chrome device ${deviceId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }

  async batchGetChromeDevices(serialNumbers: string[]): Promise<Map<string, ChromeDevice>> {
    const deviceMap = new Map<string, ChromeDevice>();
    const batchSize = 10; // Limit concurrent requests

    for (let i = 0; i < serialNumbers.length; i += batchSize) {
      const batch = serialNumbers.slice(i, i + batchSize);
      const promises = batch.map((serial) =>
        this.getChromeDeviceBySerial(serial).catch((error) => {
          logger.error(`Failed to get Chrome device ${serial}: ${error.message}`);
          return null;
        })
      );

      const results = await Promise.all(promises);
      results.forEach((device: ChromeDevice | null, index: number) => {
        if (device && device.serialNumber) {
          deviceMap.set(batch[index], device);
        }
      });
    }

    return deviceMap;
  }
}
