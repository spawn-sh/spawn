import { cleanFullResponse } from "@/ipc/utils/cleanFullResponse";
import { describe, it, expect } from "vitest";

describe("cleanFullResponse", () => {
  it("should replace < characters in spawn-write attributes", () => {
    const input = `<spawn-write path="src/file.tsx" description="Testing <a> tags.">content</spawn-write>`;
    const expected = `<spawn-write path="src/file.tsx" description="Testing ＜a＞ tags.">content</spawn-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should replace < characters in multiple attributes", () => {
    const input = `<spawn-write path="src/<component>.tsx" description="Testing <div> tags.">content</spawn-write>`;
    const expected = `<spawn-write path="src/＜component＞.tsx" description="Testing ＜div＞ tags.">content</spawn-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle multiple nested HTML tags in a single attribute", () => {
    const input = `<spawn-write path="src/file.tsx" description="Testing <div> and <span> and <a> tags.">content</spawn-write>`;
    const expected = `<spawn-write path="src/file.tsx" description="Testing ＜div＞ and ＜span＞ and ＜a＞ tags.">content</spawn-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle complex example with mixed content", () => {
    const input = `
      BEFORE TAG
  <spawn-write path="src/pages/locations/neighborhoods/louisville/Highlands.tsx" description="Updating Highlands neighborhood page to use <a> tags.">
import React from 'react';
</spawn-write>
AFTER TAG
    `;

    const expected = `
      BEFORE TAG
  <spawn-write path="src/pages/locations/neighborhoods/louisville/Highlands.tsx" description="Updating Highlands neighborhood page to use ＜a＞ tags.">
import React from 'react';
</spawn-write>
AFTER TAG
    `;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle other spawn tag types", () => {
    const input = `<spawn-rename from="src/<old>.tsx" to="src/<new>.tsx"></spawn-rename>`;
    const expected = `<spawn-rename from="src/＜old＞.tsx" to="src/＜new＞.tsx"></spawn-rename>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle spawn-delete tags", () => {
    const input = `<spawn-delete path="src/<component>.tsx"></spawn-delete>`;
    const expected = `<spawn-delete path="src/＜component＞.tsx"></spawn-delete>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should not affect content outside spawn tags", () => {
    const input = `Some text with <regular> HTML tags. <spawn-write path="test.tsx" description="With <nested> tags.">content</spawn-write> More <html> here.`;
    const expected = `Some text with <regular> HTML tags. <spawn-write path="test.tsx" description="With ＜nested＞ tags.">content</spawn-write> More <html> here.`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle empty attributes", () => {
    const input = `<spawn-write path="src/file.tsx">content</spawn-write>`;
    const expected = `<spawn-write path="src/file.tsx">content</spawn-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle attributes without < characters", () => {
    const input = `<spawn-write path="src/file.tsx" description="Normal description">content</spawn-write>`;
    const expected = `<spawn-write path="src/file.tsx" description="Normal description">content</spawn-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });
});
