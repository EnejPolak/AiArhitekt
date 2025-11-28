import * as React from "react";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

export interface FeaturesProps {
  className?: string;
}

export const Features: React.FC<FeaturesProps> = ({ className }) => {
  return (
    <section
      id="ai-features"
      className={cn("py-24", className)}
    >
      <Container>
        <div className="text-center">
          <h2 className="mb-4 text-4xl font-extrabold leading-[1.1] text-white md:text-5xl">
            AI Features
          </h2>
          <p className="mx-auto max-w-[600px] text-lg text-[#AFAFAF]">
            Powerful AI capabilities for your architecture projects
          </p>
        </div>
      </Container>
    </section>
  );
};
