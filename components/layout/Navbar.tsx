import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

export interface NavbarProps {
  className?: string;
}

export const Navbar: React.FC<NavbarProps> = ({ className }) => {
  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 h-16 md:h-[72px] bg-[rgba(0,0,0,0.35)] backdrop-blur-[12px]",
        className
      )}
    >
      <Container className="flex h-full items-center justify-between pl-0 pr-6 md:pr-12">
        <Link href="/" className="text-lg font-bold text-[#E5E5E5] -ml-12">
          Arhitekt AI
        </Link>
        <nav className="flex items-center gap-8">
          <Link
            href="/"
            className="text-[15px] font-medium text-[#BFBFBF] transition-colors duration-200 ease-in-out hover:text-white"
          >
            Home
          </Link>
          <Link
            href="/ai-features"
            className="text-[15px] font-medium text-[#BFBFBF] transition-colors duration-200 ease-in-out hover:text-white"
          >
            AI Features
          </Link>
          <Link
            href="/pricing"
            className="text-[15px] font-medium text-[#BFBFBF] transition-colors duration-200 ease-in-out hover:text-white"
          >
            Pricing
          </Link>
          <Link
            href="/about"
            className="text-[15px] font-medium text-[#BFBFBF] transition-colors duration-200 ease-in-out hover:text-white"
          >
            About
          </Link>
          <Link
            href="/contact"
            className="text-[15px] font-medium text-[#BFBFBF] transition-colors duration-200 ease-in-out hover:text-white"
          >
            Contact
          </Link>
          <Link
            href="/sign-in"
            className="px-5 py-2 text-[15px] font-semibold text-[#EAEAEA] border border-[rgba(255,255,255,0.18)] rounded-lg bg-transparent transition-all duration-200 ease-in-out hover:bg-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.25)] active:bg-[rgba(255,255,255,0.12)] active:border-[rgba(255,255,255,0.35)]"
          >
            Sign in
          </Link>
        </nav>
      </Container>
    </header>
  );
};
