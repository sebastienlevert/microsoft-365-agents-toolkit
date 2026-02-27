# Declarative Agent v1.0 capabilities validation (base version)
package m365.v1_0.capabilities

import rego.v1
import data.m365.common.formats

# Helper to get first capability by name
get_first_capability(name) := cap if {
  cap := [c | some c in input.capabilities; c.name == name][0]
}

# ===========================================
# DUPLICATE CAPABILITIES CHECK
# ===========================================

deny contains result if {
  input.capabilities
  cap_names := [c.name | some c in input.capabilities]
  some i, j
  i < j
  cap_names[i] == cap_names[j]
  result := {
    "code": "M365-006",
    "severity": "warning",
    "path": sprintf("capabilities[%d]", [j]),
    "message": sprintf("Duplicate capability type: %s", [cap_names[i]])
  }
}

# ===========================================
# WEB SEARCH CAPABILITY (v1.0: max 2 sites)
# ===========================================

deny contains result if {
  cap := get_first_capability("WebSearch")
  cap.sites
  count(cap.sites) > 2
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "capabilities[WebSearch].sites",
    "message": "Too many sites (maximum 2)"
  }
}

deny contains result if {
  cap := get_first_capability("WebSearch")
  some i
  site := cap.sites[i]
  site.url
  not formats.is_absolute_http_url(site.url)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("capabilities[WebSearch].sites[%d].url", [i]),
    "message": "URL must be absolute HTTP/HTTPS"
  }
}

deny contains result if {
  cap := get_first_capability("WebSearch")
  some i
  site := cap.sites[i]
  site.url
  formats.has_query_params(site.url)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("capabilities[WebSearch].sites[%d].url", [i]),
    "message": "URL must not have query parameters"
  }
}

# ===========================================
# GRAPH CONNECTORS CAPABILITY
# ===========================================

# ===========================================
# GRAPH CONNECTORS: EMPTY CONNECTION_ID
# ===========================================

deny contains result if {
  cap := get_first_capability("GraphConnectors")
  some i
  conn := cap.connections[i]
  conn.connection_id
  not formats.is_not_empty(conn.connection_id)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("capabilities[GraphConnectors].connections[%d].connection_id", [i]),
    "message": "connection_id must contain non-whitespace characters"
  }
}

deny contains result if {
  cap := get_first_capability("GraphConnectors")
  some i
  conn := cap.connections[i]
  conn.additional_search_terms
  chars := split(conn.additional_search_terms, "")
  opens := count([c | c := chars[_]; c == "("])
  closes := count([c | c := chars[_]; c == ")"])
  opens != closes
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("capabilities[GraphConnectors].connections[%d].additional_search_terms", [i]),
    "message": "Invalid KQL query: Unbalanced parentheses in KQL query"
  }
}

deny contains result if {
  cap := get_first_capability("GraphConnectors")
  some i
  conn := cap.connections[i]
  conn.additional_search_terms
  chars := split(conn.additional_search_terms, "")
  quotes := count([c | c := chars[_]; c == "\""])
  quotes % 2 != 0
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("capabilities[GraphConnectors].connections[%d].additional_search_terms", [i]),
    "message": "Invalid KQL query: Unbalanced quotes in KQL query"
  }
}
