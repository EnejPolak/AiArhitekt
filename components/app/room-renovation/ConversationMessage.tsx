"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ConversationMessageProps {
  type: "ai" | "user";
  content: React.ReactNode;
  className?: string;
  // Typing state for AI messages
  isTyping?: boolean;
  hasTyped?: boolean;
}

// Blinking cursor component
const BlinkingCursor: React.FC = () => {
  const [isVisible, setIsVisible] = React.useState(true);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setIsVisible((prev) => !prev);
    }, 530); // Blink every ~530ms (natural pace)

    return () => clearInterval(interval);
  }, []);

  return (
    <span
      className={cn(
        "inline-block ml-[2px]",
        "text-[rgba(255,255,255,0.85)]",
        isVisible ? "opacity-100" : "opacity-0",
        "transition-opacity duration-300"
      )}
    >
      ▍
    </span>
  );
};

export const ConversationMessage: React.FC<ConversationMessageProps> = ({
  type,
  content,
  className,
  isTyping = false,
  hasTyped = false,
}) => {
  // Determine if we should show cursor (only for AI string messages that are typing)
  const isStringContent = typeof content === "string";
  const showCursor = type === "ai" && isTyping && !hasTyped && isStringContent;

  if (type === "user") {
    return (
      <div className={cn("flex justify-end mb-6", className)}>
        <div className="max-w-[75%] rounded-[16px] px-5 py-4 bg-[rgba(59,130,246,0.15)] border border-[rgba(59,130,246,0.25)]">
          <div className="text-[14px] text-white leading-relaxed">
            {typeof content === "string" ? content : content}
          </div>
        </div>
      </div>
    );
  }

  // AI message
  return (
    <div className={cn("flex justify-start mb-6", className)}>
      <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
        <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
          {isStringContent ? (
            <span className="whitespace-pre-wrap">
              {content}
              {showCursor && <BlinkingCursor />}
            </span>
          ) : (
            content
          )}
        </div>
      </div>
    </div>
  );
};
