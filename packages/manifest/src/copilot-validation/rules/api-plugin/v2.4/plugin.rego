# API Plugin v2.4 validation rules
# Inherits from v2.3 with additions
package m365.api_plugin.v2_4

import rego.v1
import data.m365.api_plugin.v2_3 as base
import data.m365.common.formats

# Inherit all v2.3 rules except overridden ones
deny contains result if {
  some result in base.deny
  not is_overridden(result)
}

# Rules overridden in v2.4
is_overridden(result) if {
  result.message == "Too many conversation starters (maximum 6)"
}

# ===========================================
# OVERRIDES FROM v2.3
# ===========================================

# v2.4 increases conversation starters to 8
deny contains result if {
  input.capabilities
  input.capabilities.conversation_starters
  count(input.capabilities.conversation_starters) > 8
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "capabilities.conversation_starters",
    "message": "Too many conversation starters (maximum 8)"
  }
}

# ===========================================
# NEW IN v2.4: AUTHORIZATION ENHANCEMENTS
# ===========================================

deny contains result if {
  some i
  runtime := input.runtimes[i]
  runtime.auth
  runtime.auth.type == "OAuthPluginVault"
  not runtime.auth.reference_id
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("runtimes[%d].auth.reference_id", [i]),
    "message": "reference_id is required for OAuthPluginVault auth type"
  }
}

deny contains result if {
  some i
  runtime := input.runtimes[i]
  runtime.auth
  runtime.auth.type == "ApiKeyPluginVault"
  not runtime.auth.reference_id
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("runtimes[%d].auth.reference_id", [i]),
    "message": "reference_id is required for ApiKeyPluginVault auth type"
  }
}

deny contains result if {
  some i
  runtime := input.runtimes[i]
  runtime.auth
  runtime.auth.reference_id
  not formats.is_not_empty(runtime.auth.reference_id)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("runtimes[%d].auth.reference_id", [i]),
    "message": "reference_id must contain non-whitespace characters"
  }
}

# ===========================================
# NEW IN v2.4: RICH RESPONSE TEMPLATE
# ===========================================

deny contains result if {
  some i
  func := input.functions[i]
  func.response_semantics
  func.response_semantics.static_template
  func.response_semantics.static_template["$schema"]
  not func.response_semantics.static_template["$schema"] == "https://copilot.microsoft.com/schemas/rich-response-v1.0.json"
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("functions[%d].response_semantics.static_template.$schema", [i]),
    "message": "static_template $schema must be 'https://copilot.microsoft.com/schemas/rich-response-v1.0.json'"
  }
}

# ===========================================
# NEW IN v2.4: FUNCTION GROUPS
# ===========================================

deny contains result if {
  input.function_groups
  some i
  group := input.function_groups[i]
  not group.name
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("function_groups[%d].name", [i]),
    "message": "Function group name is required"
  }
}

deny contains result if {
  input.function_groups
  some i
  group := input.function_groups[i]
  group.name
  not formats.is_not_empty(group.name)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("function_groups[%d].name", [i]),
    "message": "Function group name must contain non-whitespace characters"
  }
}

deny contains result if {
  input.function_groups
  some i
  group := input.function_groups[i]
  group.functions
  count(group.functions) == 0
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("function_groups[%d].functions", [i]),
    "message": "Function group must contain at least one function"
  }
}

# ===========================================
# NEW IN v2.4: NAMESPACE PATTERN (41002)
# ===========================================

deny contains result if {
  input.namespace
  formats.is_not_empty(input.namespace)
  not formats.is_valid_namespace(input.namespace)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": "namespace",
    "message": "Namespace must contain only alphanumeric characters and hyphens"
  }
}

# ===========================================
# NEW IN v2.4: FUNCTION NAME PATTERN (21458)
# ===========================================

deny contains result if {
  some i
  func := input.functions[i]
  func.name
  formats.is_not_empty(func.name)
  not formats.is_valid_function_name(func.name)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("functions[%d].name", [i]),
    "message": "Function name must contain only alphanumeric characters, underscores, and hyphens"
  }
}

# Unique function names (21457)
deny contains result if {
  some i, j
  i < j
  input.functions[i].name == input.functions[j].name
  result := {
    "code": "M365-006",
    "severity": "warning",
    "path": sprintf("functions[%d].name", [j]),
    "message": sprintf("Duplicate function name: '%s'", [input.functions[j].name])
  }
}

# Function description max 1024 chars (21587)
deny contains result if {
  some i
  func := input.functions[i]
  func.description
  count(func.description) > 1024
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("functions[%d].description", [i]),
    "message": "Function description exceeds maximum length of 1024 characters"
  }
}

