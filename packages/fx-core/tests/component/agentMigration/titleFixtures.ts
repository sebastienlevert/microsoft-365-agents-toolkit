// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { deflateSync } from "zlib";
import { crc32, JsonObject } from "../../../src/component/agentMigration/model";

export const syntheticTitle = "SyntheticTitle_001";
export const syntheticInstructions =
  "\uFEFFPreserve this synthetic snapshot.\nCaf\u00e9 \u{1f680}\n${{LITERAL}} $[file('not-a-source.txt')] $& $$ $` $'";
export const syntheticLargeIcon = "https://res.cdn.office.net/synthetic/title/color.png";
export const syntheticSmallIcon =
  "https://store-images.s-microsoft.com/synthetic/title/preview.png";

export function syntheticPng(size: number): Buffer {
  function chunk(type: string, data: Buffer): Buffer {
    const payload = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(payload));
    return Buffer.concat([length, payload, checksum]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.alloc((size * 4 + 1) * size))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function syntheticLaunchInfo(): JsonObject {
  return {
    ingestionId: "synthetic-ingestion",
    name: "Synthetic writing helper",
    elementDefinitions: {
      declarativeCopilots: [
        {
          $schema: "https://aka.ms/json-schemas/copilot/declarative-agent/v1.0/schema.json",
          version: "v1.0",
          id: "declarativeAgent",
          name: "Synthetic writing helper",
          description: "A permission-free snapshot used only for automated tests.",
          instructions: syntheticInstructions,
          conversation_starters: Array.from({ length: 6 }, (_, index) => ({
            title: `Starter ${index + 1}`,
            text: `Synthetic question ${index + 1}`,
          })),
          capabilities: [{ name: "OneDriveAndSharePoint" }, { name: "GraphConnectors" }],
        },
      ],
    },
    version: "2.3.4",
    manifestVersion: "1.19",
    iconLarge: { uri: syntheticLargeIcon },
    iconSmall: { uri: syntheticSmallIcon },
    accentColor: "#102030",
    blockStatus: false,
    ingestionSource: "synthetic",
    shortDescription: "Synthetic snapshot",
    developerName: "Synthetic author",
    validDomains: [],
    scope: "Personal",
    isFullTrust: false,
    showLoadingIndicator: false,
    isFullScreen: false,
    cultureName: "en-us",
    appType: "DeclarativeCopilot",
    isShareable: false,
    isOwner: false,
    isAppIOSAcquirable: true,
    billingInfo: { billingTierInfo: {} },
    capabilities: ["DeclarativeCopilots"],
  };
}
