// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { DiagnosticContext } from "../../diagnostics/diagnostic-reporter";
import {
  validateEmail,
  validateArrayMaxLength,
  validateNoDuplicates,
  getValueAtPath,
  forEachArrayItem,
} from "../utils";

interface EmailCapability {
  name: "Email";
  shared_mailbox?: string;
  group_mailboxes?: string[];
}

/**
 * Validate Email capability
 */
export function validateEmailCapability(
  ctx: DiagnosticContext,
  content: unknown,
  capabilityPath: (string | number)[]
): void {
  const capability = getValueAtPath(content, capabilityPath) as EmailCapability;
  if (!capability || capability.name !== "Email") {
    return;
  }

  // Validate shared_mailbox email format
  if (capability.shared_mailbox !== undefined) {
    validateEmail(ctx, content, [...capabilityPath, "shared_mailbox"], "shared_mailbox");
  }

  // Validate group_mailboxes
  const groupPath = [...capabilityPath, "group_mailboxes"];
  const groupMailboxes = getValueAtPath(content, groupPath);

  if (Array.isArray(groupMailboxes)) {
    // Max 25 group mailboxes
    validateArrayMaxLength(ctx, content, groupPath, "group_mailboxes", 25);

    // No duplicates
    validateNoDuplicates(ctx, content, groupPath, "group_mailboxes");

    // Each must be valid email
    forEachArrayItem<string>(content, groupPath, (_email, index, itemPath) => {
      validateEmail(ctx, content, itemPath, `group_mailboxes[${index}]`);
    });
  }
}
