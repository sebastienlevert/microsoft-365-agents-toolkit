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
