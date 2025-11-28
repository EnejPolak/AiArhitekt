"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

export interface ConstructionSafetyWarningContentProps {
  className?: string;
}

export const ConstructionSafetyWarningContent: React.FC<
  ConstructionSafetyWarningContentProps
> = ({ className }) => {
  return (
    <section className={cn("w-full py-20 md:py-32 relative", className)}>
      <Container className="px-6 md:px-8 max-w-[960px]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          className="max-w-none text-left"
        >
          <div className="pt-[120px] md:pt-[140px] pb-[120px]">
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              This page provides essential safety guidance for anyone using
              AI-generated architectural content from Arhitekt AI. Please read
              this warning carefully before making any construction, renovation,
              or demolition decisions based on AI-generated outputs.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              Your safety and the structural integrity of your property depend on
              following proper procedures and consulting qualified professionals.
            </p>
          </div>

          <div className="mb-9 md:mb-10">
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-3 mt-8">
              1. Non-Structural, Concept-Only Designs
            </h2>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              Arhitekt AI generates conceptual 3D previews and layouts designed
              for visualization and planning purposes only. These outputs are not
              construction-ready plans and must not be used for direct building,
              renovation, or demolition work.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              AI-generated designs may lack critical structural details, material
              specifications, load-bearing analysis, and safety validations
              required for actual construction. They do not include engineering
              calculations, foundation requirements, or compliance with building
              codes.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
              <strong>
                AI output cannot replace certified architectural or engineering
                plans.
              </strong>{" "}
              All designs must be reviewed, validated, and converted into proper
              construction documents by licensed professionals before any physical
              work begins.
            </p>
          </div>

          <div className="mb-9 md:mb-10">
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-3 mt-8">
              2. No Structural Guarantees
            </h2>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              AI outputs do not evaluate structural integrity, load-bearing
              capacity, or foundation requirements. They do not include weight
              load calculations, beam strength analysis, or foundation checks
              necessary for safe construction.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              There is no guarantee that walls, columns, or other structural
              elements shown in AI-generated layouts are load-bearing or safe to
              remove or modify. Removing or modifying structures without proper
              evaluation by a certified structural engineer is extremely dangerous
              and may result in structural failure.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
              <strong>
                Incorrect use of AI suggestions may lead to property damage,
                collapse, or injury.
              </strong>{" "}
              Always consult a licensed structural engineer before making any
              changes to load-bearing elements.
            </p>
          </div>

          <div className="mb-9 md:mb-10">
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-3 mt-8">
              3. Electrical, Plumbing & Mechanical Risks
            </h2>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              AI cannot accurately map electrical wiring, plumbing systems, gas
              lines, ventilation ducts, insulation, or mechanical systems within
              walls, floors, or ceilings. AI-generated layouts do not show the
              location of these critical systems.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              Cutting or drilling into walls, floors, or ceilings without
              professional inspection is dangerous and may result in electrical
              shock, gas leaks, water damage, or fire hazards. AI-generated
              layouts must be verified by licensed electricians, plumbers, and
              HVAC specialists before any work begins.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
              <strong>
                Never rely solely on AI output when dealing with electricity,
                water lines, gas systems, HVAC, or similar installations.
              </strong>{" "}
              Always have a qualified professional inspect and mark the location
              of all utilities before starting any work.
            </p>
          </div>

          <div className="mb-9 md:mb-10">
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-3 mt-8">
              4. Building Codes & Local Regulations
            </h2>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              Construction laws, building codes, and safety regulations vary
              significantly between countries, regions, states, and cities. AI
              output does not guarantee compliance with local code requirements,
              zoning laws, or permit regulations.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              Users are solely responsible for verifying building codes, securing
              necessary permits, and ensuring compliance with all applicable laws
              and regulations. Failure to comply with local requirements may result
              in fines, project delays, or forced demolition of non-compliant
              work.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
              <strong>
                Always consult your local municipality, architect, or structural
                engineer before starting any renovation or construction project.
              </strong>{" "}
              They can provide guidance on required permits, code compliance, and
              legal requirements specific to your location.
            </p>
          </div>

          <div className="mb-9 md:mb-10">
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-3 mt-8">
              5. Fire Safety & Emergency Regulations
            </h2>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              AI-generated layouts do not evaluate fire exits, evacuation routes,
              fireproof materials, smoke detection systems, or ventilation
              requirements. They do not consider fire load, smoke flow patterns, or
              emergency access requirements mandated by fire safety codes.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              Fire safety and emergency regulations must be reviewed by
              professionals familiar with local fire codes and building safety
              standards. Modifications to layouts that affect fire exits, smoke
              detectors, or ventilation systems require approval from fire
              marshals or building inspectors.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
              All fire safety and emergency access considerations must be reviewed
              by qualified professionals before implementing any design changes.
            </p>
          </div>

          <div className="mb-9 md:mb-10">
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-3 mt-8">
              6. No Liability for Building-Related Decisions
            </h2>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              Arhitekt AI is not responsible for construction decisions made based
              on AI-generated output. Users assume full responsibility for
              verifying structural, legal, and safety aspects of any project
              before proceeding with construction, demolition, or renovation work.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              Any construction, demolition, or renovation using AI suggestions is
              done at the user's own risk. Arhitekt AI does not warrant that
              AI-generated content is safe, code-compliant, or suitable for any
              specific construction purpose.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
              By using AI-generated content for construction purposes, you
              acknowledge that you understand and accept these risks and agree to
              hold Arhitekt AI harmless from any consequences resulting from such
              use.
            </p>
          </div>

          <div className="mb-9 md:mb-10">
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-3 mt-8">
              7. Professional Consultation Is Required
            </h2>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              <strong>
                You must hire licensed professionals — such as architects,
                engineers, electricians, plumbers, and contractors — before making
                any physical changes to your property.
              </strong>
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              AI-generated content is a starting point for discussion with
              professionals, not a replacement for professional services. Licensed
              professionals can assess your specific situation, verify structural
              requirements, ensure code compliance, and create proper construction
              documents.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
              Do not proceed with any construction work until you have received
              approval and proper documentation from qualified professionals
              licensed in your jurisdiction.
            </p>
          </div>

          <div className="mb-9 md:mb-10">
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-3 mt-8">
              8. Disclaimer of Damages
            </h2>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              To the maximum extent permitted by law, Arhitekt AI is not liable for
              any damages arising from incorrect usage of AI-generated content,
              including but not limited to:
            </p>
            <ul className="list-disc list-inside mb-3 space-y-2 ml-5">
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                property damage
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                personal injuries
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                failed renovations
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                permit rejections
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                financial losses
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                structural failures
              </li>
            </ul>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
              This limitation applies regardless of whether damages result from
              negligence, errors, omissions, or any other cause related to the use
              of AI-generated content.
            </p>
          </div>

          <div className="mb-9 md:mb-10">
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-3 mt-8">
              9. Updates to This Warning
            </h2>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              This Construction Safety Warning may be updated from time to time to
              reflect changes in safety standards, regulations, or platform
              capabilities. The "Last updated" date at the top of this page
              reflects the most recent version.
            </p>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
              Users should review this page periodically to stay informed about any
              updates to safety warnings or guidance. Your continued use of
              Arhitekt AI after updates are posted constitutes acceptance of the
              updated warning.
            </p>
          </div>

          <div className="mb-9 md:mb-10">
            <h2 className="text-[20px] md:text-[22px] font-semibold text-white mb-3 mt-8">
              10. Contact Information
            </h2>
            <p className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)] mb-3">
              If you have questions about construction safety or AI-generated
              outputs, contact us at:
            </p>
            <ul className="list-none space-y-2 mb-3">
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Email:{" "}
                <a
                  href="mailto:safety@arhitekt.ai"
                  className="text-[#00E6CC] hover:text-[#00F5D4] underline transition-colors"
                >
                  safety@arhitekt.ai
                </a>
              </li>
              <li className="text-[15px] md:text-[16px] leading-[1.65] text-[rgba(255,255,255,0.80)]">
                Website:{" "}
                <a
                  href="https://www.arhitekt.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#00E6CC] hover:text-[#00F5D4] underline transition-colors"
                >
                  www.arhitekt.ai
                </a>
              </li>
            </ul>
          </div>
        </motion.div>
      </Container>
    </section>
  );
};

