import * as React from "react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export interface CTAProps {
  className?: string;
}

export const CTA: React.FC<CTAProps> = ({ className }) => {
  return (
    <section
      id="contact"
      className={cn("py-24", className)}
    >
      <Container>
        <div className="text-center">
          <h2 className="mb-4 text-4xl font-extrabold leading-[1.1] text-white md:text-5xl">
            Ready to Get Started?
          </h2>
          <p className="mx-auto mb-8 max-w-[600px] text-lg text-[#AFAFAF]">
            Contact us today to begin your project
          </p>
          <Button variant="default" size="default">
            Get Started
          </Button>
        </div>
      </Container>
    </section>
  );
};

