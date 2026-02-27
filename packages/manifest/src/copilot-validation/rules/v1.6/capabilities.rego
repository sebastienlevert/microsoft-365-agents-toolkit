# Declarative Agent v1.6 capabilities validation
# Inherits from v1.5 with additions
package m365.v1_6.capabilities

import rego.v1
import data.m365.v1_5.capabilities as base
import data.m365.common.formats

# Inherit all v1.5 capability rules
deny contains result if {
  some result in base.deny
}

# ===========================================
# NEW IN v1.6: SCENARIO MODELS CAPABILITY
# ===========================================

deny contains result if {
  some cap in input.capabilities
  cap.name == "ScenarioModels"
  not cap.models
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": "capabilities[ScenarioModels].models",
    "message": "Models array is required"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "ScenarioModels"
  cap.models
  count(cap.models) == 0
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": "capabilities[ScenarioModels].models",
    "message": "At least one model is required"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "ScenarioModels"
  some i
  model := cap.models[i]
  not model.id
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("capabilities[ScenarioModels].models[%d].id", [i]),
    "message": "Model ID is required"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "ScenarioModels"
  some i
  model := cap.models[i]
  model.id
  not formats.is_not_empty(model.id)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("capabilities[ScenarioModels].models[%d].id", [i]),
    "message": "Model ID must contain non-whitespace characters"
  }
}
