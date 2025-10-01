import { normalizePath } from "../../../shared/normalizePath";
import log from "electron-log";
import { SqlQuery } from "../../lib/schemas";

const logger = log.scope("spawn_tag_parser");

export function getSpawnWriteTags(fullResponse: string): {
  path: string;
  content: string;
  description?: string;
}[] {
  const spawnWriteRegex = /<spawn-write([^>]*)>([\s\S]*?)<\/spawn-write>/gi;
  const pathRegex = /path="([^"]+)"/;
  const descriptionRegex = /description="([^"]+)"/;

  let match;
  const tags: { path: string; content: string; description?: string }[] = [];

  while ((match = spawnWriteRegex.exec(fullResponse)) !== null) {
    const attributesString = match[1];
    let content = match[2].trim();

    const pathMatch = pathRegex.exec(attributesString);
    const descriptionMatch = descriptionRegex.exec(attributesString);

    if (pathMatch && pathMatch[1]) {
      const path = pathMatch[1];
      const description = descriptionMatch?.[1];

      const contentLines = content.split("\n");
      if (contentLines[0]?.startsWith("```")) {
        contentLines.shift();
      }
      if (contentLines[contentLines.length - 1]?.startsWith("```")) {
        contentLines.pop();
      }
      content = contentLines.join("\n");

      tags.push({ path: normalizePath(path), content, description });
    } else {
      logger.warn(
        "Found <spawn-write> tag without a valid 'path' attribute:",
        match[0],
      );
    }
  }
  return tags;
}

export function getSpawnRenameTags(fullResponse: string): {
  from: string;
  to: string;
}[] {
  const spawnRenameRegex =
    /<spawn-rename from="([^"]+)" to="([^"]+)"[^>]*>([\s\S]*?)<\/spawn-rename>/g;
  let match;
  const tags: { from: string; to: string }[] = [];
  while ((match = spawnRenameRegex.exec(fullResponse)) !== null) {
    tags.push({
      from: normalizePath(match[1]),
      to: normalizePath(match[2]),
    });
  }
  return tags;
}

export function getSpawnDeleteTags(fullResponse: string): string[] {
  const spawnDeleteRegex =
    /<spawn-delete path="([^"]+)"[^>]*>([\s\S]*?)<\/spawn-delete>/g;
  let match;
  const paths: string[] = [];
  while ((match = spawnDeleteRegex.exec(fullResponse)) !== null) {
    paths.push(normalizePath(match[1]));
  }
  return paths;
}

export function getSpawnAddDependencyTags(fullResponse: string): string[] {
  const spawnAddDependencyRegex =
    /<spawn-add-dependency packages="([^"]+)">[^<]*<\/spawn-add-dependency>/g;
  let match;
  const packages: string[] = [];
  while ((match = spawnAddDependencyRegex.exec(fullResponse)) !== null) {
    packages.push(...match[1].split(" "));
  }
  return packages;
}

export function getSpawnChatSummaryTag(fullResponse: string): string | null {
  const spawnChatSummaryRegex =
    /<spawn-chat-summary>([\s\S]*?)<\/spawn-chat-summary>/g;
  const match = spawnChatSummaryRegex.exec(fullResponse);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

export function getSpawnExecuteSqlTags(fullResponse: string): SqlQuery[] {
  const spawnExecuteSqlRegex =
    /<spawn-execute-sql([^>]*)>([\s\S]*?)<\/spawn-execute-sql>/g;
  const descriptionRegex = /description="([^"]+)"/;
  let match;
  const queries: { content: string; description?: string }[] = [];

  while ((match = spawnExecuteSqlRegex.exec(fullResponse)) !== null) {
    const attributesString = match[1] || "";
    let content = match[2].trim();
    const descriptionMatch = descriptionRegex.exec(attributesString);
    const description = descriptionMatch?.[1];

    // Handle markdown code blocks if present
    const contentLines = content.split("\n");
    if (contentLines[0]?.startsWith("```")) {
      contentLines.shift();
    }
    if (contentLines[contentLines.length - 1]?.startsWith("```")) {
      contentLines.pop();
    }
    content = contentLines.join("\n");

    queries.push({ content, description });
  }

  return queries;
}

export function getSpawnCommandTags(fullResponse: string): string[] {
  const spawnCommandRegex =
    /<spawn-command type="([^"]+)"[^>]*><\/spawn-command>/g;
  let match;
  const commands: string[] = [];

  while ((match = spawnCommandRegex.exec(fullResponse)) !== null) {
    commands.push(match[1]);
  }

  return commands;
}
