# API Plugin v2.2 validation rules
# Inherits from v2.1 with additions
package m365.api_plugin.v2_2

import rego.v1
import data.m365.api_plugin.v2_1 as base
import data.m365.common.formats

# Inherit all v2.1 rules
deny contains result if {
  some result in base.deny
}

# ===========================================
# NEW IN v2.2: CAPABILITIES PROPERTY
# ===========================================

deny contains result if {
  input.capabilities
  input.capabilities.conversation_starters
  count(input.capabilities.conversation_starters) > 4
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "capabilities.conversation_starters",
    "message": "Too many conversation starters (maximum 4)"
  }
}

deny contains result if {
  input.capabilities
  some i
  starter := input.capabilities.conversation_starters[i]
  not starter.text
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("capabilities.conversation_starters[%d].text", [i]),
    "message": "Conversation starter text is required"
  }
}

deny contains result if {
  input.capabilities
  some i
  starter := input.capabilities.conversation_starters[i]
  starter.text
  not formats.is_not_empty(starter.text)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("capabilities.conversation_starters[%d].text", [i]),
    "message": "Conversation starter text must contain non-whitespace"
  }
}

# ===========================================
# NEW IN v2.2: CONFIRMATION DIALOG
# ===========================================

deny contains result if {
  some i
  func := input.functions[i]
  func.confirmation
  func.confirmation.type
  not func.confirmation.type in ["None", "AdaptiveCard"]
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("functions[%d].confirmation.type", [i]),
    "message": "Confirmation type must be 'None' or 'AdaptiveCard'"
  }
}

deny contains result if {
  some i
  func := input.functions[i]
  func.confirmation
  func.confirmation.type == "AdaptiveCard"
  not func.confirmation.title
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("functions[%d].confirmation.title", [i]),
    "message": "Confirmation title is required when type is AdaptiveCard"
  }
}
