import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";

import { SpawnWrite } from "./SpawnWrite";
import { SpawnRename } from "./SpawnRename";
import { SpawnDelete } from "./SpawnDelete";
import { SpawnAddDependency } from "./SpawnAddDependency";
import { SpawnExecuteSql } from "./SpawnExecuteSql";
import { SpawnAddIntegration } from "./SpawnAddIntegration";
import { SpawnEdit } from "./SpawnEdit";
import { SpawnCodebaseContext } from "./SpawnCodebaseContext";
import { SpawnThink } from "./SpawnThink";
import { CodeHighlight } from "./CodeHighlight";
import { useAtomValue } from "jotai";
import { isStreamingAtom } from "@/atoms/chatAtoms";
import { CustomTagState } from "./stateTypes";
import { SpawnOutput } from "./SpawnOutput";
import { SpawnProblemSummary } from "./SpawnProblemSummary";
import { IpcClient } from "@/ipc/ipc_client";
import { SpawnMcpToolCall } from "./SpawnMcpToolCall";
import { SpawnMcpToolResult } from "./SpawnMcpToolResult";
import { SpawnWebSearchResult } from "./SpawnWebSearchResult";
import { SpawnWebSearch } from "./SpawnWebSearch";
import { SpawnRead } from "./SpawnRead";

interface SpawnMarkdownParserProps {
  content: string;
}

type CustomTagInfo = {
  tag: string;
  attributes: Record<string, string>;
  content: string;
  fullMatch: string;
  inProgress?: boolean;
};

type ContentPiece =
  | { type: "markdown"; content: string }
  | { type: "custom-tag"; tagInfo: CustomTagInfo };

const customLink = ({
  node: _node,
  ...props
}: {
  node?: any;
  [key: string]: any;
}) => (
  <a
    {...props}
    onClick={(e) => {
      const url = props.href;
      if (url) {
        e.preventDefault();
        IpcClient.getInstance().openExternalUrl(url);
      }
    }}
  />
);

export const VanillaMarkdownParser = ({ content }: { content: string }) => {
  return (
    <ReactMarkdown
      components={{
        code: CodeHighlight,
        a: customLink,
      }}
    >
      {content}
    </ReactMarkdown>
  );
};

/**
 * Custom component to parse markdown content with Spawn-specific tags
 */
export const SpawnMarkdownParser: React.FC<SpawnMarkdownParserProps> = ({
  content,
}) => {
  const isStreaming = useAtomValue(isStreamingAtom);
  // Extract content pieces (markdown and custom tags)
  const contentPieces = useMemo(() => {
    return parseCustomTags(content);
  }, [content]);

  return (
    <>
      {contentPieces.map((piece, index) => (
        <React.Fragment key={index}>
          {piece.type === "markdown"
            ? piece.content && (
                <ReactMarkdown
                  components={{
                    code: CodeHighlight,
                    a: customLink,
                  }}
                >
                  {piece.content}
                </ReactMarkdown>
              )
            : renderCustomTag(piece.tagInfo, { isStreaming })}
        </React.Fragment>
      ))}
    </>
  );
};

/**
 * Pre-process content to handle unclosed custom tags
 * Adds closing tags at the end of the content for any unclosed custom tags
 * Assumes the opening tags are complete and valid
 * Returns the processed content and a map of in-progress tags
 */
function preprocessUnclosedTags(content: string): {
  processedContent: string;
  inProgressTags: Map<string, Set<number>>;
} {
  const customTagNames = [
    "spawn-write",
    "spawn-rename",
    "spawn-delete",
    "spawn-add-dependency",
    "spawn-execute-sql",
    "spawn-add-integration",
    "spawn-output",
    "spawn-problem-report",
    "spawn-chat-summary",
    "spawn-edit",
    "spawn-codebase-context",
    "spawn-web-search-result",
    "spawn-web-search",
    "spawn-read",
    "think",
    "spawn-command",
    "spawn-mcp-tool-call",
    "spawn-mcp-tool-result",
  ];

  let processedContent = content;
  // Map to track which tags are in progress and their positions
  const inProgressTags = new Map<string, Set<number>>();

  // For each tag type, check if there are unclosed tags
  for (const tagName of customTagNames) {
    // Count opening and closing tags
    const openTagPattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, "g");
    const closeTagPattern = new RegExp(`</${tagName}>`, "g");

    // Track the positions of opening tags
    const openingMatches: RegExpExecArray[] = [];
    let match;

    // Reset regex lastIndex to start from the beginning
    openTagPattern.lastIndex = 0;

    while ((match = openTagPattern.exec(processedContent)) !== null) {
      openingMatches.push({ ...match });
    }

    const openCount = openingMatches.length;
    const closeCount = (processedContent.match(closeTagPattern) || []).length;

    // If we have more opening than closing tags
    const missingCloseTags = openCount - closeCount;
    if (missingCloseTags > 0) {
      // Add the required number of closing tags at the end
      processedContent += Array(missingCloseTags)
        .fill(`</${tagName}>`)
        .join("");

      // Mark the last N tags as in progress where N is the number of missing closing tags
      const inProgressIndexes = new Set<number>();
      const startIndex = openCount - missingCloseTags;
      for (let i = startIndex; i < openCount; i++) {
        inProgressIndexes.add(openingMatches[i].index);
      }
      inProgressTags.set(tagName, inProgressIndexes);
    }
  }

  return { processedContent, inProgressTags };
}

/**
 * Parse the content to extract custom tags and markdown sections into a unified array
 */
