import { motion } from "framer-motion";

export type ProcessPillarsProps = {
  /** One label per pillar; defaults to Step 1–5 */
  labels?: string[];
};

export const ProcessPillars = ({ labels }: ProcessPillarsProps) => {
  const pillars = [
    { label: labels?.[0] ?? "Step 1", height: "h-10", delay: 0 },
    { label: labels?.[1] ?? "Step 2", height: "h-20", delay: 0.2 },
    { label: labels?.[2] ?? "Step 3", height: "h-32", delay: 0.4 },
    { label: labels?.[3] ?? "Step 4", height: "h-48", delay: 0.6 },
    { label: labels?.[4] ?? "Step 5", height: "h-full", delay: 0.8 },
  ];

  return (
    <div className="flex items-end gap-2 pointer-events-none">
      {pillars.map((pillar, index) => (
        <div
          key={pillar.label}
          className="flex flex-col justify-end border border-gray-950/[.1] dark:border-gray-50/[.1] rounded-md h-64 w-20"
        >
          <motion.div
            className={`bg-gradient-to-t from-blue-400 via-blue-500 to-blue-600 ${
              index < 4 ? "rounded-b-md" : "rounded-md"
            } ${pillar.height}`}
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{
              duration: 0.8,
              delay: pillar.delay,
              ease: [0.4, 0, 0.2, 1],
            }}
            style={{ transformOrigin: "bottom" }}
          >
            <motion.p
              className="text-center text-sm text-white font-medium pt-2"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{
                duration: 0.3,
                delay: pillar.delay + 0.4,
              }}
            >
              {pillar.label}
            </motion.p>
          </motion.div>
        </div>
      ))}
    </div>
  );
};

export default ProcessPillars;
