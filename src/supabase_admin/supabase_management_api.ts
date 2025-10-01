const SUPABASE_MANAGEMENT_API_BASE_URL = "https://api.supabase.com/v1";

export class SupabaseManagementAPIError extends Error {
  readonly response: Response;

  constructor(message: string, response: Response) {
    super(message);
    this.name = "SupabaseManagementAPIError";
    this.response = response;
  }
}

export interface SupabaseManagementAPIOptions {
  accessToken: string;
}

export interface SupabaseProject {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface SupabaseApiKey {
  id: string;
  name: string;
  type: string;
  api_key: string;
  [key: string]: unknown;
}

export interface SupabaseSecret {
  name: string;
  [key: string]: unknown;
}

export class SupabaseManagementAPI {
  readonly options: SupabaseManagementAPIOptions;

  constructor(options: SupabaseManagementAPIOptions) {
    this.options = options;
  }

  async getProjects(): Promise<SupabaseProject[]> {
    const response = await this.request("/projects");
    return response.json();
  }

  async getProjectApiKeys(projectId: string): Promise<SupabaseApiKey[]> {
    const response = await this.request(
      `/projects/${encodeURIComponent(projectId)}/api-keys`,
    );
    return response.json();
  }

  async getSecrets(projectId: string): Promise<SupabaseSecret[]> {
    const response = await this.request(
      `/projects/${encodeURIComponent(projectId)}/secrets`,
    );
    return response.json();
  }

  async runQuery(projectId: string, query: string): Promise<unknown> {
    const response = await this.request(
      `/projects/${encodeURIComponent(projectId)}/sql`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      },
    );
    return response.json();
  }

  async deleteFunction(projectId: string, functionName: string): Promise<void> {
    await this.request(
      `/projects/${encodeURIComponent(projectId)}/functions/${encodeURIComponent(functionName)}`,
      {
        method: "DELETE",
      },
    );
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(
      `${SUPABASE_MANAGEMENT_API_BASE_URL}${path}`,
      this.withAuthHeaders(init),
    );

    if (!response.ok) {
      throw await this.createError(path, response);
    }

    return response;
  }

  private withAuthHeaders(init: RequestInit): RequestInit {
    const headers = new Headers(init.headers);
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${this.options.accessToken}`);
    }
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }

    return {
      ...init,
      headers,
    };
  }

  private async createError(path: string, response: Response) {
    let details = "";
    try {
      const body = await response.json();
      if (typeof body === "object" && body && "message" in body) {
        details = `: ${(body as Record<string, unknown>).message}`;
      }
    } catch {
      // response body could be empty or not JSON; ignore parse errors
    }

    const message = `Supabase management request to ${path} failed with ${response.status} ${response.statusText}${details}`;
    return new SupabaseManagementAPIError(message, response);
  }
}