function parseCustomTags(content: string): ContentPiece[] {
  const { processedContent, inProgressTags } = preprocessUnclosedTags(content);

  const customTagNames = [
    "spawn-write",
    "spawn-rename",
    "spawn-delete",
    "spawn-add-dependency",
    "spawn-execute-sql",
    "spawn-add-integration",
    "spawn-output",
    "spawn-problem-report",
    "spawn-chat-summary",
    "spawn-edit",
    "spawn-codebase-context",
    "spawn-web-search-result",
    "spawn-web-search",
    "spawn-read",
    "think",
    "spawn-command",
    "spawn-mcp-tool-call",
    "spawn-mcp-tool-result",
  ];

  const tagPattern = new RegExp(
    `<(${customTagNames.join("|")})\\s*([^>]*)>(.*?)<\\/\\1>`,
    "gs",
  );

  const contentPieces: ContentPiece[] = [];
  let lastIndex = 0;
  let match;

  // Find all custom tags
  while ((match = tagPattern.exec(processedContent)) !== null) {
    const [fullMatch, tag, attributesStr, tagContent] = match;
    const startIndex = match.index;

    // Add the markdown content before this tag
    if (startIndex > lastIndex) {
      contentPieces.push({
        type: "markdown",
        content: processedContent.substring(lastIndex, startIndex),
      });
    }

    // Parse attributes
    const attributes: Record<string, string> = {};
    const attrPattern = /(\w+)="([^"]*)"/g;
    let attrMatch;
    while ((attrMatch = attrPattern.exec(attributesStr)) !== null) {
      attributes[attrMatch[1]] = attrMatch[2];
    }

    // Check if this tag was marked as in progress
    const tagInProgressSet = inProgressTags.get(tag);
    const isInProgress = tagInProgressSet?.has(startIndex);

    // Add the tag info
    contentPieces.push({
      type: "custom-tag",
      tagInfo: {
        tag,
        attributes,
        content: tagContent,
        fullMatch,
        inProgress: isInProgress || false,
      },
    });

    lastIndex = startIndex + fullMatch.length;
  }

  // Add the remaining markdown content
  if (lastIndex < processedContent.length) {
    contentPieces.push({
      type: "markdown",
      content: processedContent.substring(lastIndex),
    });
  }

  return contentPieces;
}

function getState({
  isStreaming,
  inProgress,
}: {
  isStreaming?: boolean;
  inProgress?: boolean;
}): CustomTagState {
  if (!inProgress) {
    return "finished";
  }
  return isStreaming ? "pending" : "aborted";
}

/**
 * Render a custom tag based on its type
 */
function renderCustomTag(
  tagInfo: CustomTagInfo,
  { isStreaming }: { isStreaming: boolean },
): React.ReactNode {
  const { tag, attributes, content, inProgress } = tagInfo;

  switch (tag) {
    case "spawn-read":
      return (
        <SpawnRead
          node={{
            properties: {
              path: attributes.path || "",
            },
          }}
        >
          {content}
        </SpawnRead>
      );
    case "spawn-web-search":
      return (
        <SpawnWebSearch
          node={{
            properties: {},
          }}
        >
          {content}
        </SpawnWebSearch>
      );
    case "spawn-web-search-result":
      return (
        <SpawnWebSearchResult
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </SpawnWebSearchResult>
      );
    case "think":
      return (
        <SpawnThink
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </SpawnThink>
      );
    case "spawn-write":
      return (
        <SpawnWrite
          node={{
            properties: {
              path: attributes.path || "",
              description: attributes.description || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </SpawnWrite>
      );

    case "spawn-rename":
      return (
        <SpawnRename
          node={{
            properties: {
              from: attributes.from || "",
              to: attributes.to || "",
            },
          }}
        >
          {content}
        </SpawnRename>
      );

    case "spawn-delete":
      return (
        <SpawnDelete
          node={{
            properties: {
              path: attributes.path || "",
            },
          }}
        >
          {content}
        </SpawnDelete>
      );

    case "spawn-add-dependency":
      return (
        <SpawnAddDependency
          node={{
            properties: {
              packages: attributes.packages || "",
            },
          }}
        >
          {content}
        </SpawnAddDependency>
      );

    case "spawn-execute-sql":
      return (
        <SpawnExecuteSql
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
              description: attributes.description || "",
            },
          }}
        >
          {content}
        </SpawnExecuteSql>
      );

    case "spawn-add-integration":
      return (
        <SpawnAddIntegration
          node={{
            properties: {
              provider: attributes.provider || "",
            },
          }}
        >
          {content}
        </SpawnAddIntegration>
      );

    case "spawn-edit":
      return (
        <SpawnEdit
          node={{
            properties: {
              path: attributes.path || "",
              description: attributes.description || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </SpawnEdit>
      );

    case "spawn-codebase-context":
      return (
        <SpawnCodebaseContext
          node={{
            properties: {
              files: attributes.files || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </SpawnCodebaseContext>
      );

    case "spawn-mcp-tool-call":
      return (
        <SpawnMcpToolCall
          node={{
            properties: {
              serverName: attributes.server || "",
              toolName: attributes.tool || "",
            },
          }}
        >
          {content}
        </SpawnMcpToolCall>
      );

    case "spawn-mcp-tool-result":
      return (
        <SpawnMcpToolResult
          node={{
            properties: {
              serverName: attributes.server || "",
              toolName: attributes.tool || "",
            },
          }}
        >
          {content}
        </SpawnMcpToolResult>
      );

    case "spawn-output":
      return (
        <SpawnOutput
          type={attributes.type as "warning" | "error"}
          message={attributes.message}
        >
          {content}
        </SpawnOutput>
      );

    case "spawn-problem-report":
      return (
        <SpawnProblemSummary summary={attributes.summary}>
          {content}
        </SpawnProblemSummary>
      );

    case "spawn-chat-summary":
      // Don't render anything for spawn-chat-summary
      return null;

    case "spawn-command":
      // Don't render anything for spawn-command
      return null;

    default:
      return null;
  }
}
