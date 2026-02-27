# API Plugin v2.3 validation rules
# Inherits from v2.2 with additions
package m365.api_plugin.v2_3

import rego.v1
import data.m365.api_plugin.v2_2 as base
import data.m365.common.formats

# Inherit all v2.2 rules except overridden ones
deny contains result if {
  some result in base.deny
  not is_overridden(result)
}

# Rules overridden in v2.3
is_overridden(result) if {
  result.message == "Too many conversation starters (maximum 4)"
}

# ===========================================
# OVERRIDES FROM v2.2
# ===========================================

# v2.3 increases conversation starters to 6
deny contains result if {
  input.capabilities
  input.capabilities.conversation_starters
  count(input.capabilities.conversation_starters) > 6
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "capabilities.conversation_starters",
    "message": "Too many conversation starters (maximum 6)"
  }
}

# ===========================================
# NEW IN v2.3: RESPONSE SEMANTICS
# ===========================================

deny contains result if {
  some i
  func := input.functions[i]
  func.response_semantics
  func.response_semantics.data_path
  not formats.is_not_empty(func.response_semantics.data_path)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("functions[%d].response_semantics.data_path", [i]),
    "message": "data_path must contain non-whitespace characters"
  }
}

deny contains result if {
  some i
  func := input.functions[i]
  func.response_semantics
  func.response_semantics.properties
  some j
  prop := func.response_semantics.properties[j]
  not prop.name
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("functions[%d].response_semantics.properties[%d].name", [i, j]),
    "message": "Property name is required"
  }
}

deny contains result if {
  some i
  func := input.functions[i]
  func.response_semantics
  func.response_semantics.properties
  some j
  prop := func.response_semantics.properties[j]
  prop.name
  not formats.is_not_empty(prop.name)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("functions[%d].response_semantics.properties[%d].name", [i, j]),
    "message": "Property name must contain non-whitespace characters"
  }
}

# ===========================================
# NEW IN v2.3: STATES
# ===========================================

deny contains result if {
  some i
  func := input.functions[i]
  func.states
  func.states.reasoning
  func.states.reasoning.instructions
  not formats.is_not_empty(func.states.reasoning.instructions)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("functions[%d].states.reasoning.instructions", [i]),
    "message": "Reasoning instructions must contain non-whitespace characters"
  }
}

deny contains result if {
  some i
  func := input.functions[i]
  func.states
  func.states.responding
  func.states.responding.instructions
  not formats.is_not_empty(func.states.responding.instructions)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("functions[%d].states.responding.instructions", [i]),
    "message": "Responding instructions must contain non-whitespace characters"
  }
}
