import * as React from "react";
import { cn } from "@/lib/utils";

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Container: React.FC<ContainerProps> = ({
  children,
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1200px] px-6 md:px-12",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

