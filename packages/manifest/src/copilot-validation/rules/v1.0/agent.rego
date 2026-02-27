# Declarative Agent v1.0 validation rules (base version)
package m365.v1_0.agent

import rego.v1
import data.m365.common.formats

# ===========================================
# ROOT PROPERTIES
# ===========================================

deny contains result if {
  not input.name
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": "name",
    "message": "Name is required"
  }
}

deny contains result if {
  input.name
  not formats.is_not_empty(input.name)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "name",
    "message": "Name must contain non-whitespace characters"
  }
}

deny contains result if {
  input.name
  count(input.name) > 100
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "name",
    "message": "Name exceeds maximum length of 100 characters"
  }
}

deny contains result if {
  not input.description
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": "description",
    "message": "Description is required"
  }
}

deny contains result if {
  input.description
  not formats.is_not_empty(input.description)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "description",
    "message": "Description must contain non-whitespace characters"
  }
}

deny contains result if {
  input.description
  count(input.description) > 1000
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "description",
    "message": "Description exceeds maximum length of 1000 characters"
  }
}

# ===========================================
# INSTRUCTIONS (v1.0: max 4000 characters)
# ===========================================

deny contains result if {
  input.instructions
  count(input.instructions) > 4000
  not formats.is_file_reference(input.instructions)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "instructions",
    "message": "Instructions exceed maximum length of 4000 characters"
  }
}

deny contains result if {
  input.instructions
  not formats.is_not_empty(input.instructions)
  not formats.is_file_reference(input.instructions)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "instructions",
    "message": "Instructions must contain non-whitespace characters"
  }
}

# ===========================================
# CONVERSATION STARTERS (v1.0: max 4)
# ===========================================

deny contains result if {
  input.conversation_starters
  count(input.conversation_starters) > 4
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "conversation_starters",
    "message": "Too many conversation starters (maximum 4)"
  }
}

deny contains result if {
  some i
  starter := input.conversation_starters[i]
  not starter.text
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("conversation_starters[%d].text", [i]),
    "message": "Conversation starter text is required"
  }
}

deny contains result if {
  some i
  starter := input.conversation_starters[i]
  starter.text
  not formats.is_not_empty(starter.text)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("conversation_starters[%d].text", [i]),
    "message": "Conversation starter text must contain non-whitespace"
  }
}

# ===========================================
# ACTIONS (v1.0: max 5)
# ===========================================

deny contains result if {
  input.actions
  count(input.actions) == 0
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "actions",
    "message": "Actions array must have at least 1 item when present"
  }
}

deny contains result if {
  input.actions
  count(input.actions) > 5
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "actions",
    "message": "Too many actions (maximum 5)"
  }
}

deny contains result if {
  some i
  action := input.actions[i]
  not action.id
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("actions[%d].id", [i]),
    "message": "Action ID is required"
  }
}

deny contains result if {
  some i
  action := input.actions[i]
  not action.file
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("actions[%d].file", [i]),
    "message": "Action file path is required"
  }
}
