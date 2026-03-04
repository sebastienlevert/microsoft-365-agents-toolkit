# Declarative Agent v1.6 validation rules
# Inherits from v1.5 with overrides and additions
package m365.v1_6.agent

import rego.v1
import data.m365.v1_5.agent as base
import data.m365.common.formats

# Inherit all v1.5 rules except overridden ones
deny contains result if {
  some result in base.deny
  not is_overridden(result)
}

# Rules overridden in v1.6
is_overridden(result) if {
  result.message == "Too many conversation starters (maximum 6)"
}

# ===========================================
# OVERRIDES FROM v1.5
# ===========================================

# v1.6 allows 12 conversation starters (was 6 in v1.5)
deny contains result if {
  input.conversation_starters
  count(input.conversation_starters) > 12
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "conversation_starters",
    "message": "Too many conversation starters (maximum 12)"
  }
}

# ===========================================
# NEW IN v1.6: WORKER AGENTS
# ===========================================

deny contains result if {
  input.worker_agents
  count(input.worker_agents) > 10
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "worker_agents",
    "message": "Too many worker agents (maximum 10)"
  }
}

deny contains result if {
  some i
  agent := input.worker_agents[i]
  not agent.id
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("worker_agents[%d].id", [i]),
    "message": "Worker agent ID is required"
  }
}

deny contains result if {
  some i
  agent := input.worker_agents[i]
  agent.id
  not formats.is_valid_prefixed_guid(agent.id)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("worker_agents[%d].id", [i]),
    "message": "Worker agent ID must be a valid GUID (optional T_, U_, or P_ prefix allowed)"
  }
}

# Worker agent id and file are mutually exclusive (60001)
deny contains result if {
  some i
  agent := input.worker_agents[i]
  agent.id
  agent.file
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("worker_agents[%d]", [i]),
    "message": "Worker agent 'id' and 'file' are mutually exclusive — provide one or the other"
  }
}

# ===========================================
# NEW IN v1.6: NAME PATTERN (30002)
# ===========================================

# Name pattern check (30002) — warning level since common usage includes spaces
deny contains result if {
  input.name
  formats.is_not_empty(input.name)
  not formats.is_valid_da_name(input.name)
  result := {
    "code": "M365-002",
    "severity": "warning",
    "path": "name",
    "message": "Name contains characters outside recommended pattern (alphanumeric, underscores, and spaces only)"
  }
}

# ===========================================
# NEW IN v1.6: BEHAVIOR OVERRIDES (82000)
# ===========================================

deny contains result if {
  input.behavior_overrides
  input.behavior_overrides.default_response_mode
  valid_modes := ["Auto", "Quick response", "Think deeper"]
  not input.behavior_overrides.default_response_mode in valid_modes
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": "behavior_overrides.default_response_mode",
    "message": sprintf("Invalid response mode: '%s'. Allowed values: Auto, Quick response, Think deeper", [input.behavior_overrides.default_response_mode])
  }
}

# ===========================================
# NEW IN v1.6: USER OVERRIDES (70000-70002, 81000-81002)
# ===========================================

# path is required (81001)
deny contains result if {
  some i
  override := input.user_overrides[i]
  not override.path
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("user_overrides[%d].path", [i]),
    "message": "User override 'path' is required"
  }
}

# path must be valid JSONPath targeting capabilities (70000, 70001)
deny contains result if {
  some i
  override := input.user_overrides[i]
  override.path
  not startswith(override.path, "$.capabilities")
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("user_overrides[%d].path", [i]),
    "message": "User override 'path' must target 'capabilities' (expected prefix: '$.capabilities')"
  }
}

# allowed_actions must have at least 1 item (81000)
deny contains result if {
  some i
  override := input.user_overrides[i]
  override.allowed_actions
  count(override.allowed_actions) == 0
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("user_overrides[%d].allowed_actions", [i]),
    "message": "allowed_actions must have at least 1 item"
  }
}

# allowed_actions values must be "remove" only (81002)
deny contains result if {
  some i
  override := input.user_overrides[i]
  some j
  action := override.allowed_actions[j]
  action != "remove"
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("user_overrides[%d].allowed_actions[%d]", [i, j]),
    "message": sprintf("Invalid user override action: '%s'. Only 'remove' is allowed", [action])
  }
}

# ===========================================
# NEW IN v1.6: CONVERSATION STARTER DEPENDSON (33002, 33100, 33101)
# ===========================================

# dependsOn name must be "capabilities" (33100)
deny contains result if {
  some i
  starter := input.conversation_starters[i]
  some j
  dep := starter.dependsOn[j]
  dep.name
  dep.name != "capabilities"
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("conversation_starters[%d].dependsOn[%d].name", [i, j]),
    "message": sprintf("dependsOn 'name' must be 'capabilities', got '%s'", [dep.name])
  }
}

# dependsOn ids must be unique within a conversation starter (33002)
deny contains result if {
  some i
  starter := input.conversation_starters[i]
  starter.dependsOn
  some j, k
  j < k
  starter.dependsOn[j].id == starter.dependsOn[k].id
  result := {
    "code": "M365-006",
    "severity": "warning",
    "path": sprintf("conversation_starters[%d].dependsOn", [i]),
    "message": sprintf("Duplicate dependsOn ID: '%s'", [starter.dependsOn[j].id])
  }
}

# dependsOn id must reference a defined capability (33101)
deny contains result if {
  some i
  starter := input.conversation_starters[i]
  some j
  dep := starter.dependsOn[j]
  dep.id
  input.capabilities
  cap_names := {cap.name | some cap in input.capabilities}
  not dep.id in cap_names
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("conversation_starters[%d].dependsOn[%d].id", [i, j]),
    "message": sprintf("dependsOn references unknown capability: '%s'", [dep.id])
  }
}
