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
