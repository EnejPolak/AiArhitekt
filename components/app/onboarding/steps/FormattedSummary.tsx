"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface FormattedSummaryProps {
  content: string;
}

export const FormattedSummary: React.FC<FormattedSummaryProps> = ({ content }) => {
  // Parse content with custom markup tags
  const parseContent = (text: string) => {
    const elements: React.ReactNode[] = [];
    let currentIndex = 0;
    let inCard = false;
    let cardLines: string[] = [];
    let tableRows: string[][] = [];
    let inTable = false;

    // Match all markup tags
    const tagRegex = /<(section-heading|card-header)>(.*?)<\/\1>/g;
    const matches: Array<{ type: string; content: string; index: number }> = [];
    let match;

    while ((match = tagRegex.exec(text)) !== null) {
      matches.push({
        type: match[1],
        content: match[2],
        index: match.index,
      });
    }

    // Process text with tags
    let lastIndex = 0;
    matches.forEach((tagMatch, tagIdx) => {
      // Add text before tag
      if (tagMatch.index > lastIndex) {
        const beforeText = text.substring(lastIndex, tagMatch.index);
        processPlainText(beforeText, elements);
      }

      // Add tag element
      if (tagMatch.type === "section-heading") {
        elements.push(
          <h2
            key={`section-${tagIdx}`}
            className="text-[24px] md:text-[28px] font-semibold text-white mt-10 mb-3 first:mt-0 tracking-tight"
            style={{ fontFamily: "SF Pro Display, Inter, system-ui, sans-serif" }}
          >
            {tagMatch.content}
          </h2>
        );
      } else if (tagMatch.type === "card-header") {
        elements.push(
          <h3
            key={`card-${tagIdx}`}
            className="text-[18px] md:text-[20px] font-semibold text-white mt-6 mb-2"
            style={{ fontFamily: "SF Pro Text, system-ui, sans-serif" }}
          >
            {tagMatch.content}
          </h3>
        );
      }

      lastIndex = tagMatch.index + tagMatch[0].length;
    });

    // Process remaining text after last tag
    if (lastIndex < text.length) {
      const afterText = text.substring(lastIndex);
      processPlainText(afterText, elements);
    }

    return elements;
  };

  // Process plain text (paragraphs, tables, card content)
  const processPlainText = (text: string, elements: React.ReactNode[]) => {
    const lines = text.split("\n");
    let currentParagraph: string[] = [];
    let tableRows: string[][] = [];
    let inTable = false;
    let cardContent: string[] = [];
    let inCard = false;

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      // Table detection
      if (trimmed.includes("|") && trimmed.split("|").length > 2) {
        if (!inTable) {
          // Flush paragraph if exists
          if (currentParagraph.length > 0) {
            elements.push(
              <p
                key={`p-${elements.length}`}
                className="text-[15px] md:text-[17px] text-[rgba(255,255,255,0.85)] leading-relaxed mb-4 max-w-[650px]"
                style={{ fontFamily: "SF Pro Text, system-ui, sans-serif", lineHeight: "1.55" }}
              >
                {currentParagraph.join(" ")}
              </p>
            );
            currentParagraph = [];
          }
          inTable = true;
          tableRows = [];
        }
        const cells = trimmed
          .split("|")
          .map((cell) => cell.trim())
          .filter((cell) => cell.length > 0);
        if (cells.length > 0 && !cells.every((cell) => /^[-:]+$/.test(cell))) {
          tableRows.push(cells);
        }
      }
      // Card content (lines with ":" labels)
      else if (trimmed.includes(":") && !trimmed.startsWith("http")) {
        if (inTable && tableRows.length > 0) {
          // Render table first
          renderTable(tableRows, elements);
          tableRows = [];
          inTable = false;
        }
        if (currentParagraph.length > 0) {
          elements.push(
            <p
              key={`p-${elements.length}`}
              className="text-[15px] md:text-[17px] text-[rgba(255,255,255,0.85)] leading-relaxed mb-4 max-w-[650px]"
              style={{ fontFamily: "SF Pro Text, system-ui, sans-serif", lineHeight: "1.55" }}
            >
              {currentParagraph.join(" ")}
            </p>
          );
          currentParagraph = [];
        }
        // Add card line
        const [label, ...valueParts] = trimmed.split(":");
        const value = valueParts.join(":").trim();
        elements.push(
          <div key={`card-line-${index}`} className="mb-2">
            <span className="text-[rgba(255,255,255,0.70)] font-medium">{label}:</span>{" "}
            <span className="text-[rgba(255,255,255,0.85)]">{value}</span>
          </div>
        );
      }
      // Regular paragraph text
      else if (trimmed.length > 0) {
        if (inTable && tableRows.length > 0) {
          renderTable(tableRows, elements);
          tableRows = [];
          inTable = false;
        }
        currentParagraph.push(trimmed);
      }
      // Empty line - flush paragraph
      else if (currentParagraph.length > 0) {
        elements.push(
          <p
            key={`p-${elements.length}`}
            className="text-[15px] md:text-[17px] text-[rgba(255,255,255,0.85)] leading-relaxed mb-4 max-w-[650px]"
            style={{ fontFamily: "SF Pro Text, system-ui, sans-serif", lineHeight: "1.55" }}
          >
            {currentParagraph.join(" ")}
          </p>
        );
        currentParagraph = [];
      }
    });

    // Flush remaining paragraph
    if (currentParagraph.length > 0) {
      elements.push(
        <p
          key={`p-final`}
          className="text-[15px] md:text-[17px] text-[rgba(255,255,255,0.85)] leading-relaxed mb-4 max-w-[650px]"
          style={{ fontFamily: "SF Pro Text, system-ui, sans-serif", lineHeight: "1.55" }}
        >
          {currentParagraph.join(" ")}
        </p>
      );
    }

    // Render remaining table
    if (inTable && tableRows.length > 0) {
      renderTable(tableRows, elements);
    }
  };

  // Render table
  const renderTable = (rows: string[][], elements: React.ReactNode[]) => {
    if (rows.length === 0) return;

    // Filter out separator rows
    const validRows = rows.filter(
      (row) => !row.every((cell) => /^[-:]+$/.test(cell))
    );

    if (validRows.length === 0) return;

    elements.push(
      <div key={`table-${elements.length}`} className="overflow-x-auto mb-6 mt-4">
        <table className="w-full border-collapse max-w-[650px]">
          <thead>
            <tr className="border-b border-[rgba(255,255,255,0.15)]">
              {validRows[0]?.map((header, idx) => (
                <th
                  key={idx}
                  className="text-left py-3 px-4 text-[15px] font-semibold text-white"
                  style={{ fontFamily: "SF Pro Text, system-ui, sans-serif" }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {validRows.slice(1).map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="border-b border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.03)] transition-colors"
              >
                {row.map((cell, cellIdx) => (
                  <td
                    key={cellIdx}
                    className="py-3 px-4 text-[15px] text-[rgba(255,255,255,0.75)]"
                    style={{ fontFamily: "SF Pro Text, system-ui, sans-serif" }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="w-full rounded-[16px] px-6 py-6 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
      <div className="w-full space-y-1">{parseContent(content)}</div>
    </div>
  );
};
