# API Plugin v2.1 validation rules (base version)
package m365.api_plugin.v2_1

import rego.v1
import data.m365.common.formats

# ===========================================
# NAMESPACE
# ===========================================

deny contains result if {
  not input.namespace
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": "namespace",
    "message": "Namespace is required"
  }
}

deny contains result if {
  input.namespace
  not regex.match(`^[A-Za-z0-9_]+$`, input.namespace)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": "namespace",
    "message": "Namespace must match pattern ^[A-Za-z0-9_]+$"
  }
}

# ===========================================
# NAME AND DESCRIPTION - EMPTY CHECK
# ===========================================

deny contains result if {
  input.name_for_human
  not formats.is_not_empty(input.name_for_human)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "name_for_human",
    "message": "name_for_human must contain non-whitespace characters"
  }
}

deny contains result if {
  input.description_for_model
  not formats.is_not_empty(input.description_for_model)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "description_for_model",
    "message": "description_for_model must contain non-whitespace characters"
  }
}

deny contains result if {
  input.description_for_human
  not formats.is_not_empty(input.description_for_human)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "description_for_human",
    "message": "description_for_human must contain non-whitespace characters"
  }
}

# ===========================================
# NAME AND DESCRIPTION LENGTHS
# ===========================================

deny contains result if {
  input.name_for_human
  count(input.name_for_human) > 20
  result := {
    "code": "M365-005",
    "severity": "warning",
    "path": "name_for_human",
    "message": "Name may be truncated (characters beyond 20 may be ignored)"
  }
}

deny contains result if {
  input.description_for_model
  count(input.description_for_model) > 2048
  result := {
    "code": "M365-005",
    "severity": "warning",
    "path": "description_for_model",
    "message": "Description may be truncated (characters beyond 2048 may be ignored)"
  }
}

deny contains result if {
  input.description_for_human
  count(input.description_for_human) > 100
  result := {
    "code": "M365-005",
    "severity": "warning",
    "path": "description_for_human",
    "message": "Description may be truncated (characters beyond 100 may be ignored)"
  }
}

# ===========================================
# FUNCTIONS
# ===========================================

deny contains result if {
  some i
  func := input.functions[i]
  not func.name
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("functions[%d].name", [i]),
    "message": "Function name is required"
  }
}

deny contains result if {
  some i
  func := input.functions[i]
  func.name
  not formats.is_not_empty(func.name)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("functions[%d].name", [i]),
    "message": "Function name must contain non-whitespace characters"
  }
}

deny contains result if {
  some i
  func := input.functions[i]
  not func.description
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("functions[%d].description", [i]),
    "message": "Function description is required"
  }
}

deny contains result if {
  some i
  func := input.functions[i]
  func.description
  not formats.is_not_empty(func.description)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("functions[%d].description", [i]),
    "message": "Function description must contain non-whitespace characters"
  }
}

# ===========================================
# RUNTIMES
# ===========================================

deny contains result if {
  some i
  runtime := input.runtimes[i]
  not runtime.auth
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("runtimes[%d].auth", [i]),
    "message": "Runtime auth configuration is required"
  }
}
