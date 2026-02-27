# Declarative Agent v1.5 validation rules
# Inherits from v1.4 with additions
package m365.v1_5.agent

import rego.v1
import data.m365.v1_4.agent as base
import data.m365.common.formats

# Inherit all v1.4 rules except overridden ones
deny contains result if {
  some result in base.deny
  not is_overridden(result)
}

# Rules overridden in v1.5
is_overridden(result) if {
  result.message == "Too many conversation starters (maximum 5)"
}

# ===========================================
# OVERRIDES FROM v1.4
# ===========================================

# v1.5 increases conversation starters to 6
deny contains result if {
  input.conversation_starters
  count(input.conversation_starters) > 6
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "conversation_starters",
    "message": "Too many conversation starters (maximum 6)"
  }
}
