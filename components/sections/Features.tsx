import * as React from "react";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

export interface FeaturesProps {
  className?: string;
}

export const Features: React.FC<FeaturesProps> = ({ className }) => {
  return (
    <section
      id="how-it-works"
      className={cn("py-24", className)}
    >
      <Container>
        <div className="text-center">
          <h2 className="mb-4 text-4xl font-extrabold leading-[1.1] text-white md:text-5xl">
            How It Works
          </h2>
          <p className="mx-auto max-w-[600px] text-lg text-[#AFAFAF]">
            Simple steps to transform your plans into reality
          </p>
        </div>
      </Container>
    </section>
  );
};

