import React, { type ReactNode } from "react";

type Props = {
  text: string;
  className?: string;
};

/**
 * Cleanly format any message into natural, human-friendly conversational Arabic/English
 * completely removing raw markdown artifacts (*, **, ---, stray bullets, hashes) while
 * preserving elegant structure, readable highlights, and natural flow.
 */
export function FormattedMessage({ text, className = "" }: Props) {
  if (!text) return null;

  // Clean raw dividers and weird dashed bullet combinations across text
  const cleanedText = text
    .replace(/^\s*[-—_]{2,}\s*[•*]?\s*$/gm, "") // remove stray dividers and dashed bullets
    .replace(/^[•*\-\s]*[-—]{2,}[•*\-\s]*$/gm, "");

  const rawLines = cleanedText.split(/\r?\n/);
  const elements: ReactNode[] = [];

  const formatInline = (inlineText: string): ReactNode[] => {
    // 1. First clean any stray markdown hashes or weird tags
    let clean = inlineText.replace(/^#{1,6}\s*/, "");

    // 2. Extract links
    const parts: ReactNode[] = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)|https?:\/\/[^\s)]+/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    const parseHighlightsAndClean = (subText: string, keyPrefix: string): ReactNode[] => {
      const subParts: ReactNode[] = [];
      // Match bold tags **text** or *text*
      const boldRegex = /\*{1,3}([^*]+)\*{1,3}/g;
      let bLast = 0;
      let bMatch: RegExpExecArray | null;

      while ((bMatch = boldRegex.exec(subText)) !== null) {
        if (bMatch.index > bLast) {
          const before = subText.substring(bLast, bMatch.index).replace(/\*/g, "");
          if (before) subParts.push(before);
        }
        const boldContent = bMatch[1].trim().replace(/\*/g, "");
        if (boldContent) {
          subParts.push(
            <strong key={`${keyPrefix}-b-${bMatch.index}`} className="assistant-bold">
              {boldContent}
            </strong>
          );
        }
        bLast = bMatch.index + bMatch[0].length;
      }

      if (bLast < subText.length) {
        const after = subText.substring(bLast).replace(/\*/g, "");
        if (after) {
          // Check if there is a "Title: Description" pattern to make the title bold naturally
          const colonMatch = after.match(/^([^:：\n]{2,35}[:：])\s*(.+)$/);
          if (colonMatch) {
            subParts.push(
              <strong key={`${keyPrefix}-title`} className="assistant-bold">
                {colonMatch[1]}
              </strong>
            );
            subParts.push(" " + colonMatch[2]);
          } else {
            subParts.push(after);
          }
        }
      }
      return subParts;
    };

    while ((match = linkRegex.exec(clean)) !== null) {
      if (match.index > lastIndex) {
        parts.push(...parseHighlightsAndClean(clean.substring(lastIndex, match.index), `txt-${lastIndex}`));
      }
      const label = (match[1] || match[0]).replace(/\*/g, "");
      const url = match[2] || match[0];
      parts.push(
        <a
          key={`link-${match.index}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="assistant-msg-link"
        >
          {label}
        </a>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < clean.length) {
      parts.push(...parseHighlightsAndClean(clean.substring(lastIndex), `txt-${lastIndex}`));
    }

    return parts;
  };

  let listBuffer: { type: "ol" | "ul"; items: string[] } | null = null;

  const flushList = (key: string) => {
    if (!listBuffer) return null;
    const currentList = listBuffer;
    listBuffer = null;
    return (
      <div key={key} className={`assistant-msg-list ${currentList.type === "ol" ? "numbered" : "bulleted"}`}>
        {currentList.items.map((item, idx) => (
          <div key={idx} className="assistant-msg-list-item">
            <span className="assistant-item-bullet">
              {currentList.type === "ol" ? `${idx + 1}.` : "•"}
            </span>
            <div className="assistant-item-content">{formatInline(item)}</div>
          </div>
        ))}
      </div>
    );
  };

  rawLines.forEach((line, index) => {
    let trimmed = line.trim();

    // Skip empty lines or pure dividers
    if (!trimmed || /^[-—_]{2,}$/.test(trimmed) || trimmed === "-- •" || trimmed === "***") {
      if (listBuffer) elements.push(flushList(`fl-${index}`));
      return;
    }

    // Check heading (###, ##, # or wrapped in asterisks like **Heading**)
    const headingMatch = trimmed.match(/^#{1,4}\s*(.+)$/);
    if (headingMatch) {
      if (listBuffer) elements.push(flushList(`fl-${index}`));
      const headingText = headingMatch[1].replace(/^\*+|\*+$/g, "").trim();
      elements.push(
        <div key={`h-${index}`} className="assistant-msg-heading">
          {formatInline(headingText)}
        </div>
      );
      return;
    }

    // Check numbered major section header like **1. Section Title:** or 1. Section Title:
    const majorNumberedMatch = trimmed.match(/^[*•\s]*(\d+)[\.\)]\s*([^*]+?)\**[:：]?\**$/);
    if (majorNumberedMatch && trimmed.includes(":") && trimmed.length < 90) {
      if (listBuffer) elements.push(flushList(`fl-${index}`));
      const titleClean = `${majorNumberedMatch[1]}. ${majorNumberedMatch[2].replace(/\*/g, "").trim()}:`;
      elements.push(
        <div key={`maj-h-${index}`} className="assistant-msg-heading" style={{ marginTop: "12px", marginBottom: "6px" }}>
          {formatInline(titleClean)}
        </div>
      );
      return;
    }

    // Check numbered list (e.g. 1. or 1) )
    const numberedMatch = trimmed.match(/^[*•\s]*(\d+)[\.\)]\s*(.+)$/);
    if (numberedMatch) {
      if (!listBuffer || listBuffer.type !== "ol") {
        if (listBuffer) elements.push(flushList(`fl-${index}`));
        listBuffer = { type: "ol", items: [] };
      }
      listBuffer.items.push(numberedMatch[2].replace(/^\*+|\*+$/g, "").trim());
      return;
    }

    // Check bullet list (*, -, •)
    const bulletMatch = trimmed.match(/^[•\-\*]\s+(.+)$/);
    if (bulletMatch) {
      const cleanBulletItem = bulletMatch[1].replace(/^\*+|\*+$/g, "").trim();
      if (!listBuffer || listBuffer.type !== "ul") {
        if (listBuffer) elements.push(flushList(`fl-${index}`));
        listBuffer = { type: "ul", items: [] };
      }
      listBuffer.items.push(cleanBulletItem);
      return;
    }

    // Regular line
    if (listBuffer) elements.push(flushList(`fl-${index}`));
    elements.push(
      <p key={`p-${index}`} className="assistant-msg-para">
        {formatInline(trimmed)}
      </p>
    );
  });

  if (listBuffer) {
    elements.push(flushList(`fl-final`));
  }

  return <div className={`assistant-msg-structured ${className}`}>{elements}</div>;
}
