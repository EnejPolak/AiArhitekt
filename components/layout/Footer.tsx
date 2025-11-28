import * as React from "react";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

export interface FooterProps {
  className?: string;
}

export const Footer: React.FC<FooterProps> = ({ className }) => {
  return (
    <footer
      className={cn(
        "border-t border-white/10 py-12 text-sm text-[#AFAFAF]",
        className
      )}
    >
      <Container>
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <p>© 2024 Arhitekt AI. All rights reserved.</p>
          <nav className="flex gap-6">
            <a
              href="#privacy"
              className="transition-colors hover:text-white"
            >
              Privacy
            </a>
            <a
              href="#terms"
              className="transition-colors hover:text-white"
            >
              Terms
            </a>
            <a
              href="#contact"
              className="transition-colors hover:text-white"
            >
              Contact
            </a>
          </nav>
        </div>
      </Container>
    </footer>
  );
};