# Namespace + function name combined max 64 chars (41003)
deny contains result if {
  input.namespace
  some i
  func := input.functions[i]
  func.name
  combined := concat(".", [input.namespace, func.name])
  count(combined) > 64
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("functions[%d].name", [i]),
    "message": sprintf("Namespace + function name combined exceeds 64 characters (current: %d)", [count(combined)])
  }
}

# ===========================================
# NEW IN v2.4: FUNCTION PARAMETER TYPES (21586, 21687, 21693)
# ===========================================

# parameters.type must be "object" (21586)
deny contains result if {
  some i
  func := input.functions[i]
  func.parameters
  func.parameters.type
  func.parameters.type != "object"
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("functions[%d].parameters.type", [i]),
    "message": "Function parameters type must be 'object'"
  }
}

# returns.type must be "string" (21588)
deny contains result if {
  some i
  func := input.functions[i]
  func.returns
  func.returns.type
  func.returns.type != "string"
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("functions[%d].returns.type", [i]),
    "message": "Function returns type must be 'string'"
  }
}

# Parameter property types must be allowed types (21687)
deny contains result if {
  some i
  func := input.functions[i]
  func.parameters
  func.parameters.properties
  some prop_name
  prop := func.parameters.properties[prop_name]
  prop.type
  allowed_types := ["string", "array", "boolean", "integer", "number"]
  not prop.type in allowed_types
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("functions[%d].parameters.properties.%s.type", [i, prop_name]),
    "message": sprintf("Invalid parameter type: '%s'. Allowed: string, array, boolean, integer, number", [prop.type])
  }
}

# items only valid when type is array (21693)
deny contains result if {
  some i
  func := input.functions[i]
  func.parameters
  func.parameters.properties
  some prop_name
  prop := func.parameters.properties[prop_name]
  prop.items
  prop.type != "array"
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("functions[%d].parameters.properties.%s.items", [i, prop_name]),
    "message": "'items' is only valid when parameter type is 'array'"
  }
}

# ===========================================
# NEW IN v2.4: SECURITY INFO (21706)
# ===========================================

deny contains result if {
  input.security_info
  input.security_info.data_handling
  some i
  dh := input.security_info.data_handling[i]
  valid_values := ["GetPublicData", "GetPrivateData", "DataTransform", "ResourceStateUpdate", "DataExport"]
  not dh in valid_values
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("security_info.data_handling[%d]", [i]),
    "message": sprintf("Invalid data_handling value: '%s'. Allowed: GetPublicData, GetPrivateData, DataTransform, ResourceStateUpdate, DataExport", [dh])
  }
}

# ===========================================
# NEW IN v2.4: LOGO/CONTACT/LEGAL URLS (Store ruleset)
# ===========================================

# logo_url must be absolute URL if present (21460)
deny contains result if {
  input.logo_url
  not formats.is_absolute_http_url(input.logo_url)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": "logo_url",
    "message": "logo_url must be an absolute HTTP/HTTPS URL"
  }
}

# contact_email must be valid email if present (21673)
deny contains result if {
  input.contact_email
  not formats.is_valid_email(input.contact_email)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": "contact_email",
    "message": "contact_email is not a valid email address"
  }
}

# legal_info_url must be absolute URL if present (41000)
deny contains result if {
  input.legal_info_url
  not formats.is_absolute_http_url(input.legal_info_url)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": "legal_info_url",
    "message": "legal_info_url must be an absolute HTTP/HTTPS URL"
  }
}

# privacy_policy_url must be absolute URL if present (41001)
deny contains result if {
  input.privacy_policy_url
  not formats.is_absolute_http_url(input.privacy_policy_url)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": "privacy_policy_url",
    "message": "privacy_policy_url must be an absolute HTTP/HTTPS URL"
  }
}

# ===========================================
# NEW IN v2.4: RUNTIME SPEC (21704)
# ===========================================

# At least url or api_description must be present in spec
deny contains result if {
  some i
  runtime := input.runtimes[i]
  runtime.spec
  not runtime.spec.url
  not runtime.spec.api_description
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("runtimes[%d].spec", [i]),
    "message": "Runtime spec requires either 'url' or 'api_description'"
  }
}

# Runtime spec URL must be absolute (60001)
deny contains result if {
  some i
  runtime := input.runtimes[i]
  runtime.spec
  runtime.spec.url
  not formats.is_absolute_http_url(runtime.spec.url)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("runtimes[%d].spec.url", [i]),
    "message": "Runtime spec URL must be an absolute HTTP/HTTPS URL"
  }
}

# MCP runtime run_for_functions must have at least 1 item (60000)
deny contains result if {
  some i
  runtime := input.runtimes[i]
  runtime.type == "McpServer"
  runtime.run_for_functions
  count(runtime.run_for_functions) == 0
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("runtimes[%d].run_for_functions", [i]),
    "message": "MCP runtime 'run_for_functions' must have at least 1 item"
  }
}
