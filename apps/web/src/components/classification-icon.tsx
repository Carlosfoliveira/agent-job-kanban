import {
  Award,
  CalendarClock,
  CircleCheck,
  CircleX,
  MailQuestionMark,
  MailWarning,
  type LucideIcon,
} from "lucide-react";
import type { EmailClassification } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ClassificationMeta {
  icon: LucideIcon;
  className: string;
  label: string;
}

const CLASSIFICATION_META: Record<EmailClassification, ClassificationMeta> = {
  confirmation: {
    icon: CircleCheck,
    className: "text-stage-applied",
    label: "Application confirmation",
  },
  action_request: {
    icon: MailWarning,
    className: "text-stage-action",
    label: "Action requested",
  },
  interview: {
    icon: CalendarClock,
    className: "text-stage-interview",
    label: "Interview",
  },
  rejection: {
    icon: CircleX,
    className: "text-stage-rejected",
    label: "Rejection",
  },
  offer: {
    icon: Award,
    className: "text-stage-offer",
    label: "Offer",
  },
  other: {
    icon: MailQuestionMark,
    className: "text-mist",
    label: "Other",
  },
};

export function ClassificationIcon({
  classification,
  size = 14,
  className,
}: {
  classification: EmailClassification | null;
  size?: number;
  className?: string;
}) {
  const meta = CLASSIFICATION_META[classification ?? "other"];
  const Icon = meta.icon;
  return (
    <span title={meta.label} className={cn("inline-flex", className)}>
      <Icon size={size} className={meta.className} aria-label={meta.label} />
    </span>
  );
}
