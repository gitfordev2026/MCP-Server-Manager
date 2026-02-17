export type AccessMode = 'allow' | 'approval' | 'deny';

export type OwnerType = 'app' | 'mcp';

export type Policies = Record<string, OwnerPolicy>;


export interface ServerItem {
  name: string;
  url: string;
}

export interface AppItem {
  name: string;
  url: string;
  openapi_path: string;
  include_unreachable_tools: boolean;
}

export interface CatalogTool {
  name: string;
  title: string;
  app: string;
  method: string;
  path: string;
  is_placeholder: boolean;
  placeholder_reason: string | null;
}

export interface CatalogAppDiagnostic {
  name: string;
  url: string;
  openapi_path: string;
  include_unreachable_tools: boolean;
  status: 'healthy' | 'unreachable' | 'zero_endpoints' | string;
  operation_count: number;
  tool_count: number;
  placeholder_tool_added: boolean;
  used_openapi_url: string | null;
  rounds_attempted: number;
  requests_attempted: number;
  latency_ms: number;
  error: string | null;
}

export interface OwnerItem {
  id: string;
  type: OwnerType;
  name: string;
  url: string;
  endpointCount: number;
}

export interface EndpointItem {
  id: string;
  displayName: string;
  subtitle: string;
  isPlaceholder?: boolean;
  placeholderReason?: string | null;
}


export interface OwnerPolicy {
  defaultMode: AccessMode;
  endpointModes: Record<string, AccessMode>;
}

// Payloads sent to backend
export interface PolicyPayload {
  policy: {
    mode: AccessMode;
    tool_ids?: string[];
  };
}
