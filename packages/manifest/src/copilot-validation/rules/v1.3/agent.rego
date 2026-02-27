# Declarative Agent v1.3 validation rules
# Inherits from v1.2 with additions
package m365.v1_3.agent

import rego.v1
import data.m365.v1_2.agent as base
import data.m365.common.formats

# Inherit all v1.2 rules except overridden ones
deny contains result if {
  some result in base.deny
  not is_overridden(result)
}

# Rules overridden in v1.3
is_overridden(result) if {
  result.message == "Too many actions (maximum 5)"
}

# ===========================================
# OVERRIDES FROM v1.2
# ===========================================

# v1.3 increases actions to 8
deny contains result if {
  input.actions
  count(input.actions) > 8
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "actions",
    "message": "Too many actions (maximum 8)"
  }
}

# ===========================================
# NEW IN v1.3: DISCLAIMER
# ===========================================

deny contains result if {
  input.disclaimer
  not input.disclaimer.text
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": "disclaimer.text",
    "message": "Disclaimer text is required when disclaimer is present"
  }
}

deny contains result if {
  input.disclaimer.text
  count(input.disclaimer.text) > 500
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "disclaimer.text",
    "message": "Disclaimer text exceeds maximum length of 500 characters"
  }
}

# ===========================================
# NEW IN v1.3: CONVERSATION STARTER TITLE
# ===========================================

deny contains result if {
  some i
  starter := input.conversation_starters[i]
  starter.title
  not formats.is_not_empty(starter.title)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("conversation_starters[%d].title", [i]),
    "message": "Conversation starter title must contain non-whitespace if provided"
  }
}
